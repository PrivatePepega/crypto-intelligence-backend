import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Triggers every tool in `AI/tools` and dumps each one's responses to JSON.
 *
 * Purpose is inspection, not consumption: the output is meant to be read so the
 * response **shape**, **quality** and **quantity** of each tool can be compared
 * side by side, and so each one can be judged for whether it needs to be locked
 * to a domain.
 *
 * ## Coverage
 *
 * Tools are discovered by importing every module in `AI/tools` and picking out
 * anything exposing a Zod `inputSchema` plus `execute`. Nothing is hardcoded by
 * filename, so a new tool is picked up automatically.
 *
 * Two classes of tool are handled differently:
 *
 *  - **Search tools** take a domain and are run once per domain, so the same tool
 *    can be judged on whether it returns general coverage or only niche results.
 *  - **Feed tools** take no meaningful input and are run once.
 *
 * ## Domains
 *
 * Six broad areas first, then two deliberately narrow ones to expose whether a
 * tool degrades gracefully or collapses when the query narrows:
 *
 *   geopolitics, financial markets, macro, commodities energy,
 *   crypto, ai technology, then bitcoin, ethereum
 *
 * ## Safety
 *
 * Every argument set is validated through the tool's **own** schema before
 * `execute`, so a bad mapping fails loudly for that one domain instead of
 * silently sending nonsense upstream. Failures are captured per domain and the
 * run continues.
 *
 * Inputs are **not** run through the schema-default path the agent uses; the
 * mapping supplies every value explicitly so each file is self-describing.
 *
 * Run: npx tsx utils/AI/exposeToolData.ts
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(MODULE_DIR, "../..");

const TOOLS_DIR = path.join(REPO_ROOT, "AI/tools");

/** One file per tool, alongside the other exports. */
const OUTPUT_DIR = path.join(MODULE_DIR, "data/tools");

/** Broad areas first, then narrow ones to test how a tool degrades. */
const DOMAINS = [
  "geopolitics",
  "financial markets",
  "macro",
  "commodities energy",
  "crypto",
  "ai technology",
  "bitcoin",
  "ethereum",
] as const;

type Domain = (typeof DOMAINS)[number];

/**
 * How each search tool expresses a domain.
 *
 * Explicit and hand-written, because the mapping cannot be derived - every tool
 * names its text parameter differently and several take an enum instead of free
 * text. Guessing would produce calls that either fail validation or silently
 * test the wrong thing.
 */
type ArgsBuilder = (domain: Domain) => Record<string, unknown> | null;

/**
 * Per-tool argument mapping. A tool absent from this map is treated as a feed.
 *
 * A builder returns `null` for a domain it cannot meaningfully express, and the
 * domain is skipped rather than sent as a fabricated value.
 */
const SEARCH_ARGS: Record<string, ArgsBuilder> = {
  currentsNewsSearch: (domain) => ({ keywords: domain }),

  cvSearch: (domain) => ({ q: domain }),

  // Every cryptocurrency.cv tag is crypto-specific, so non-crypto domains have
  // no equivalent slug. Derived slugs such as "financial-markets" return 404.
  cvArticlesTags: (domain) => {
    const slugByDomain: Record<string, string> = {
      crypto: "bitcoin",
      bitcoin: "bitcoin",
      ethereum: "ethereum",
      "ai technology": "ai-crypto",
    };

    const slug = slugByDomain[domain];

    return slug ? { slug } : null;
  },

  gdeltSearchEvents: (domain) => ({
    // The tool's topic enum is fixed, so the domain goes in the free-text query.
    topic: "geopolitics",
    query: domain,
    days: 1,
  }),

  gdeltSearchStories: (domain) => ({
    topic: "geopolitics",
    query: domain,
    days: 1,
  }),

  getCurrentIndicatorData: (domain) => ({
    query: `current ${domain} data`,
  }),

  marketauxNewsSearch: (domain) => ({
    search: domain,
    group_similar: true,
  }),

  newsDataLatestNews: (domain) => ({ q: domain }),

  newsDataMarketNews: (domain) => ({ q: domain }),

  newsDataCryptoNews: (domain) => ({ q: domain }),

  newsflashGetEvents: (domain) => ({ q: domain }),

  newsflashSearchArticles: (domain) => ({ q: domain }),

  newsMarketsNewsTool: (domain) => ({ category: "business" }),

  webSearchTool: (domain) => ({ query: domain }),
};

/** A discovered tool, plus whether it takes a domain. */
type DiscoveredTool = {
  name: string;
  file: string;
  tool: {
    inputSchema?: {
      safeParse?: (value: unknown) => {
        success: boolean;
        data?: unknown;
        error?: unknown;
      };
    };
    execute?: (
      input: never,
      options: { toolCallId: string; messages: unknown[] },
    ) => Promise<unknown>;
  };
  kind: "search" | "feed";
  args: ArgsBuilder | null;
};

/** Anything with a Zod schema and an execute is a tool. */
const looksLikeTool = (value: unknown): value is DiscoveredTool["tool"] =>
  Boolean(
    value &&
      typeof value === "object" &&
      "inputSchema" in value &&
      "execute" in value,
  );

/** Imports every module in AI/tools and collects its tools. */
const discoverTools = async (): Promise<DiscoveredTool[]> => {
  const files = (await fs.readdir(TOOLS_DIR)).filter((f) => f.endsWith(".ts"));

  const found: DiscoveredTool[] = [];

  for (const file of files) {
    const modulePath = path.join(TOOLS_DIR, file);

    let loaded: Record<string, unknown>;

    try {
      // Node's ESM loader rejects a bare Windows path ("Only URLs with a scheme
      // in: file, data, and node are supported"), so the import needs a file://
      // URL. Passing the path directly silently skipped every tool.
      loaded = (await import(pathToFileURL(modulePath).href)) as Record<
        string,
        unknown
      >;
    } catch (error) {
      console.log(`  ! ${file}: import failed - ${(error as Error).message.slice(0, 90)}`);
      continue;
    }

    const base = file.replace(/\.ts$/, "");

    for (const [exportName, exported] of Object.entries(loaded)) {
      // Some modules export a wrapper object holding one or more tools.
      const candidates = looksLikeTool(exported)
        ? [[exportName, exported] as const]
        : exported && typeof exported === "object"
          ? Object.entries(exported as Record<string, unknown>).filter(
              ([, inner]) => looksLikeTool(inner),
            )
          : [];

      for (const [key, tool] of candidates) {
        const name = exportName === "default" ? base : exportName;
        const lookup = name === base ? key : name;

        found.push({
          name: file.replace(/\.ts$/, ""),
          file: `${file}#${lookup}`,
          tool: tool as DiscoveredTool["tool"],
          kind: SEARCH_ARGS[file.replace(/\.ts$/, "")] ? "search" : "feed",
          args: SEARCH_ARGS[file.replace(/\.ts$/, "")] ?? null,
        });
      }
    }
  }

  // Deduplicate: a wrapper export can yield the same tool twice.
  const seen = new Set<string>();

  return found.filter((entry) => {
    const key = `${entry.name}:${entry.file}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

type RunRecord = {
  domain: Domain;
  ok: boolean;
  elapsedMs: number;
  args: Record<string, unknown>;
  /** Populated when `ok` is false. */
  error?: string;
  /** Response shape summary. */
  shape: {
    kind: string;
    recordCount: number | null;
    containerKey: string | null;
    recordKeys: string[] | null;
    topLevelKeys: string[] | null;
    charCount: number;
    empty: boolean;
  };
  response: unknown;
};

/** Container keys probed when summarising a payload's shape. */
const CONTAINER_KEYS = [
  "items",
  "data",
  "results",
  "articles",
  "events",
  "stories",
  "headlines",
  "titles",
  "indicators",
];

const unionOfKeys = (records: unknown[]): string[] => {
  const keys = new Set<string>();

  records.slice(0, 5).forEach((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      Object.keys(entry as object).forEach((key) => keys.add(key));
    }
  });

  return [...keys];
};

const describeShape = (value: unknown): RunRecord["shape"] => {
  const charCount = JSON.stringify(value ?? null)?.length ?? 0;

  if (Array.isArray(value)) {
    return {
      kind: "array",
      recordCount: value.length,
      containerKey: null,
      topLevelKeys: null,
      recordKeys: unionOfKeys(value),
      charCount,
      empty: value.length === 0,
    };
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;

    const topLevelKeys = Object.keys(source);

    const containerKey =
      CONTAINER_KEYS.find((key) => Array.isArray(source[key])) ?? null;

    if (containerKey) {
      const records = source[containerKey] as unknown[];

      return {
        kind: "object",
        recordCount: records.length,
        containerKey,
        topLevelKeys,
        recordKeys: unionOfKeys(records),
        charCount,
        empty: records.length === 0,
      };
    }

    return {
      kind: "object",
      recordCount: null,
      containerKey: null,
      topLevelKeys,
      recordKeys: null,
      charCount,
      empty: topLevelKeys.length === 0,
    };
  }

  return {
    kind: value === null ? "null" : typeof value,
    recordCount: null,
    containerKey: null,
    topLevelKeys: null,
    recordKeys: null,
    charCount,
    empty: value === null || value === undefined,
  };
};

const runOnce = async (
  entry: DiscoveredTool,
  domain: Domain | null,
): Promise<RunRecord | null> => {
  const built = domain && entry.args ? entry.args(domain) : {};

  // A builder returning null means "this tool cannot express this domain".
  if (built === null) {
    return null;
  }

  let args: Record<string, unknown> = built;

  const startedAt = Date.now();

  let response: unknown = null;

  let error: string | undefined;

  try {
    if (typeof entry.tool.execute !== "function") {
      throw new Error("tool exposes no execute()");
    }

    // Validate through the tool's own schema before calling upstream.
    const validate = entry.tool.inputSchema?.safeParse;

    if (validate) {
      const parsed = validate(args);

      if (!parsed.success) {
        throw new Error(
          `rejected by inputSchema: ${JSON.stringify(parsed.error).slice(0, 200)}`,
        );
      }

      args = parsed.data as Record<string, unknown>;
    }

    response = await entry.tool.execute(args as never, {
      toolCallId: `expose-${entry.name}-${domain ?? "feed"}`,
      messages: [],
    });
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }

  return {
    domain: domain ?? ("feed" as Domain),
    ok: error === undefined,
    elapsedMs: Date.now() - startedAt,
    args,
    ...(error ? { error } : {}),
    shape: describeShape(error === undefined ? response : null),
    response: error === undefined ? response : null,
  };
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("TOOL DATA EXPOSURE");
  console.log("=".repeat(70));

  const only = process.argv.slice(2);

  const discovered = await discoverTools();

  const tools = only.length
    ? discovered.filter((t) => only.includes(t.name))
    : discovered;

  if (tools.length === 0) {
    console.error(`  No tools matched: ${only.join(", ")}`);
    console.error(`  Available: ${[...new Set(discovered.map((t) => t.name))].join(", ")}`);
    process.exit(1);
  }

  const searchCount = tools.filter((t) => t.kind === "search").length;

  console.log(`  tools discovered : ${tools.length}`);
  console.log(`  search tools     : ${searchCount}`);
  console.log(`  feed tools       : ${tools.length - searchCount}`);
  console.log(`  domains          : ${DOMAINS.length}`);

  // An empty sweep is a broken sweep, not a clean result - the previous run
  // exited 0 having written nothing because every dynamic import had failed.
  if (tools.length === 0) {
    console.error("");
    console.error("  No tools discovered - nothing was exported.");
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const summary: {
    tool: string;
    file: string;
    kind: string;
    runs: number;
    ok: number;
    empty: number;
    totalRecords: number;
  }[] = [];

  for (const entry of tools) {
    const runs: RunRecord[] = [];

    const labels: (Domain | null)[] =
      entry.kind === "search" ? [...DOMAINS] : [null];

    console.log("");
    console.log(`  ${entry.name}  (${entry.kind})`);

    for (const label of labels) {
      const record = await runOnce(entry, label);

      if (!record) {
        console.log(`    ${(label ?? "feed").padEnd(20)} skipped - not applicable`);
        continue;
      }

      runs.push(record);

      console.log(
        `    ${(label ?? "feed").padEnd(20)} ${record.ok ? "ok  " : "FAIL"} ` +
          `${String(record.elapsedMs).padStart(6)}ms  ` +
          `records=${record.shape.recordCount ?? "-"}` +
          `${record.shape.empty ? "  EMPTY" : ""}` +
          `${record.error ? "  " + record.error.replace(/\s+/g, " ").slice(0, 80) : ""}`,
      );

      // Brief pause between calls so provider rate limits are not the thing
      // being measured.
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const payload = {
      tool: entry.name,
      source: entry.file,
      kind: entry.kind,
      generatedAt: new Date().toISOString(),
      domains: entry.kind === "search" ? [...DOMAINS] : null,
      skippedDomains:
        entry.kind === "search"
          ? DOMAINS.filter((d) => !runs.some((r) => r.domain === d))
          : [],
      summary: {
        runs: runs.length,
        ok: runs.filter((r) => r.ok).length,
        empty: runs.filter((r) => r.ok && r.shape.empty).length,
        totalRecords: runs.reduce(
          (sum, r) => sum + (r.shape.recordCount ?? 0),
          0,
        ),
      },
      runs,
    };

    await fs.writeFile(
      path.join(OUTPUT_DIR, `${entry.name}.data.json`),
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    summary.push({
      tool: entry.name,
      file: entry.file,
      kind: entry.kind,
      ...payload.summary,
    });
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(
    `  ${"tool".padEnd(30)}${"runs".padStart(5)}${"ok".padStart(5)}${"empty".padStart(7)}${"records".padStart(10)}`,
  );

  for (const row of summary) {
    console.log(
      `  ${row.tool.padEnd(30)}${String(row.runs).padStart(5)}` +
        `${String(row.ok).padStart(5)}${String(row.empty).padStart(7)}` +
        `${String(row.totalRecords).padStart(10)}`,
    );
  }

  console.log("");
  console.log(`  output: ${path.relative(process.cwd(), OUTPUT_DIR)}`);
};

void main()
  .then(() => {
    // Pool handles are held by the tools themselves; force exit so a lingering
    // client does not keep the process alive after the sweep.
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Tool data exposure failed:", error);
    process.exit(1);
  });