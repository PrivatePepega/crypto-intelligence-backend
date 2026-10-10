/**
 * GDELT probe 00 - reachability and rate-limit characterisation.
 *
 * First question before any tooling exists: is api.gdeltproject.org reachable
 * from this machine, does it need a key, and does it rate-limit?
 *
 * Writes nothing to disk on failure - the point is the answer, not the artifact.
 */

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

type Attempt = {
  label: string;
  url: string;
  headers: Record<string, string>;
};

const attempts: Attempt[] = [
  {
    label: "artlist json, no headers",
    url: `${BASE}?query=bitcoin&mode=artlist&maxrecords=3&format=json`,
    headers: {},
  },
  {
    label: "artlist json, browser UA",
    url: `${BASE}?query=bitcoin&mode=artlist&maxrecords=3&format=json`,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; gdelt-probe/0.1)" },
  },
  {
    label: "timelinevol json",
    url: `${BASE}?query=bitcoin&mode=timelinevol&format=json`,
    headers: {},
  },
  {
    label: "artlist html (no format=json)",
    url: `${BASE}?query=bitcoin&mode=artlist&maxrecords=3`,
    headers: {},
  },
  {
    label: "invalid mode (error shape probe)",
    url: `${BASE}?query=bitcoin&mode=notamode&format=json`,
    headers: {},
  },
];

const TIMEOUT_MS = 45_000;

for (const attempt of attempts) {
  process.stdout.write(`\n--- ${attempt.label}\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(attempt.url, {
      headers: attempt.headers,
      signal: controller.signal,
    });

    const elapsed = Date.now() - startedAt;
    const body = await response.text();

    process.stdout.write(
      `    HTTP ${response.status} ${response.statusText}  ${elapsed}ms  ${body.length} bytes\n`,
    );
    process.stdout.write(`    content-type: ${response.headers.get("content-type")}\n`);
    process.stdout.write(`    body: ${body.slice(0, 500).replace(/\n/g, "\\n")}\n`);
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    process.stdout.write(
      `    THREW after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  } finally {
    clearTimeout(timer);
  }

  // Space requests out; GDELT is a free public service and we are probing it.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
