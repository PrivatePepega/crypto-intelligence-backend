import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { GdeltApiError, GDELT_MAX_RECORDS, requestDoc } from "./gdeltClient.js";

/**
 * Client test suite - runs against a local server, never against GDELT.
 *
 * The live endpoint throttles this machine hard enough that it cannot be used
 * as a test fixture: a 90-second cooldown still returned HTTP 429, and a burst
 * produced socket-level refusals. Every behaviour worth testing - empty results,
 * non-JSON bodies, rate limits, bad queries, timeouts - can be reproduced
 * locally and deterministically, which is both faster and more honest than
 * hoping a live call misbehaves on demand.
 *
 * Run:
 * ```
 * npx tsx "utils/AI/gdelt tesing area/api/gdeltClient.test.ts"
 * ```
 *
 * Exits non-zero if anything fails, so it works as a check.
 */

let passed = 0;

let failed = 0;

/** Records one assertion and prints its outcome. */
const check = (label: string, condition: boolean, detail = ""): void => {
  if (condition) {
    passed += 1;

    process.stdout.write(`    PASS  ${label}\n`);
  } else {
    failed += 1;

    process.stdout.write(`    FAIL  ${label}${detail === "" ? "" : ` -> ${detail}`}\n`);
  }
};

/** Section heading. */
const section = (title: string): void => {
  process.stdout.write(`\n${"-".repeat(70)}\n${title}\n${"-".repeat(70)}\n`);
};

/** Per-behaviour state, keyed by the marker in the query string. */
const requestCounts = new Map<string, number>();

/** A representative article, using the field names GDELT documents. */
const ARTICLE = {
  url: "https://example.com/news/story-1",
  url_mobile: "",
  title: "Example headline one",
  seendate: "20261010T120000Z",
  socialimage: "https://example.com/img1.jpg",
  domain: "example.com",
  language: "English",
  sourcecountry: "United States",
};

/** Builds the local stand-in for the GDELT endpoint. */
const buildServer = (): Server =>
  createServer((request, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    // The DOC path must match what the client calls.
    if (url.pathname !== "/api/v2/doc/doc") {
      response.writeHead(404, { "Content-Type": "text/plain" });

      response.end("not found");

      return;
    }

    const marker = url.searchParams.get("query") ?? "default";

    const seen = (requestCounts.get(marker) ?? 0) + 1;

    requestCounts.set(marker, seen);

    const sendJson = (payload: unknown): void => {
      const body = JSON.stringify(payload);

      response.writeHead(200, { "Content-Type": "application/json" });

      response.end(body);
    };

    switch (marker) {
      // Well-formed article response.
      case "ok":
        sendJson({ articles: [ARTICLE] });

        return;

      // GDELT's real "nothing matched" answer: HTTP 200 with a literal `{}`.
      // Verified live - two bytes, no `articles` key.
      case "empty":
        sendJson({});

        return;

      // GDELT serving its HTML page on a 200.
      case "html":
        response.writeHead(200, { "Content-Type": "text/html" });

        response.end("<!DOCTYPE html><html><body>GDELT error page</body></html>");

        return;

      // Rate limited on the first call, healthy afterwards.
      case "rateonce":
        if (seen === 1) {
          response.writeHead(429, { "Content-Type": "text/plain" });

          response.end("Please limit requests to one every 5 seconds or contact ...");

          return;
        }

        sendJson({ articles: [ARTICLE] });

        return;

      // Permanently rate limited, to exhaust the retry schedule.
      case "ratesticky":
        response.writeHead(429, { "Content-Type": "text/plain" });

        response.end("Please limit requests to one every 5 seconds or contact ...");

        return;

      // A malformed query. Must NOT be retried - retrying cannot help.
      case "badquery":
        response.writeHead(400, { "Content-Type": "text/plain" });

        response.end("The syntax of your query is invalid.");

        return;

      // Never responds, to exercise the client timeout.
      case "slow":
        // Intentionally never ends the response.
        return;

      default:
        sendJson({ articles: [] });
    }
  });

const run = async (): Promise<void> => {
  process.stdout.write(
    `\n${"=".repeat(70)}\nGDELT DOC CLIENT TEST SUITE (local server)\n${"=".repeat(70)}\n`,
  );

  const server = buildServer();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  process.stdout.write(`\n  local stand-in on 127.0.0.1:${address.port}\n`);

  // The client reads configuration lazily at call time, so overriding here is
  // enough. Retries are shortened so the suite runs in seconds, not minutes.
  process.env.GDELT_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.GDELT_MIN_GAP_MS = "0";
  process.env.GDELT_RETRY_BACKOFF_MS = "0,10,20";
  process.env.GDELT_TIMEOUT_MS = "1500";

  // ----------------------------------------------------------
  section("1. Successful response");
  // ----------------------------------------------------------

  {
    const result = await requestDoc({ query: "ok", mode: "artlist", maxrecords: 5 });

    const payload = result.data as { articles?: unknown[] };

    check("returns parsed JSON", typeof result.data === "object");

    check(
      "articles are present",
      Array.isArray(payload.articles) && payload.articles.length === 1,
      `got ${JSON.stringify(payload).slice(0, 80)}`,
    );

    check("reports a request URL for provenance", result.url.includes("mode=artlist"));

    check("attempts is 1 when no retry is needed", result.attempts === 1);
  }

  // ----------------------------------------------------------
  section("2. Empty result - the silent-empty trap");
  // ----------------------------------------------------------

  {
    const result = await requestDoc({ query: "empty", mode: "artlist" });

    const payload = result.data as Record<string, unknown>;

    check("HTTP 200 with {} is not an error", result.attempts === 1);

    check(
      "body parses to an empty object",
      Object.keys(payload).length === 0,
      `keys: ${Object.keys(payload).join(",")}`,
    );

    check(
      "no 'articles' key is invented",
      !("articles" in payload),
      "a normalizer must not read a missing key as an empty list without flagging it",
    );

    process.stdout.write(
      `    NOTE  {} is GDELT's "no results" answer. A normalizer MUST treat this` +
        `\n          as an explicit zero rather than defaulting to a fabricated shape.\n`,
    );
  }

  // ----------------------------------------------------------
  section("3. Malformed response - non-JSON body");
  // ----------------------------------------------------------

  {
    let caught: GdeltApiError | null = null;

    try {
      await requestDoc({ query: "html", mode: "artlist" });
    } catch (error) {
      caught = error as GdeltApiError;
    }

    check("a 200 with HTML is rejected", caught !== null);

    check(
      "error names the non-JSON problem",
      caught?.message.includes("non-JSON") ?? false,
      caught?.message,
    );

    check(
      "the HTML body is preserved for diagnosis",
      caught?.body.includes("GDELT error page") ?? false,
      caught?.body.slice(0, 60),
    );
  }

  // ----------------------------------------------------------
  section("4. Rate limiting");
  // ----------------------------------------------------------

  {
    const result = await requestDoc({ query: "rateonce", mode: "artlist" });

    check("recovers after a single 429", result.attempts === 2, `attempts=${result.attempts}`);
  }

  {
    let caught: GdeltApiError | null = null;

    try {
      await requestDoc({ query: "ratesticky", mode: "artlist" });
    } catch (error) {
      caught = error as GdeltApiError;
    }

    check("gives up after the retry schedule", caught !== null);

    check("reports HTTP 429", caught?.status === 429, `status=${caught?.status}`);

    check(
      "preserves GDELT's plain-text explanation",
      caught?.body.includes("limit requests to one every 5 seconds") ?? false,
      caught?.body.slice(0, 60),
    );

    check(
      "attempts match the configured schedule",
      requestCounts.get("ratesticky") === 3,
      `server saw ${requestCounts.get("ratesticky")} requests, expected 3`,
    );
  }

  // ----------------------------------------------------------
  section("5. A bad query must NOT be retried");
  // ----------------------------------------------------------

  {
    let caught: GdeltApiError | null = null;

    try {
      await requestDoc({ query: "badquery", mode: "artlist" });
    } catch (error) {
      caught = error as GdeltApiError;
    }

    check("a 400 fails immediately", caught?.status === 400, `status=${caught?.status}`);

    check(
      "the server was called exactly once",
      requestCounts.get("badquery") === 1,
      `server saw ${requestCounts.get("badquery")} requests`,
    );

    check(
      "the upstream message is preserved",
      caught?.body.includes("syntax of your query is invalid") ?? false,
      caught?.body.slice(0, 60),
    );
  }

  // ----------------------------------------------------------
  section("6. Timeout");
  // ----------------------------------------------------------

  {
    const startedAt = Date.now();

    let caught: GdeltApiError | null = null;

    try {
      await requestDoc({ query: "slow", mode: "artlist" });
    } catch (error) {
      caught = error as GdeltApiError;
    }

    const elapsed = Date.now() - startedAt;

    check("a hung request times out", caught !== null);

    check("the error says so", caught?.message.includes("timed out") ?? false, caught?.message);

    check(
      `it actually waited (${elapsed}ms, timeout 1500ms)`,
      elapsed >= 1400 && elapsed < 6000,
      `${elapsed}ms`,
    );
  }

  // ----------------------------------------------------------
  section("7. Parameter validation - no request should be sent");
  // ----------------------------------------------------------

  const validationCases: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    ["empty query rejected", () => requestDoc({ query: "   ", mode: "artlist" })],
    [
      "unsupported mode rejected",
      () =>
        requestDoc({
          query: "ok",
          mode: "notamode" as unknown as "artlist",
        }),
    ],
    [
      `maxrecords above ${GDELT_MAX_RECORDS} rejected`,
      () => requestDoc({ query: "ok", mode: "artlist", maxrecords: 500 }),
    ],
    [
      "maxrecords below 1 rejected",
      () => requestDoc({ query: "ok", mode: "artlist", maxrecords: 0 }),
    ],
    [
      "timespan together with startdatetime rejected",
      () =>
        requestDoc({
          query: "ok",
          mode: "artlist",
          timespan: "24h",
          startdatetime: "20261008120000",
        }),
    ],
    [
      "malformed startdatetime rejected",
      () =>
        requestDoc({
          query: "ok",
          mode: "artlist",
          startdatetime: "2026-10-08",
        }),
    ],
  ];

  // Validation must fail before any socket is opened, so the count of requests
  // reaching the server must not move across this block.
  const requestsBefore = requestCounts.get("ok") ?? 0;

  for (const [label, attempt] of validationCases) {
    let caught: GdeltApiError | null = null;

    try {
      await attempt();
    } catch (error) {
      caught = error as GdeltApiError;
    }

    check(
      label,
      caught !== null && caught.status === 0,
      caught === null ? "no error thrown" : `status=${caught.status}`,
    );
  }

  check(
    "validation failures sent no HTTP requests",
    (requestCounts.get("ok") ?? 0) === requestsBefore,
    `${requestsBefore} -> ${requestCounts.get("ok") ?? 0}`,
  );

  // ----------------------------------------------------------
  section("8. Article-only parameters are withheld from timelines");
  // ----------------------------------------------------------

  {
    const result = await requestDoc({
      query: "ok",
      mode: "timelinevol",
      maxrecords: 25,
      sort: "datedesc",
    });

    check("timeline request built", result.attempts === 1);

    check(
      "maxrecords is NOT sent to a timeline mode",
      !result.url.includes("maxrecords"),
      result.url,
    );

    check("sort is NOT sent to a timeline mode", !result.url.includes("sort="), result.url);
  }

  {
    const result = await requestDoc({
      query: "ok",
      mode: "artlist",
      maxrecords: 7,
      sort: "datedesc",
    });

    check("maxrecords IS sent to artlist", result.url.includes("maxrecords=7"));

    check("sort IS sent to artlist", result.url.includes("sort=datedesc"));
  }

  // ----------------------------------------------------------
  section("9. Request serialisation");
  // ----------------------------------------------------------

  {
    process.env.GDELT_MIN_GAP_MS = "150";

    const startedAt = Date.now();

    await Promise.all([
      requestDoc({ query: "ok", mode: "artlist" }),
      requestDoc({ query: "ok", mode: "artlist" }),
      requestDoc({ query: "ok", mode: "artlist" }),
    ]);

    const elapsed = Date.now() - startedAt;

    process.env.GDELT_MIN_GAP_MS = "0";

    // Three serialised requests with a 150ms gap take at least 300ms.
    check(
      `three concurrent calls were serialised (${elapsed}ms, expected >=300)`,
      elapsed >= 300,
      `${elapsed}ms`,
    );
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  // ----------------------------------------------------------
  process.stdout.write(
    `\n${"=".repeat(70)}\n${passed} passed, ${failed} failed\n${"=".repeat(70)}\n`,
  );

  process.exitCode = failed === 0 ? 0 : 1;
};

await run();
