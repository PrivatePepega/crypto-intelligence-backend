import { mkdir, readFile, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  CryptoCvApiError,
  cryptoCvGet,
  cryptoCvPost,
  describeCryptoCvBaseUrl,
  fetchBitcoinNews,
  fetchBreaking,
  fetchDefiNews,
  fetchNews,
  fetchSearch,
  fetchTags,
  fetchTagArticles,
  fetchTrending,
  readArticles,
  unionFields,
  type CryptoCvParams,
} from "./client.js";

/**
 * Capture cryptocurrency.cv responses into `raw/`.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/captureRaw.ts [options]
 *
 *   --force            re-capture everything, ignoring what is already good
 *   --only=a,b,c       capture just these slugs
 *   --skip=a,b,c       capture everything except these slugs
 *
 * ## Skipping is the default
 *
 * The free tier rate-limits aggressively - a full sweep trips
 * `RATE_LIMIT_EXCEEDED` with `tier: "api"`, and a sweep made while limited
 * **overwrites good captures with 429 errors**. So a capture is skipped when its
 * file already exists and recorded a success. That makes re-running this script
 * cheap and safe: it repairs only what is missing or broken.
 *
 * Pass `--force` when a genuine schema change is suspected, or to refresh data
 * that is valid but stale.
 */

const RAW_DIR = "mcp/cryptocurrency.cv/raw";

/** Articles requested per call. The free tier caps the response at 3. */
const LIMIT = 5;

// --------------------------------------------------
// CLI flags
// --------------------------------------------------

const argv = process.argv.slice(2);

const flagValue = (name: string): string[] => {
  const prefix = `--${name}=`;

  const inline = argv.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length).split(",").map((s) => s.trim()).filter(Boolean);
  }

  const separate = argv.includes(`--${name}`);

  return separate ? [] : [];
};

const FORCE = argv.includes("--force");

const ONLY = flagValue("only");

const SKIP = flagValue("skip");

const shouldCapture = (slug: string): boolean => {
  if (ONLY.length > 0) {
    return ONLY.includes(slug);
  }

  return !SKIP.includes(slug);
};

/** Whether a capture file already holds a successful response. */
const isAlreadyCaptured = async (slug: string): Promise<boolean> => {
  try {
    const parsed = JSON.parse(
      await readFile(`${RAW_DIR}/${slug}.json`, "utf8"),
    ) as { ok?: boolean };

    return parsed.ok !== false;
  } catch {
    // Missing or unparseable - treat as not captured.
    return false;
  }
};

/**
 * Picks a fetchable article URL from an existing capture.
 *
 * `/api/news/extract` and `/api/article` both need a real article URL.
 * `/api/news/extract` returns `Failed to fetch URL` for pages that are not
 * articles, so chart and explorer pages are filtered out.
 */
const pickArticleUrl = async (): Promise<string> => {
  for (const slug of ["search", "news"]) {
    try {
      const capture = JSON.parse(
        await readFile(`${RAW_DIR}/${slug}.json`, "utf8"),
      ) as { response?: { articles?: { link?: string }[] } };

      const url = capture.response?.articles?.find(
        (article) =>
          typeof article.link === "string" &&
          /^https:\/\//.test(article.link) &&
          !/tradingview|etherscan|explorer/.test(article.link),
      )?.link;

      if (url) {
        return url;
      }
    } catch {
      // Try the next source.
    }
  }

  return "";
};

// --------------------------------------------------
// Targets
// --------------------------------------------------

interface Target {
  slug: string;
  label: string;
  params: CryptoCvParams;
  call: () => Promise<unknown>;
}

/**
 * Endpoints still to capture.
 *
 * Scoped to what `raw/` currently holds but has not yet filled. Three captures
 * were removed as out of scope (`news`, `news-category-bitcoin`, `bitcoin`) and
 * three already hold good data (`trending`, `article`, `news-extract`), so
 * none of those are requested here. The account is rate-limited, so a needless
 * call costs the whole sweep.
 *
 * Add a target back when its capture is removed and the endpoint is wanted
 * again.
 */
const TARGETS: Target[] = [
  {
    slug: "defi",
    label: "GET /api/defi",
    params: { limit: LIMIT },
    call: () => fetchDefiNews({ limit: LIMIT }),
  },
  {
    slug: "breaking",
    label: "GET /api/breaking",
    params: { limit: LIMIT },
    call: () => fetchBreaking({ limit: LIMIT }),
  },
  {
    slug: "search",
    label: "GET /api/search?q=bitcoin",
    params: { q: "bitcoin", limit: LIMIT },
    call: () => fetchSearch({ q: "bitcoin", limit: LIMIT }),
  },
  {
    slug: "search-semantic",
    label: "POST /api/search/semantic (reranker)",
    params: {},
    call: () =>
      cryptoCvPost("/api/search/semantic", {}, {
        query: "US regulation of crypto",
        articles: [
          {
            title: "SEC approves spot Bitcoin ETF",
            description: "Regulator approved the first spot bitcoin ETF.",
          },
          {
            title: "Treasury stablecoin rules",
            description: "New stablecoin framework published by the Treasury.",
          },
          {
            title: "Dogecoin community hosts meetup",
            description: "Local dogecoin holders gathered for pizza.",
          },
        ],
      }),
  },
  {
    slug: "search-semantic-get",
    label: "GET /api/search/semantic (documented form, returns 405)",
    params: { q: "US regulation of crypto", limit: LIMIT },
    call: () =>
      cryptoCvGet("/api/search/semantic", {
        q: "US regulation of crypto",
        limit: LIMIT,
      }),
  },
  {
    slug: "tags",
    label: "GET /api/tags (metadata, kept un-normalized)",
    params: { limit: LIMIT },
    call: () => fetchTags({ limit: LIMIT }),
  },
  {
    slug: "tags-bitcoin",
    label: "GET /api/tags/bitcoin",
    params: { slug: "bitcoin", limit: LIMIT },
    call: () => fetchTagArticles("bitcoin", { limit: LIMIT }),
  },
];

// --------------------------------------------------
// Capture
// --------------------------------------------------

/** Writes a successful capture. */
const writeCapture = async (
  target: Target,
  payload: unknown,
  elapsed: number,
): Promise<{ records: number; fields: string[] }> => {
  const articles = readArticles(payload);
  const fields = unionFields(articles);

  await writeFile(
    `${RAW_DIR}/${target.slug}.json`,
    JSON.stringify(
      {
        label: target.label,
        capturedAt: new Date().toISOString(),
        elapsedMs: elapsed,
        params: target.params,
        recordCount: articles.length,
        fieldCount: fields.length,
        fields,
        response: payload,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { records: articles.length, fields };
};

/** Writes a failed capture, so the failure is on record rather than silent. */
const writeFailure = (
  slug: string,
  label: string,
  params: CryptoCvParams,
  error: unknown,
): void => {
  void writeFile(
    `${RAW_DIR}/${slug}.json`,
    JSON.stringify(
      {
        label,
        capturedAt: new Date().toISOString(),
        ok: false,
        params,
        httpStatus: error instanceof CryptoCvApiError ? error.status : null,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
    "utf8",
  );
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("cryptocurrency.cv RAW CAPTURE");
  console.log("=".repeat(70));
  console.log(`  base url : ${describeCryptoCvBaseUrl()}`);
  console.log(`  auth     : none required`);
  console.log(`  mode     : ${FORCE ? "FORCE (re-capture all)" : "skip already-captured"}`);

  if (ONLY.length > 0) {
    console.log(`  only     : ${ONLY.join(", ")}`);
  }

  if (SKIP.length > 0) {
    console.log(`  skip     : ${SKIP.join(", ")}`);
  }

  await mkdir(RAW_DIR, { recursive: true });

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of TARGETS) {
    if (!shouldCapture(target.slug)) {
      skipped += 1;

      console.log(`\n  ${target.label}`);
      console.log("    SKIP  excluded by --skip");

      continue;
    }

    if (!FORCE && (await isAlreadyCaptured(target.slug))) {
      skipped += 1;

      console.log(`\n  ${target.label}`);
      console.log("    SKIP  already captured (use --force to refresh)");

      continue;
    }

    console.log(`\n  ${target.label}`);

    const startedAt = Date.now();

    try {
      const payload = await target.call();

      const elapsed = Date.now() - startedAt;

      const { records, fields } = await writeCapture(
        target,
        payload,
        elapsed,
      );

      captured += 1;

      console.log(
        `    OK ${elapsed}ms  ${JSON.stringify(payload).length} chars  ` +
          `articles=${records}  fields=${fields.length}`,
      );
    } catch (error) {
      failed += 1;

      const isApiError = error instanceof CryptoCvApiError;

      const message =
        error instanceof Error ? error.message : String(error);

      console.log(
        `    ${isApiError ? "REFUSED" : "ERROR"} ${message.replace(/\s+/g, " ").slice(0, 180)}`,
      );

      writeFailure(target.slug, target.label, target.params, error);
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`  captured : ${captured}`);
  console.log(`  skipped  : ${skipped}`);
  console.log(`  failed   : ${failed}`);
  console.log(`  dir      : ${RAW_DIR}/`);
  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");
  console.error("CAPTURE FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});