import fs from "node:fs/promises";
import path from "node:path";

import {
  findStockApiPayloadProblems,
  type StockIntelligenceResponse,
} from "../types/stocks/api.types.js";

/**
 * Captures the stock intelligence endpoint response as a demo fixture.
 *
 * The fixture is always produced from a decoded response object and written
 * with `JSON.stringify`, never by hand-assembling JSON text. Before anything is
 * written the payload is validated against the public contract, and after the
 * write the file is re-read from disk and validated again so a BOM, truncated
 * write or mixed-in log line cannot silently produce an unparseable fixture.
 *
 * Usage:
 *   npx tsx scripts/captureStockApiResponse.ts AAPL
 *   npx tsx scripts/captureStockApiResponse.ts AAPL --base-url=http://localhost:5000
 *   npx tsx scripts/captureStockApiResponse.ts AAPL --from=collectors/assets/data/stocks_intelligence_AAPL_<ts>.json
 *
 * Options:
 *   --base-url=<url>  Server origin to call. Default: http://localhost:5000
 *   --from=<path>     Re-serialize an existing route dump instead of calling the API.
 *   --out=<path>      Output path. Default: collectors/assets/data/stocks_endpoint_demo_<TICKER>.json
 */

const DATA_DIR = path.resolve(process.cwd(), "collectors/assets/data");

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];

for (const arg of args) {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  if (match) {
    flags.set(match[1]!, match[2]!);
  } else if (arg.startsWith("--")) {
    console.error(`Unknown flag: ${arg}`);
    process.exit(1);
  } else {
    positional.push(arg);
  }
}

const ticker = (positional[0] ?? "AAPL").trim().toUpperCase();
const baseUrl = (flags.get("base-url") ?? "http://localhost:5000").replace(/\/+$/, "");
const sourcePath = flags.get("from");
const outputPath = path.resolve(
  process.cwd(),
  flags.get("out") ?? path.join("collectors/assets/data", `stocks_endpoint_demo_${ticker}.json`),
);

/** Minimal response shape so this script does not depend on DOM or undici types. */
interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type FetchLike = (url: string) => Promise<FetchResponse>;

/**
 * Parses JSON text and reports the failing offset next to the message. A UTF-8
 * BOM is called out explicitly because `JSON.parse` rejects it with a message
 * that does not mention the BOM.
 */
function parseJson(text: string, label: string): unknown {
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(
      `${label} starts with a UTF-8 BOM (U+FEFF). Write fixtures with JSON.stringify + fs.writeFile, not PowerShell Set-Content.`,
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = /position (\d+)/.exec(message)?.[1];
    throw new Error(
      `${label} is not valid JSON${position ? ` at position ${position}` : ""}: ${message}`,
    );
  }
}

async function resolvePayload(): Promise<{ payload: unknown; origin: string }> {
  if (sourcePath) {
    const absolute = path.resolve(process.cwd(), sourcePath);
    const text = await fs.readFile(absolute, "utf8");
    return { payload: parseJson(text, absolute), origin: `file ${absolute}` };
  }

  const url = `${baseUrl}/api-v1/stocks/${encodeURIComponent(ticker)}?readOnly=true`;
  const fetchImpl = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!fetchImpl) {
    throw new Error("This Node.js runtime has no global fetch(). Use --from=<file> instead.");
  }

  const response = await fetchImpl(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  return { payload: parseJson(text, `response from ${url}`), origin: url };
}

async function main(): Promise<void> {
  const { payload, origin } = await resolvePayload();
  console.log(`Source: ${origin}`);

  const problems = findStockApiPayloadProblems(payload);
  if (problems.length > 0) {
    console.error("Refusing to write: payload does not match the API contract.");
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  const typed = payload as StockIntelligenceResponse;
  const text = `${JSON.stringify(typed, null, 2)}\n`;

  // Validate the exact bytes that are about to land on disk.
  const serialized = parseJson(text, "serialized payload");
  const serializedProblems = findStockApiPayloadProblems(serialized);
  if (serializedProblems.length > 0) {
    console.error("Refusing to write: serialized payload lost contract fields.");
    for (const problem of serializedProblems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, text, "utf8");

  // Re-read from disk so encoding problems surface here, not in the frontend.
  const bytes = await fs.readFile(outputPath);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`Wrote a UTF-8 BOM to ${outputPath}`);
  }
  const written = parseJson(bytes.toString("utf8"), outputPath);
  const writtenProblems = findStockApiPayloadProblems(written);
  if (writtenProblems.length > 0) {
    throw new Error(`Re-read payload is invalid: ${writtenProblems.join("; ")}`);
  }

  const metadata = typed.metadata;
  console.log(`Wrote ${bytes.length} bytes to ${outputPath}`);
  console.log(
    `Ticker: ${typed.identity.ticker} | assetId: ${typed.identity.assetId} | ` +
      `insider: ${typed.insiderTransactions.length} | 13F: ${typed.institutionalHoldings.length} | ` +
      `13D/G: ${typed.beneficialOwnership.length} | corporate: ${typed.corporateActions.length}`,
  );
  console.log(
    `Datasets: ${metadata.datasets.map((entry) => `${entry.dataset}:${entry.status}`).join(", ")}`,
  );
  console.log(
    `Warnings: ${metadata.warnings.length} | Errors: ${metadata.errors.length} | ` +
      `readOnly: ${metadata.readOnly} | refresh: ${metadata.refresh}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/** Kept for readability when scanning the data directory. */
export const CAPTURE_OUTPUT_DIR = DATA_DIR;
