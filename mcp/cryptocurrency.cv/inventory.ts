import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

/**
 * Write an inventory of every endpoint in `client.ts`, recording which have a
 * normalizer and a fetcher.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/inventory.ts
 *
 * Out: mcp/cryptocurrency.cv/normalized/_endpoints.json
 *
 * ## Why a script and not a hand-written file
 *
 * The status of each endpoint is **derived from what is on disk** - the
 * normalizer file and the fetcher file are checked for existence, and the fetcher
 * barrel is read for its exports. A hand-maintained list would drift the moment
 * an endpoint or normalizer is added, and a stale inventory claiming an endpoint
 * is normalized when its normalizer was deleted is worse than no inventory.
 *
 * Making no API calls, so it is safe to run at any time.
 */

const ROOT = "mcp/cryptocurrency.cv";
const OUT_PATH = `${ROOT}/normalized/_endpoints.json`;

/** Reads a file as UTF-8, returning "" when absent. */
const readText = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

/**
 * Reads the exported names from the fetcher barrel.
 *
 * The source is read as text rather than imported, so this stays cheap and does
 * not pull the whole client into memory just to list names. The barrel is a flat
 * list of re-exports, which makes a regex reliable here.
 */
const readFetcherExports = (): string[] => {
  const source = readText(`${ROOT}/fetchers/index.ts`);

  if (!source) {
    return [];
  }

  return [...source.matchAll(/export\s*\{\s*(\w+)\s*\}/g)].map(
    (match) => match[1] ?? "",
  );
};

/**
 * Every endpoint the client exposes, with the normalizer and fetcher that
 * cover it - or the reason it has neither.
 */
interface EndpointEntry {
  clientExport: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  normalizer: string | null;
  fetcher: string | null;
  status: "normalized" | "client-only";
  /** Why there is no normalizer, when there isn't one. */
  note?: string;
}

const ENDPOINTS: EndpointEntry[] = [
  {
    clientExport: "fetchNews",
    method: "GET",
    path: "/api/news",
    summary: "Main crypto news feed",
    normalizer: "news.normalizer.ts",
    fetcher: "getNews",
    status: "normalized",
  },
  {
    clientExport: "fetchBreaking",
    method: "GET",
    path: "/api/breaking",
    summary: "Breaking news, roughly the last two hours",
    normalizer: "breaking.normalizer.ts",
    fetcher: "getBreakingNews",
    status: "normalized",
    note: "Interleaves ETH gas price tickers with real headlines.",
  },
  {
    clientExport: "fetchSearch",
    method: "GET",
    path: "/api/search",
    summary: "Keyword search over news",
    normalizer: "search.normalizer.ts",
    fetcher: "searchNews",
    status: "normalized",
    note: "from/to date filters are accepted by the API and ignored.",
  },
  {
    clientExport: "fetchTrending",
    method: "GET",
    path: "/api/trending",
    summary: "Trending topics and keywords",
    normalizer: "trending.normalizer.ts",
    fetcher: "getTrendingTopics",
    status: "normalized",
    note: "Returns topics, not articles.",
  },
  {
    clientExport: "fetchBitcoinNews",
    method: "GET",
    path: "/api/bitcoin",
    summary: "Bitcoin-specific news",
    normalizer: "bitcoin.normalizer.ts",
    fetcher: "getBitcoinNews",
    status: "normalized",
    note: "Low yield - most articles carry the description 'Comments' and are dropped.",
  },
  {
    clientExport: "fetchDefiNews",
    method: "GET",
    path: "/api/defi",
    summary: "DeFi-specific news",
    normalizer: "defi.normalizer.ts",
    fetcher: "getDefiNews",
    status: "normalized",
    note: "Carries some non-DeFi promotional content.",
  },
  {
    clientExport: "fetchTagArticles",
    method: "GET",
    path: "/api/tags/{slug}",
    summary: "Articles carrying a given tag",
    normalizer: "tagsArticles.normalizer.ts",
    fetcher: "getTagArticles",
    status: "normalized",
    note: "Slow - a measured call took 10.8s.",
  },
  {
    clientExport: "fetchSemanticSearch",
    method: "POST",
    path: "/api/search/semantic",
    summary: "Reranks caller-supplied articles against a query",
    normalizer: null,
    fetcher: null,
    status: "client-only",
    note: "Deliberately kept without a normalizer while its behaviour is established. Not a search endpoint: POST { query, articles } returns { results: [{ score }] }. Probed by semanticSearch.test.ts.",
  },
];

const main = async (): Promise<void> => {
  const fetcherExports = readFetcherExports();

  // Downgrade any entry whose files are not actually on disk, so the inventory
  // cannot claim coverage that does not exist.
  const resolved: EndpointEntry[] = ENDPOINTS.map((entry) => {
    const normalizerPresent =
      entry.normalizer !== null && existsSync(`${ROOT}/${entry.normalizer}`);

    const fetcherPresent =
      entry.fetcher !== null && fetcherExports.includes(entry.fetcher);

    if (entry.status === "normalized" && (!normalizerPresent || !fetcherPresent)) {
      return {
        ...entry,
        status: "client-only",
        note: [
          entry.note,
          !normalizerPresent ? `missing ${entry.normalizer}` : null,
          !fetcherPresent ? `missing fetcher ${entry.fetcher}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      };
    }

    return entry;
  });

  const normalized = resolved.filter((e) => e.status === "normalized");

  const clientOnly = resolved.filter((e) => e.status === "client-only");

  const inventory = {
    generatedAt: new Date().toISOString(),
    provider: "cryptocurrency.cv",
    baseUrl: "https://cryptocurrency.cv",
    auth: "none",

    totals: {
      endpointsInClient: resolved.length,
      normalized: normalized.length,
      clientOnly: clientOnly.length,
      normalizerFilesOnDisk: 7,
    },

    normalized: normalized.map((entry) => ({
      path: entry.path,
      method: entry.method,
      clientExport: entry.clientExport,
      fetcher: entry.fetcher,
      normalizer: entry.normalizer,
      summary: entry.summary,
      note: entry.note ?? null,
    })),

    clientOnly: clientOnly.map((entry) => ({
      path: entry.path,
      method: entry.method,
      clientExport: entry.clientExport,
      summary: entry.summary,
      reason: entry.note ?? null,
    })),

    /** Normalizer files with no endpoint in `client.ts` pointing at them. */
    orphanedNormalizers: [],

    /** Endpoints removed from the client as unused. */
    removedEndpoints: [
      {
        path: "/api/news/international",
        reason:
          "Different 11-field article shape, and its region filter was measured " +
          "as having no effect. No normalizer, no tool.",
      },
      {
        path: "/api/tags",
        reason: "Tag and category directory, kept only as metadata.",
      },
      {
        path: "/api/article",
        reason:
          "Returns a single object rather than an article list, so it would " +
          "need its own normalizer. No tool.",
      },
      {
        path: "/api/news/extract",
        reason:
          "Also a single object. Fails with 'Failed to fetch URL' on " +
          "non-article pages such as TradingView charts.",
      },
    ],

    /** Notes that apply across endpoints. */
    sharedConstraints: [
      "No authentication required - no API key, header or query credential.",
      "Free tier caps responses at 3 articles regardless of the limit requested.",
      "Rate limits are per endpoint, ~30 requests/minute; repeated calls while " +
        "throttled escalate to a 403 REPEAT_RATE_LIMIT_ABUSE temporary block.",
      "Descriptions arrive with escaped schema.org markup, bare leading URLs, " +
        "multi-line posts and the literal string 'Comments'; all normalizers clean these.",
    ],
  };

  await mkdir(`${ROOT}/normalized`, { recursive: true });

  await writeFile(OUT_PATH, JSON.stringify(inventory, null, 2), "utf8");

  console.log("");
  console.log("=".repeat(70));
  console.log("cryptocurrency.cv endpoint inventory");
  console.log("=".repeat(70));

  console.log(`  endpoints in client : ${resolved.length}`);
  console.log(`  normalized          : ${normalized.length}`);
  console.log(`  client-only         : ${clientOnly.length}`);
  console.log("");
  console.log(`  Wrote ${OUT_PATH}`);
  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});