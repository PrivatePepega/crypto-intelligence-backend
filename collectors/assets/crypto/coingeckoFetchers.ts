import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * CoinGecko REST API collector.
 *
 * Fetches asset discovery data, metadata, current market snapshots, historical
 * market observations and OHLC candles, and writes normalized JSON under
 * `collectors/assets/crypto/data/` with a `coingecko ` prefix.
 *
 * The provider's stable coin id is the lookup key. Ticker symbols are not
 * unique, so `search` results are kept as candidates and are never merged into
 * a canonical asset record. Contract addresses and metadata are provider
 * reported, not independently verified; downstream code must not overwrite a
 * manually verified value with one of these rows.
 *
 * Endpoints used:
 *
 *   GET /ping
 *   GET /coins/list?include_platform=true
 *   GET /search?query=ethereum
 *   GET /coins/{id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false
 *   GET /coins/markets?vs_currency=usd&ids=bitcoin,ethereum&price_change_percentage=24h,7d,30d
 *   GET /coins/{id}/market_chart?vs_currency=usd&days=365
 *   GET /coins/{id}/ohlc?vs_currency=usd&days=30
 *
 * Authentication: the Demo key is sent in the `x-cg-demo-api-key` header so it
 * never appears in a logged URL. Without a key the public endpoints still work
 * at stricter, unauthenticated limits.
 *
 * Demo-plan limits observed on 2026-10-27:
 *   - 30 requests per minute (enforced here with a 2s minimum gap by default).
 *   - `/market_chart` and `/ohlc` reject `days` above 365 with HTTP 401.
 *   - `/market_chart` granularity: 5 minutes for 1 day, 1 hour for 2-30 days,
 *     1 day for 31-365 days.
 *   - `/ohlc` granularity: 30 minutes for 1-2 days, 4 hours for 3-30 days,
 *     4 days for 31+ days.
 *
 * Run with:
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=all --ids=bitcoin,ethereum
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=discover
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=search --query=ethereum
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=markets --ids=bitcoin,ethereum
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=chart --ids=bitcoin --chart-days=365
 *   npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=ohlc --ids=bitcoin --ohlc-days=30
 */

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_OUTPUT_DIR = "collectors/assets/crypto/data";
const DEFAULT_IDS = ["bitcoin", "ethereum"];
const DEFAULT_VS_CURRENCY = "usd";
const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_MAX_HISTORY_DAYS = 365;
const DEFAULT_MARKET_BATCH_SIZE = 250;
const MAX_MARKET_BATCH_SIZE = 250;

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;

/** Windows accepted by `/coins/markets` `price_change_percentage`. */
const PRICE_CHANGE_WINDOWS = ["1h", "24h", "7d", "14d", "30d", "200d", "1y"] as const;
export type CoinGeckoPriceChangeWindow = (typeof PRICE_CHANGE_WINDOWS)[number];

/** Intervals allowed by the `assets.asset_price_history.interval` check. */
const ASSET_PRICE_HISTORY_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"] as const;
export type AssetPriceHistoryInterval = (typeof ASSET_PRICE_HISTORY_INTERVALS)[number];

// --------------------------------------------------
// Errors and rate limiting
// --------------------------------------------------

export interface CoinGeckoApiErrorDetails {
  status: number;
  errorCode: number | null;
  url: string;
  apiMessage: string | null;
}

/** An HTTP failure from the CoinGecko API, with the request URL and status. */
export class CoinGeckoApiError extends Error {
  readonly status: number;
  readonly errorCode: number | null;
  readonly url: string;
  readonly apiMessage: string | null;

  constructor(message: string, details: CoinGeckoApiErrorDetails) {
    super(message);
    this.name = "CoinGeckoApiError";
    this.status = details.status;
    this.errorCode = details.errorCode;
    this.url = details.url;
    this.apiMessage = details.apiMessage;
  }
}

let requestsPerMinute = readRequestsPerMinuteFromEnv();
let lastRequestStartedAt = 0;
let warnedAboutMissingKey = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRequestsPerMinuteFromEnv(): number {
  const raw = process.env.COINGECKO_REQUESTS_PER_MINUTE;
  if (!raw) {
    return DEFAULT_REQUESTS_PER_MINUTE;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUESTS_PER_MINUTE;
}

/**
 * Sets the request rate used by this process.
 *
 * CoinGecko's Demo plan allows 30 requests per minute. Slower values are safe;
 * faster values risk 429 responses, which are retried with backoff but still
 * consume time and may count against the plan.
 */
export function setCoinGeckoRequestsPerMinute(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid CoinGecko request rate: ${value}`);
  }
  requestsPerMinute = value;
}

async function waitForRateLimit(): Promise<void> {
  const minimumGapMs = Math.ceil(60_000 / requestsPerMinute);
  const waitMs = lastRequestStartedAt + minimumGapMs - Date.now();

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestStartedAt = Date.now();
}

function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

function readRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);
  }

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), RETRY_MAX_DELAY_MS);
  }

  return null;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "CryptoIntelligencePlatform/1.0",
  };

  const key = process.env.COINGECKO_API_KEY?.trim();
  if (key) {
    // Header rather than the `x_cg_demo_api_key` query parameter so the secret
    // never ends up in a logged URL or an error message.
    headers["x-cg-demo-api-key"] = key;
  } else if (!warnedAboutMissingKey) {
    warnedAboutMissingKey = true;
    console.warn(
      "COINGECKO_API_KEY is not set; using the public rate limits. " +
        "Add a Demo API key to .env to use the documented quota.",
    );
  }

  return headers;
}

function buildUrl(
  pathname: string,
  params?: Record<string, string | number | boolean | undefined>,
): URL {
  const url = new URL(`${COINGECKO_BASE_URL}${pathname}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

function readApiError(body: unknown): { code: number | null; message: string | null } {
  const record = asJsonObject(body);
  const status = asJsonObject(record.status);

  return {
    code: numberOrNull(status.error_code),
    message:
      stringOrNull(status.error_message) ??
      stringOrNull(record.error) ??
      stringOrNull(record.message),
  };
}

function historyLimitHint(pathname: string, status: number): string | null {
  if (status !== 401) {
    return null;
  }

  if (pathname.includes("/market_chart") || pathname.includes("/ohlc")) {
    return (
      "The Demo plan restricts historical data to 365 days. " +
      "Raise --max-history-days only on a plan that supports a longer range."
    );
  }

  return null;
}

async function requestJson(
  pathname: string,
  params: Record<string, string | number | boolean | undefined> | undefined,
  label: string,
): Promise<{ data: unknown; url: string }> {
  const url = buildUrl(pathname, params);
  let lastNetworkError: Error | null = null;

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    await waitForRateLimit();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastNetworkError =
        error instanceof Error ? error : new Error(`CoinGecko ${label}: ${String(error)}`);

      if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
        break;
      }

      await sleep(retryDelayMs(attempt));
      continue;
    }

    const text = await response.text();

    if (response.ok) {
      try {
        return { data: JSON.parse(text) as unknown, url: url.toString() };
      } catch {
        throw new Error(`CoinGecko ${label}: response was not valid JSON (${response.status}).`);
      }
    }

    const apiError = readApiError(safeJsonParse(text));
    const hint = historyLimitHint(pathname, response.status);
    const message =
      `CoinGecko ${label} failed: HTTP ${response.status}` +
      (apiError.message ? ` - ${apiError.message}` : "") +
      (hint ? ` ${hint}` : "") +
      ` (${url.toString()})`;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_REQUEST_ATTEMPTS - 1) {
      throw new CoinGeckoApiError(message, {
        status: response.status,
        errorCode: apiError.code,
        url: url.toString(),
        apiMessage: apiError.message,
      });
    }

    const retryAfter = readRetryAfterMs(response);
    await sleep(retryAfter ?? retryDelayMs(attempt));
  }

  throw lastNetworkError ?? new Error(`CoinGecko ${label}: request failed.`);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// Untrusted JSON readers
// --------------------------------------------------

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function jsonObjectAt(record: JsonObject, key: string): JsonObject {
  return asJsonObject(record[key]);
}

function arrayAt(record: JsonObject, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const strings: string[] = [];

  for (const item of value) {
    const parsed = stringOrNull(item);
    if (parsed !== null && !seen.has(parsed)) {
      seen.add(parsed);
      strings.push(parsed);
    }
  }

  return strings;
}

function isoDateOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function dateOnlyOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function currencyValue(value: unknown, vsCurrency: string): unknown {
  return isJsonObject(value) ? value[vsCurrency] : value;
}

function firstString(values: Array<string | null>): string | null {
  return values.find((value): value is string => value !== null && value !== "") ?? null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  ndash: "-",
  mdash: "-",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: "...",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Converts a CoinGecko description (HTML) to plain text.
 *
 * The provider's descriptions are promotional and may contain links and
 * entities. They are treated as untrusted display text: tags and scripts are
 * removed, entities decoded, and whitespace collapsed. No link targets are
 * preserved, because only the normalized description is stored.
 */
export function htmlToPlainText(value: string): string {
  const withoutBlocks = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  return decodeEntities(withoutBlocks)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// --------------------------------------------------
// Normalized records
// --------------------------------------------------

export interface CoinGeckoExternalIds {
  coingecko_id: string;
  other_provider_ids: Record<string, string>;
}

/** Maps to `assets.assets`. */
export interface CoinGeckoAssetRecord {
  name: string;
  symbol: string;
  assetType: "crypto";
  description: string | null;
  category: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  externalIds: CoinGeckoExternalIds;
}

/**
 * A contract mapping as reported by CoinGecko.
 *
 * `verified` is always false: the provider reports these addresses, but the
 * collector has not checked them on-chain. Downstream code must not replace a
 * manually verified address with one of these rows.
 */
export interface CoinGeckoContractAddress {
  network: string;
  address: string;
  decimalPlace: number | null;
  source: "CoinGecko";
  verified: false;
}

export interface CoinGeckoSocials {
  homepage: string[];
  whitepaper: string | null;
  blockchainSites: string[];
  officialForumUrls: string[];
  chatUrls: string[];
  announcementUrls: string[];
  twitter: string | null;
  telegram: string | null;
  subreddit: string | null;
  repos: {
    github: string[];
    bitbucket: string[];
  };
}

export interface CoinGeckoTokenomics {
  categories: string[];
  genesisDate: string | null;
  hashingAlgorithm: string | null;
  blockTimeInMinutes: number | null;
  hasSupplyBreakdown: boolean | null;
}

/** Maps to `assets.crypto`. */
export interface CoinGeckoCryptoRecord {
  network: string | null;
  contractAddresses: CoinGeckoContractAddress[];
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  tokenomics: CoinGeckoTokenomics;
  socials: CoinGeckoSocials;
}

export interface CoinGeckoMarketMetrics {
  currentPrice: number | null;
  marketCap: number | null;
  fullyDilutedValuation: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  totalValueLocked: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChange24h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  marketCapChange24h: number | null;
  marketCapChangePercentage24h: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePercentage: number | null;
  atl: number | null;
  atlDate: string | null;
  atlChangePercentage: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  maxSupplyInfinite: boolean | null;
  lastUpdated: string | null;
}

/** The `data` payload for an `assets.information` market snapshot. */
export interface CoinGeckoMarketSnapshotData {
  coingeckoId: string;
  vsCurrency: string;
  currentPrice: number | null;
  marketCap: number | null;
  fullyDilutedValuation: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  totalValueLocked: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChange24h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  marketCapChange24h: number | null;
  marketCapChangePercentage24h: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePercentage: number | null;
  atl: number | null;
  atlDate: string | null;
  atlChangePercentage: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  maxSupplyInfinite: boolean | null;
  lastUpdated: string | null;
}

/** Maps to `assets.information` with `information_type = 'market_snapshot'`. */
export interface CoinGeckoInformationRecord {
  informationType: "market_snapshot";
  data: CoinGeckoMarketSnapshotData;
  source: "CoinGecko";
  sourceUrl: string;
  publishedAt: string | null;
  observedAt: string;
  collectedAt: string;
}

export interface CoinGeckoResolution {
  provider: "CoinGecko";
  method: "provider_id" | "search_candidate";
  verified: false;
  note: string;
}

export interface CoinGeckoAssetProfile {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  observedAt: string;
  asset: CoinGeckoAssetRecord;
  crypto: CoinGeckoCryptoRecord;
  market: CoinGeckoMarketMetrics;
  marketSnapshot: CoinGeckoInformationRecord;
  resolution: CoinGeckoResolution;
}

export interface CoinGeckoCoinListEntry {
  coingeckoId: string;
  symbol: string;
  name: string;
  platforms: Array<{ network: string; address: string }>;
}

export interface CoinGeckoCoinsListReport {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  includePlatforms: boolean;
  count: number;
  coinsWithPlatforms: number;
  coins: CoinGeckoCoinListEntry[];
}

export interface CoinGeckoSearchCandidate {
  coingeckoId: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  thumbUrl: string | null;
  largeUrl: string | null;
}

export interface CoinGeckoSearchReport {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  query: string;
  count: number;
  candidates: CoinGeckoSearchCandidate[];
  resolution: CoinGeckoResolution;
}

export interface CoinGeckoMarketSnapshotRecord {
  asset: CoinGeckoAssetRecord;
  information: CoinGeckoInformationRecord;
}

export interface CoinGeckoMarketsReport {
  source: "CoinGecko";
  sourceUrls: string[];
  fetchedAt: string;
  vsCurrency: string;
  requestedIds: string[];
  missingIds: string[];
  count: number;
  snapshots: CoinGeckoMarketSnapshotRecord[];
}

export interface CoinGeckoInformationTemplate {
  informationType: "market_snapshot";
  source: "CoinGecko";
  sourceUrl: string;
  collectedAt: string;
}

export interface CoinGeckoChartObservationData {
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  vsCurrency: string;
}

export interface CoinGeckoChartObservation {
  observedAt: string;
  data: CoinGeckoChartObservationData;
}

export interface CoinGeckoObservedGranularity {
  /** Spacing between observations, in seconds. Null when fewer than two points. */
  sourceIntervalSeconds: number | null;
  /** Label such as `5m`, `1h`, `1d`, `4d`. Null when the spacing is unknown. */
  sourceIntervalLabel: string | null;
  /** Mapping to `assets.asset_price_history.interval`, or null when unsupported. */
  assetPriceHistoryInterval: AssetPriceHistoryInterval | null;
  uniform: boolean;
  observedIntervalSeconds: number[];
}

export interface CoinGeckoGranularity extends CoinGeckoObservedGranularity {
  isOhlc: boolean;
  note: string | null;
}

export interface CoinGeckoMarketChartReport {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  coingeckoId: string;
  vsCurrency: string;
  days: number;
  informationTemplate: CoinGeckoInformationTemplate;
  granularity: CoinGeckoGranularity;
  observations: CoinGeckoChartObservation[];
}

export interface CoinGeckoOhlcCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** CoinGecko OHLC has no volume. Null is kept rather than derived. */
  volume: null;
  quoteCurrency: string;
  /** Null when the source interval is not allowed by the database check. */
  interval: AssetPriceHistoryInterval | null;
}

export interface CoinGeckoOhlcReport {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  coingeckoId: string;
  vsCurrency: string;
  days: number;
  granularity: CoinGeckoGranularity;
  volumeAvailable: false;
  volumeNote: string;
  rejectedRows: number;
  candles: CoinGeckoOhlcCandle[];
}

export interface CoinGeckoPingReport {
  source: "CoinGecko";
  sourceUrl: string;
  fetchedAt: string;
  geckoSays: string | null;
}

// --------------------------------------------------
// Normalizers (exported for tests)
// --------------------------------------------------

/**
 * Reads `platforms` and `detail_platforms` into one mapping list.
 *
 * Native assets use an empty platform key with an empty address; those are
 * skipped rather than stored as a contract on the empty network.
 */
export function normalizeContractMappings(
  platformsValue: unknown,
  detailPlatformsValue?: unknown,
): CoinGeckoContractAddress[] {
  const platforms = asJsonObject(platformsValue);
  const detailPlatforms = asJsonObject(detailPlatformsValue);
  const detailByName = new Map(
    Object.entries(detailPlatforms).map(([network, detail]) => [
      network.toLowerCase(),
      asJsonObject(detail),
    ]),
  );

  const networks = new Set([...Object.keys(platforms), ...Object.keys(detailPlatforms)]);
  const rows: CoinGeckoContractAddress[] = [];
  const seen = new Set<string>();

  for (const rawNetwork of networks) {
    const network = rawNetwork.trim();
    if (!network) {
      continue;
    }

    const detail = detailByName.get(network.toLowerCase()) ?? {};
    const address = stringOrNull(platforms[network]) ?? stringOrNull(detail["contract_address"]);

    if (!address) {
      continue;
    }

    const key = `${network}:${address}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    rows.push({
      network,
      address,
      decimalPlace: numberOrNull(detail["decimal_place"]),
      source: "CoinGecko",
      verified: false,
    });
  }

  return rows.sort(
    (a, b) => a.network.localeCompare(b.network) || a.address.localeCompare(b.address),
  );
}

/** Normalizes the `platforms` object from `/coins/list`. */
export function normalizePlatformMappings(
  platformsValue: unknown,
): Array<{ network: string; address: string }> {
  const platforms = asJsonObject(platformsValue);
  const rows: Array<{ network: string; address: string }> = [];
  const seen = new Set<string>();

  for (const [rawNetwork, rawAddress] of Object.entries(platforms)) {
    const network = rawNetwork.trim();
    const address = stringOrNull(rawAddress);
    if (!network || !address) {
      continue;
    }

    const key = `${network}:${address}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push({ network, address });
  }

  return rows.sort(
    (a, b) => a.network.localeCompare(b.network) || a.address.localeCompare(b.address),
  );
}

/** Normalizes `links` into the social/links record stored on `assets.crypto`. */
export function normalizeSocials(linksValue: unknown): CoinGeckoSocials {
  const links = asJsonObject(linksValue);
  const repos = asJsonObject(links["repos_url"]);

  return {
    homepage: stringArray(links["homepage"]),
    whitepaper: stringOrNull(links["whitepaper"]),
    blockchainSites: stringArray(links["blockchain_site"]),
    officialForumUrls: stringArray(links["official_forum_url"]),
    chatUrls: stringArray(links["chat_url"]),
    announcementUrls: stringArray(links["announcement_url"]),
    twitter: stringOrNull(links["twitter_screen_name"]),
    telegram: stringOrNull(links["telegram_channel_identifier"]),
    subreddit: stringOrNull(links["subreddit_url"]),
    repos: {
      github: stringArray(repos["github"]),
      bitbucket: stringArray(repos["bitbucket"]),
    },
  };
}

/**
 * Reads market metrics from either `/coins/{id}` `market_data` or a
 * `/coins/markets` row.
 *
 * Both shapes carry the same names for most fields; currency-keyed values are
 * narrowed to `vsCurrency`, and fields the endpoint does not return stay null.
 */
export function normalizeMarketMetrics(
  sourceValue: unknown,
  vsCurrency: string,
): CoinGeckoMarketMetrics {
  const source = asJsonObject(sourceValue);

  const currencyNumber = (key: string): number | null =>
    numberOrNull(currencyValue(source[key], vsCurrency));
  const plainNumber = (key: string): number | null => numberOrNull(source[key]);
  const currencyDate = (key: string): string | null =>
    isoDateOrNull(currencyValue(source[key], vsCurrency));

  return {
    currentPrice: currencyNumber("current_price"),
    marketCap: currencyNumber("market_cap"),
    fullyDilutedValuation: currencyNumber("fully_diluted_valuation"),
    marketCapRank: plainNumber("market_cap_rank"),
    totalVolume: currencyNumber("total_volume"),
    totalValueLocked: plainNumber("total_value_locked"),
    high24h: currencyNumber("high_24h"),
    low24h: currencyNumber("low_24h"),
    priceChange24h: currencyNumber("price_change_24h"),
    // `/coins/{id}` nests these in-currency changes by quote currency, while
    // `/coins/markets` returns a plain number. currencyNumber accepts both.
    priceChangePercentage24h:
      currencyNumber("price_change_percentage_24h_in_currency") ??
      plainNumber("price_change_percentage_24h"),
    priceChangePercentage7d:
      currencyNumber("price_change_percentage_7d_in_currency") ??
      plainNumber("price_change_percentage_7d"),
    priceChangePercentage30d:
      currencyNumber("price_change_percentage_30d_in_currency") ??
      plainNumber("price_change_percentage_30d"),
    marketCapChange24h: currencyNumber("market_cap_change_24h"),
    marketCapChangePercentage24h:
      currencyNumber("market_cap_change_percentage_24h_in_currency") ??
      plainNumber("market_cap_change_percentage_24h"),
    ath: currencyNumber("ath"),
    athDate: currencyDate("ath_date"),
    athChangePercentage: currencyNumber("ath_change_percentage"),
    atl: currencyNumber("atl"),
    atlDate: currencyDate("atl_date"),
    atlChangePercentage: currencyNumber("atl_change_percentage"),
    circulatingSupply: plainNumber("circulating_supply"),
    totalSupply: plainNumber("total_supply"),
    maxSupply: plainNumber("max_supply"),
    maxSupplyInfinite: booleanOrNull(source["max_supply_infinite"]),
    lastUpdated: isoDateOrNull(source["last_updated"]),
  };
}

function buildMarketSnapshotData(
  coingeckoId: string,
  vsCurrency: string,
  market: CoinGeckoMarketMetrics,
): CoinGeckoMarketSnapshotData {
  return {
    coingeckoId,
    vsCurrency,
    currentPrice: market.currentPrice,
    marketCap: market.marketCap,
    fullyDilutedValuation: market.fullyDilutedValuation,
    marketCapRank: market.marketCapRank,
    totalVolume: market.totalVolume,
    totalValueLocked: market.totalValueLocked,
    high24h: market.high24h,
    low24h: market.low24h,
    priceChange24h: market.priceChange24h,
    priceChangePercentage24h: market.priceChangePercentage24h,
    priceChangePercentage7d: market.priceChangePercentage7d,
    priceChangePercentage30d: market.priceChangePercentage30d,
    marketCapChange24h: market.marketCapChange24h,
    marketCapChangePercentage24h: market.marketCapChangePercentage24h,
    ath: market.ath,
    athDate: market.athDate,
    athChangePercentage: market.athChangePercentage,
    atl: market.atl,
    atlDate: market.atlDate,
    atlChangePercentage: market.atlChangePercentage,
    circulatingSupply: market.circulatingSupply,
    totalSupply: market.totalSupply,
    maxSupply: market.maxSupply,
    maxSupplyInfinite: market.maxSupplyInfinite,
    lastUpdated: market.lastUpdated,
  };
}

function buildInformationRecord(input: {
  coingeckoId: string;
  vsCurrency: string;
  market: CoinGeckoMarketMetrics;
  sourceUrl: string;
  observedAt: string;
  collectedAt: string;
}): CoinGeckoInformationRecord {
  return {
    informationType: "market_snapshot",
    data: buildMarketSnapshotData(input.coingeckoId, input.vsCurrency, input.market),
    source: "CoinGecko",
    sourceUrl: input.sourceUrl,
    publishedAt: null,
    observedAt: input.observedAt,
    collectedAt: input.collectedAt,
  };
}

export interface CoinGeckoProfileContext {
  sourceUrl: string;
  vsCurrency: string;
  fetchedAt: string;
}

/**
 * Converts a `/coins/{id}` response into the normalized asset, crypto, market
 * and market-snapshot records.
 *
 * Throws when the response has no stable CoinGecko id, because an asset row
 * without that key cannot be matched back to the provider.
 */
export function normalizeCoinProfile(
  rawValue: unknown,
  context: CoinGeckoProfileContext,
): CoinGeckoAssetProfile {
  const raw = asJsonObject(rawValue);
  const coingeckoId = stringOrNull(raw["id"]);

  if (!coingeckoId) {
    throw new Error("CoinGecko coin response has no id.");
  }

  const name = stringOrNull(raw["name"]) ?? coingeckoId;
  const symbol = stringOrNull(raw["symbol"]) ?? "";
  const description = htmlToPlainText(stringOrNull(jsonObjectAt(raw, "description")["en"]) ?? "");
  const image = jsonObjectAt(raw, "image");
  const logoUrl =
    stringOrNull(image["large"]) ?? stringOrNull(image["small"]) ?? stringOrNull(image["thumb"]);
  const socials = normalizeSocials(raw["links"]);
  const categories = stringArray(raw["categories"]);
  const contractAddresses = normalizeContractMappings(raw["platforms"], raw["detail_platforms"]);
  const network = firstString([
    stringOrNull(raw["asset_platform_id"]),
    ...contractAddresses.map((mapping) => mapping.network),
  ]);
  const market = normalizeMarketMetrics(raw["market_data"], context.vsCurrency);
  const observedAt = market.lastUpdated ?? isoDateOrNull(raw["last_updated"]) ?? context.fetchedAt;

  const asset: CoinGeckoAssetRecord = {
    name,
    symbol,
    assetType: "crypto",
    description: description === "" ? null : description,
    category: categories[0] ?? null,
    logoUrl,
    websiteUrl: socials.homepage[0] ?? socials.blockchainSites[0] ?? null,
    externalIds: {
      coingecko_id: coingeckoId,
      other_provider_ids: {},
    },
  };

  const crypto: CoinGeckoCryptoRecord = {
    network,
    contractAddresses,
    circulatingSupply: market.circulatingSupply,
    totalSupply: market.totalSupply,
    maxSupply: market.maxSupply,
    tokenomics: {
      categories,
      genesisDate: dateOnlyOrNull(raw["genesis_date"]),
      hashingAlgorithm: stringOrNull(raw["hashing_algorithm"]),
      blockTimeInMinutes: numberOrNull(raw["block_time_in_minutes"]),
      hasSupplyBreakdown: booleanOrNull(raw["has_supply_breakdown"]),
    },
    socials,
  };

  return {
    source: "CoinGecko",
    sourceUrl: context.sourceUrl,
    fetchedAt: context.fetchedAt,
    observedAt,
    asset,
    crypto,
    market,
    marketSnapshot: buildInformationRecord({
      coingeckoId,
      vsCurrency: context.vsCurrency,
      market,
      sourceUrl: context.sourceUrl,
      observedAt,
      collectedAt: context.fetchedAt,
    }),
    resolution: {
      provider: "CoinGecko",
      method: "provider_id",
      verified: false,
      note:
        "Identity is the provider's stable CoinGecko id. Contract addresses and " +
        "metadata are provider reported; do not overwrite manually verified values.",
    },
  };
}

/** Normalizes a `/coins/markets` row. Returns null when the row has no id. */
export function normalizeMarketRow(
  rowValue: unknown,
  context: { sourceUrl: string; vsCurrency: string; collectedAt: string },
): CoinGeckoMarketSnapshotRecord | null {
  const row = asJsonObject(rowValue);
  const coingeckoId = stringOrNull(row["id"]);

  if (!coingeckoId) {
    return null;
  }

  const market = normalizeMarketMetrics(row, context.vsCurrency);
  const observedAt = market.lastUpdated ?? context.collectedAt;

  return {
    asset: {
      name: stringOrNull(row["name"]) ?? coingeckoId,
      symbol: stringOrNull(row["symbol"]) ?? "",
      assetType: "crypto",
      description: null,
      category: null,
      logoUrl: stringOrNull(row["image"]),
      websiteUrl: null,
      externalIds: {
        coingecko_id: coingeckoId,
        other_provider_ids: {},
      },
    },
    information: buildInformationRecord({
      coingeckoId,
      vsCurrency: context.vsCurrency,
      market,
      sourceUrl: context.sourceUrl,
      observedAt,
      collectedAt: context.collectedAt,
    }),
  };
}

/** Normalizes `/coins/list` rows, deduplicating by CoinGecko id. */
export function normalizeCoinsList(payload: unknown): CoinGeckoCoinListEntry[] {
  if (!Array.isArray(payload)) {
    throw new Error("CoinGecko coins list response is not an array.");
  }

  const byId = new Map<string, CoinGeckoCoinListEntry>();

  for (const item of payload) {
    const record = asJsonObject(item);
    const coingeckoId = stringOrNull(record["id"]);
    if (!coingeckoId || byId.has(coingeckoId)) {
      continue;
    }

    byId.set(coingeckoId, {
      coingeckoId,
      symbol: stringOrNull(record["symbol"]) ?? "",
      name: stringOrNull(record["name"]) ?? coingeckoId,
      platforms: normalizePlatformMappings(record["platforms"]),
    });
  }

  return [...byId.values()];
}

/**
 * Normalizes `/search` coin candidates in provider order.
 *
 * A candidate is not an identity claim: only the stable id is kept, and no
 * canonical asset record is written from a search result.
 */
export function normalizeSearchCandidates(payload: unknown): CoinGeckoSearchCandidate[] {
  const coins = arrayAt(asJsonObject(payload), "coins");
  const byId = new Map<string, CoinGeckoSearchCandidate>();

  for (const item of coins) {
    const record = asJsonObject(item);
    const coingeckoId = stringOrNull(record["id"]);
    if (!coingeckoId || byId.has(coingeckoId)) {
      continue;
    }

    byId.set(coingeckoId, {
      coingeckoId,
      symbol: stringOrNull(record["symbol"]) ?? "",
      name: stringOrNull(record["name"]) ?? coingeckoId,
      marketCapRank: numberOrNull(record["market_cap_rank"]),
      thumbUrl: stringOrNull(record["thumb"]),
      largeUrl: stringOrNull(record["large"]),
    });
  }

  return [...byId.values()];
}

// --------------------------------------------------
// Granularity and OHLC normalization
// --------------------------------------------------

const INTERVAL_LABEL_BY_SECONDS = new Map<number, string>([
  [60, "1m"],
  [300, "5m"],
  [900, "15m"],
  [1_800, "30m"],
  [3_600, "1h"],
  [7_200, "2h"],
  [14_400, "4h"],
  [21_600, "6h"],
  [43_200, "12h"],
  [86_400, "1d"],
  [172_800, "2d"],
  [259_200, "3d"],
  [345_600, "4d"],
  [604_800, "1w"],
  [1_209_600, "2w"],
  [2_592_000, "1mo"],
]);

const ASSET_PRICE_HISTORY_INTERVAL_SET = new Set<string>(ASSET_PRICE_HISTORY_INTERVALS);

function isAssetPriceHistoryInterval(value: string | null): value is AssetPriceHistoryInterval {
  return value !== null && ASSET_PRICE_HISTORY_INTERVAL_SET.has(value);
}

/**
 * Infers the observation spacing from a sorted timestamp list.
 *
 * Granularity is derived from the data rather than assumed from `days`, so a
 * plan change or an endpoint that returns a different interval is visible in
 * the output instead of silently mislabeled. A spacing that is not an exact
 * known interval stays `null`.
 */
export function inferGranularity(timestampsMs: number[]): CoinGeckoObservedGranularity {
  const deltas: number[] = [];

  for (let index = 1; index < timestampsMs.length; index += 1) {
    const previous = timestampsMs[index - 1];
    const current = timestampsMs[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const delta = current - previous;
    if (Number.isFinite(delta) && delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return {
      sourceIntervalSeconds: null,
      sourceIntervalLabel: null,
      assetPriceHistoryInterval: null,
      uniform: false,
      observedIntervalSeconds: [],
    };
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  const uniqueSeconds = [...new Set(deltas.map((delta) => Math.round(delta / 1000)))].sort(
    (a, b) => a - b,
  );
  const sourceIntervalSeconds = Math.round(median / 1000);
  const sourceIntervalLabel = INTERVAL_LABEL_BY_SECONDS.get(sourceIntervalSeconds) ?? null;

  return {
    sourceIntervalSeconds,
    sourceIntervalLabel,
    assetPriceHistoryInterval: isAssetPriceHistoryInterval(sourceIntervalLabel)
      ? sourceIntervalLabel
      : null,
    uniform: uniqueSeconds.length === 1,
    observedIntervalSeconds: uniqueSeconds,
  };
}

function varianceNote(isOhlc: boolean, granularity: CoinGeckoObservedGranularity): string | null {
  if (!isOhlc) {
    return (
      "market_chart returns price/market-cap/volume observations, not OHLC candles; " +
      "do not insert them into assets.asset_price_history."
    );
  }

  if (granularity.sourceIntervalLabel !== null && granularity.assetPriceHistoryInterval === null) {
    return (
      `Source interval ${granularity.sourceIntervalLabel} is not allowed by the ` +
      "assets.asset_price_history.interval check; candles are kept with interval=null. " +
      "Do not resample them into a different interval."
    );
  }

  return null;
}

export interface CoinGeckoOhlcParseResult {
  candles: CoinGeckoOhlcCandle[];
  granularity: CoinGeckoObservedGranularity;
  rejectedRows: number;
}

/**
 * Converts `/coins/{id}/ohlc` rows into validated candles.
 *
 * Rows are `[timestamp, open, high, low, close]`. Malformed rows (wrong length,
 * non-numeric values, non-positive prices, or high/low bounds violations) are
 * rejected rather than corrected. CoinGecko supplies no volume, so `volume`
 * stays null.
 */
export function normalizeOhlcRows(payload: unknown, vsCurrency: string): CoinGeckoOhlcParseResult {
  if (!Array.isArray(payload)) {
    throw new Error("CoinGecko OHLC response is not an array.");
  }

  const byTimestamp = new Map<
    number,
    { timestamp: number; open: number; high: number; low: number; close: number }
  >();
  let rejectedRows = 0;

  for (const item of payload) {
    if (!Array.isArray(item) || item.length < 5) {
      rejectedRows += 1;
      continue;
    }

    const timestamp = numberOrNull(item[0]);
    const open = numberOrNull(item[1]);
    const high = numberOrNull(item[2]);
    const low = numberOrNull(item[3]);
    const close = numberOrNull(item[4]);

    if (timestamp === null || open === null || high === null || low === null || close === null) {
      rejectedRows += 1;
      continue;
    }

    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      rejectedRows += 1;
      continue;
    }

    if (high < low || open > high || open < low || close > high || close < low) {
      rejectedRows += 1;
      continue;
    }

    byTimestamp.set(timestamp, { timestamp, open, high, low, close });
  }

  const rows = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
  const granularity = inferGranularity(rows.map((row) => row.timestamp));

  const candles: CoinGeckoOhlcCandle[] = rows.map((row) => ({
    timestamp: new Date(row.timestamp).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: null,
    quoteCurrency: vsCurrency,
    interval: granularity.assetPriceHistoryInterval,
  }));

  return { candles, granularity, rejectedRows };
}

function parseSeries(value: unknown): Map<number, number> {
  const series = new Map<number, number>();

  if (!Array.isArray(value)) {
    return series;
  }

  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }

    const timestamp = numberOrNull(item[0]);
    const amount = numberOrNull(item[1]);
    if (timestamp === null || amount === null) {
      continue;
    }

    series.set(timestamp, amount);
  }

  return series;
}

export interface CoinGeckoMarketChartContext {
  coingeckoId: string;
  vsCurrency: string;
  days: number;
  sourceUrl: string;
  fetchedAt: string;
}

/**
 * Converts `/coins/{id}/market_chart` into timestamped observations.
 *
 * The three series are joined on their millisecond timestamp. The result is
 * explicitly not candle data: `assetPriceHistoryInterval` is null and the
 * granularity note says not to insert these rows into the candle table.
 */
export function normalizeMarketChart(
  payloadValue: unknown,
  context: CoinGeckoMarketChartContext,
): CoinGeckoMarketChartReport {
  const payload = asJsonObject(payloadValue);
  const prices = parseSeries(payload["prices"]);
  const marketCaps = parseSeries(payload["market_caps"]);
  const volumes = parseSeries(payload["total_volumes"]);

  const timestamps = new Set<number>([...prices.keys(), ...marketCaps.keys(), ...volumes.keys()]);
  const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
  const granularity = inferGranularity(sortedTimestamps);

  const observations: CoinGeckoChartObservation[] = sortedTimestamps.map((timestamp) => ({
    observedAt: new Date(timestamp).toISOString(),
    data: {
      price: prices.get(timestamp) ?? null,
      marketCap: marketCaps.get(timestamp) ?? null,
      volume24h: volumes.get(timestamp) ?? null,
      vsCurrency: context.vsCurrency,
    },
  }));

  return {
    source: "CoinGecko",
    sourceUrl: context.sourceUrl,
    fetchedAt: context.fetchedAt,
    coingeckoId: context.coingeckoId,
    vsCurrency: context.vsCurrency,
    days: context.days,
    informationTemplate: {
      informationType: "market_snapshot",
      source: "CoinGecko",
      sourceUrl: context.sourceUrl,
      collectedAt: context.fetchedAt,
    },
    granularity: {
      ...granularity,
      // Observations from `/market_chart` are not candles, so they have no
      // valid `assets.asset_price_history.interval` mapping.
      assetPriceHistoryInterval: null,
      isOhlc: false,
      note: varianceNote(false, granularity),
    },
    observations,
  };
}

// --------------------------------------------------
// API functions
// --------------------------------------------------

function assertNonEmptyId(id: string, label: string): string {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error(`CoinGecko ${label}: an empty coin id was provided.`);
  }
  return trimmed;
}

function normalizeDays(value: number, maxHistoryDays: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`CoinGecko ${label}: days must be a positive integer, got ${value}.`);
  }

  if (value > maxHistoryDays) {
    throw new Error(
      `CoinGecko ${label}: ${value} days exceeds the configured maximum of ` +
        `${maxHistoryDays}. The Demo plan supports at most 365 days.`,
    );
  }

  return value;
}

function normalizeVsCurrency(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("CoinGecko: vsCurrency must not be empty.");
  }
  return trimmed;
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed !== "" && !seen.has(trimmed)) {
      seen.add(trimmed);
      unique.push(trimmed);
    }
  }

  return unique;
}

/** Liveness check. */
export async function fetchCoinGeckoPing(): Promise<CoinGeckoPingReport> {
  const fetchedAt = new Date().toISOString();
  const { data, url } = await requestJson("/ping", undefined, "ping");
  const record = asJsonObject(data);

  return {
    source: "CoinGecko",
    sourceUrl: url,
    fetchedAt,
    geckoSays: stringOrNull(record["gecko_says"]),
  };
}

/**
 * Fetches the supported asset listing with platform/contract mappings.
 *
 * This is a large response (about 22,500 coins on 2026-10-27); the normalized
 * form keeps the stable id, name, symbol and contract mappings only.
 */
export async function fetchCoinGeckoCoinsList(
  options: { includePlatforms?: boolean } = {},
): Promise<CoinGeckoCoinsListReport> {
  const includePlatforms = options.includePlatforms ?? true;
  const fetchedAt = new Date().toISOString();
  const { data, url } = await requestJson(
    "/coins/list",
    { include_platform: includePlatforms ? "true" : "false" },
    "coins list",
  );
  const coins = normalizeCoinsList(data);

  return {
    source: "CoinGecko",
    sourceUrl: url,
    fetchedAt,
    includePlatforms,
    count: coins.length,
    coinsWithPlatforms: coins.filter((coin) => coin.platforms.length > 0).length,
    coins,
  };
}

/**
 * Searches by name or symbol.
 *
 * Results are candidates, not proof of identity. Resolve a candidate to its
 * stable id and fetch `/coins/{id}` before writing it to a canonical asset.
 */
export async function searchCoinGecko(query: string): Promise<CoinGeckoSearchReport> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("CoinGecko search requires a non-empty query.");
  }

  const fetchedAt = new Date().toISOString();
  const { data, url } = await requestJson("/search", { query: trimmed }, "search");
  const candidates = normalizeSearchCandidates(data);

  return {
    source: "CoinGecko",
    sourceUrl: url,
    fetchedAt,
    query: trimmed,
    count: candidates.length,
    candidates,
    resolution: {
      provider: "CoinGecko",
      method: "search_candidate",
      verified: false,
      note:
        "Search results are candidates only. Symbols are not unique; confirm the " +
        "stable CoinGecko id before treating a result as the asset's identity.",
    },
  };
}

/** Fetches one asset's metadata, supply, contract mappings and market snapshot. */
export async function fetchCoinGeckoCoin(
  id: string,
  options: { vsCurrency?: string } = {},
): Promise<CoinGeckoAssetProfile> {
  const coingeckoId = assertNonEmptyId(id, "coin");
  const vsCurrency = normalizeVsCurrency(options.vsCurrency ?? DEFAULT_VS_CURRENCY);
  const fetchedAt = new Date().toISOString();

  const { data, url } = await requestJson(
    `/coins/${encodeURIComponent(coingeckoId)}`,
    {
      localization: "false",
      tickers: "false",
      market_data: "true",
      community_data: "true",
      developer_data: "false",
      sparkline: "false",
    },
    `coin ${coingeckoId}`,
  );

  return normalizeCoinProfile(data, { sourceUrl: url, vsCurrency, fetchedAt });
}

/**
 * Fetches current market snapshots for several assets.
 *
 * Ids are batched into one request per 250 assets, the provider limit, to
 * conserve calls. `missingIds` lists requested ids the provider did not return,
 * so an unknown or delisted id is visible rather than silently absent.
 */
export async function fetchCoinGeckoMarkets(options: {
  ids: string[];
  vsCurrency?: string;
  priceChangePercentages?: CoinGeckoPriceChangeWindow[];
  batchSize?: number;
}): Promise<CoinGeckoMarketsReport> {
  const ids = uniqueIds(options.ids);
  if (ids.length === 0) {
    throw new Error("CoinGecko markets: at least one coin id is required.");
  }

  const vsCurrency = normalizeVsCurrency(options.vsCurrency ?? DEFAULT_VS_CURRENCY);
  const batchSize = options.batchSize ?? DEFAULT_MARKET_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > MAX_MARKET_BATCH_SIZE) {
    throw new Error(`CoinGecko markets: batchSize must be between 1 and ${MAX_MARKET_BATCH_SIZE}.`);
  }

  const windows = options.priceChangePercentages ?? ["24h", "7d", "30d"];
  for (const window of windows) {
    if (!PRICE_CHANGE_WINDOWS.includes(window)) {
      throw new Error(
        `CoinGecko markets: unsupported price change window "${window}". ` +
          `Allowed: ${PRICE_CHANGE_WINDOWS.join(", ")}.`,
      );
    }
  }

  const fetchedAt = new Date().toISOString();
  const snapshots: CoinGeckoMarketSnapshotRecord[] = [];
  const sourceUrls: string[] = [];
  const returnedIds = new Set<string>();

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const { data, url } = await requestJson(
      "/coins/markets",
      {
        vs_currency: vsCurrency,
        ids: batch.join(","),
        price_change_percentage: windows.join(","),
      },
      `markets (${batch.length} asset(s))`,
    );

    if (!Array.isArray(data)) {
      throw new Error("CoinGecko markets: response is not an array.");
    }

    sourceUrls.push(url);

    for (const row of data) {
      const snapshot = normalizeMarketRow(row, {
        sourceUrl: url,
        vsCurrency,
        collectedAt: fetchedAt,
      });

      if (snapshot) {
        snapshots.push(snapshot);
        returnedIds.add(snapshot.asset.externalIds.coingecko_id);
      }
    }
  }

  return {
    source: "CoinGecko",
    sourceUrls,
    fetchedAt,
    vsCurrency,
    requestedIds: ids,
    missingIds: ids.filter((id) => !returnedIds.has(id)),
    count: snapshots.length,
    snapshots,
  };
}

/** Fetches historical price, market-cap and volume observations. */
export async function fetchCoinGeckoMarketChart(
  id: string,
  options: {
    days?: number;
    vsCurrency?: string;
    maxHistoryDays?: number;
  } = {},
): Promise<CoinGeckoMarketChartReport> {
  const coingeckoId = assertNonEmptyId(id, "market_chart");
  const vsCurrency = normalizeVsCurrency(options.vsCurrency ?? DEFAULT_VS_CURRENCY);
  const maxHistoryDays = options.maxHistoryDays ?? DEFAULT_MAX_HISTORY_DAYS;
  const days = normalizeDays(
    options.days ?? DEFAULT_MAX_HISTORY_DAYS,
    maxHistoryDays,
    "market_chart",
  );
  const fetchedAt = new Date().toISOString();

  const { data, url } = await requestJson(
    `/coins/${encodeURIComponent(coingeckoId)}/market_chart`,
    { vs_currency: vsCurrency, days },
    `market_chart ${coingeckoId}`,
  );

  return normalizeMarketChart(data, {
    coingeckoId,
    vsCurrency,
    days,
    sourceUrl: url,
    fetchedAt,
  });
}

/** Fetches OHLC candles. No volume is returned by the provider. */
export async function fetchCoinGeckoOhlc(
  id: string,
  options: {
    days?: number;
    vsCurrency?: string;
    maxHistoryDays?: number;
  } = {},
): Promise<CoinGeckoOhlcReport> {
  const coingeckoId = assertNonEmptyId(id, "ohlc");
  const vsCurrency = normalizeVsCurrency(options.vsCurrency ?? DEFAULT_VS_CURRENCY);
  const maxHistoryDays = options.maxHistoryDays ?? DEFAULT_MAX_HISTORY_DAYS;
  const days = normalizeDays(options.days ?? 30, maxHistoryDays, "ohlc");
  const fetchedAt = new Date().toISOString();

  const { data, url } = await requestJson(
    `/coins/${encodeURIComponent(coingeckoId)}/ohlc`,
    { vs_currency: vsCurrency, days },
    `ohlc ${coingeckoId}`,
  );

  const parsed = normalizeOhlcRows(data, vsCurrency);

  return {
    source: "CoinGecko",
    sourceUrl: url,
    fetchedAt,
    coingeckoId,
    vsCurrency,
    days,
    granularity: {
      ...parsed.granularity,
      isOhlc: true,
      note: varianceNote(true, parsed.granularity),
    },
    volumeAvailable: false,
    volumeNote:
      "CoinGecko OHLC candles do not include volume. volume is null and is not " +
      "derived from price or market-cap observations.",
    rejectedRows: parsed.rejectedRows,
    candles: parsed.candles,
  };
}

// --------------------------------------------------
// CLI
// --------------------------------------------------

const MODES = ["ping", "discover", "search", "coin", "markets", "chart", "ohlc", "all"] as const;
type Mode = (typeof MODES)[number];

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseMode(value: string): Mode {
  if ((MODES as readonly string[]).includes(value)) {
    return value as Mode;
  }
  throw new Error(`Unknown mode "${value}". Allowed: ${MODES.join(", ")}.`);
}

function parsePositiveNumber(value: string | null, fallback: number, label: string): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive number, got "${value}".`);
  }
  return parsed;
}

function parsePositiveInteger(value: string | null, fallback: number, label: string): number {
  const parsed = parsePositiveNumber(value, fallback, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${label} must be a positive integer, got "${value}".`);
  }
  return parsed;
}

function parseIds(value: string): string[] {
  const ids = uniqueIds(value.split(","));
  return ids.length > 0 ? ids : [...DEFAULT_IDS];
}

function safeFilePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned === "" ? "unknown" : cleaned.slice(0, 80);
}

function idsFilePart(ids: string[]): string {
  const readable = ids.map(safeFilePart).join("_");
  if (readable.length <= 80) {
    return readable;
  }

  const hash = createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 8);
  return `${ids.length}assets_${hash}`;
}

async function saveJson(outputDir: string, filename: string, data: unknown): Promise<void> {
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  console.log(`  ✓ Wrote ${filePath}`);
}

function printHelp(): void {
  console.log(`CoinGecko collector

Usage:
  npx tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=all --ids=bitcoin,ethereum

Modes:
  ping       Reachability check only.
  discover   /coins/list with platform/contract mappings.
  search     /search candidates for --query.
  coin       /coins/{id} metadata, supply, links and market snapshot.
  markets    /coins/markets current snapshots for --ids.
  chart      /coins/{id}/market_chart observations for --ids.
  ohlc       /coins/{id}/ohlc candles for --ids.
  all        discover + coin + markets + chart + ohlc (search too when --query is set).

Options:
  --mode=all                 Mode (default all).
  --ids=bitcoin,ethereum     CoinGecko ids, not ticker symbols.
  --query=ethereum           Search term for --mode=search.
  --vs=usd                   Quote currency (default usd).
  --chart-days=365           market_chart range (default 365).
  --ohlc-days=30             OHLC range (default 30).
  --days=30                  Shorthand that sets both chart and OHLC ranges.
  --max-history-days=365     Reject longer ranges before spending a request.
  --batch-size=250           /coins/markets ids per request (max 250).
  --rpm=30                   Request rate per minute (Demo plan allows 30).
  --output-dir=...           Default collectors/assets/crypto/data.
  --platforms=false          Omit platform mappings from --mode=discover.
  --help                     Show this message.

Outputs are normalized JSON, not raw provider payloads. Only the fields the
platform needs are written, together with source URLs and observation times.
`);
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    printHelp();
    return;
  }

  const mode = parseMode(getArg("mode") ?? "all");
  const ids = parseIds(getArg("ids") ?? DEFAULT_IDS.join(","));
  const vsCurrency = normalizeVsCurrency(getArg("vs") ?? DEFAULT_VS_CURRENCY);
  const requestsPerMinute = parsePositiveNumber(getArg("rpm"), DEFAULT_REQUESTS_PER_MINUTE, "rpm");
  const chartDays = parsePositiveInteger(
    getArg("chart-days") ?? getArg("days"),
    DEFAULT_MAX_HISTORY_DAYS,
    "chart-days",
  );
  const ohlcDays = parsePositiveInteger(getArg("ohlc-days") ?? getArg("days"), 30, "ohlc-days");
  const maxHistoryDays = parsePositiveInteger(
    getArg("max-history-days"),
    DEFAULT_MAX_HISTORY_DAYS,
    "max-history-days",
  );
  const batchSize = parsePositiveInteger(
    getArg("batch-size"),
    DEFAULT_MARKET_BATCH_SIZE,
    "batch-size",
  );
  const outputDir = path.resolve(process.cwd(), getArg("output-dir") ?? DEFAULT_OUTPUT_DIR);
  const includePlatforms = getArg("platforms") !== "false";
  const query = getArg("query");

  if (batchSize > MAX_MARKET_BATCH_SIZE) {
    throw new Error(
      `--batch-size cannot exceed ${MAX_MARKET_BATCH_SIZE}; CoinGecko limits ` +
        "/coins/markets to 250 ids per request.",
    );
  }

  setCoinGeckoRequestsPerMinute(requestsPerMinute);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(
    `CoinGecko collection: mode=${mode} ids=${ids.join(",")} vs=${vsCurrency} ` +
      `rpm=${requestsPerMinute}`,
  );

  let failures = 0;

  const runStep = async (label: string, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${label}: ${message}`);
    }
  };

  if (mode === "ping") {
    await runStep("ping", async () => {
      const report = await fetchCoinGeckoPing();
      console.log(`  ✓ ping (${report.geckoSays ?? "no message"})`);
    });
  }

  if (mode === "discover" || mode === "all") {
    await runStep("discover", async () => {
      const report = await fetchCoinGeckoCoinsList({ includePlatforms });
      await saveJson(outputDir, "coingecko coins_list.json", report);
      console.log(
        `  ✓ ${report.count.toLocaleString("en-US")} coin(s), ` +
          `${report.coinsWithPlatforms.toLocaleString("en-US")} with contract mappings`,
      );
    });
  }

  if (mode === "search" || (mode === "all" && query !== null)) {
    await runStep("search", async () => {
      if (query === null || query.trim() === "") {
        throw new Error("--mode=search requires --query=<name or symbol>.");
      }

      const report = await searchCoinGecko(query);
      await saveJson(outputDir, `coingecko search_${safeFilePart(query)}.json`, report);
      console.log(`  ✓ search "${report.query}" (${report.count} candidate(s))`);
    });
  }

  if (mode === "coin" || mode === "all") {
    for (const id of ids) {
      await runStep(`coin ${id}`, async () => {
        const profile = await fetchCoinGeckoCoin(id, { vsCurrency });
        await saveJson(outputDir, `coingecko coin_${safeFilePart(id)}.json`, profile);
        console.log(
          `  ✓ coin ${profile.asset.externalIds.coingecko_id} ` +
            `(${profile.asset.name} / ${profile.asset.symbol}, ` +
            `${profile.crypto.contractAddresses.length} contract mapping(s))`,
        );
      });
    }
  }

  if (mode === "markets" || mode === "all") {
    await runStep("markets", async () => {
      const report = await fetchCoinGeckoMarkets({ ids, vsCurrency, batchSize });
      await saveJson(outputDir, `coingecko markets_${idsFilePart(ids)}.json`, report);
      console.log(
        `  ✓ markets ${report.count} asset(s)` +
          (report.missingIds.length > 0 ? `; missing: ${report.missingIds.join(", ")}` : ""),
      );
    });
  }

  if (mode === "chart" || mode === "all") {
    for (const id of ids) {
      await runStep(`chart ${id}`, async () => {
        const report = await fetchCoinGeckoMarketChart(id, {
          days: chartDays,
          vsCurrency,
          maxHistoryDays,
        });
        await saveJson(
          outputDir,
          `coingecko market_chart_${safeFilePart(id)}_${chartDays}d.json`,
          report,
        );
        console.log(
          `  ✓ market_chart ${id} ${chartDays}d ` +
            `(${report.observations.length} observation(s), ` +
            `${report.granularity.sourceIntervalLabel ?? "unknown"} spacing)`,
        );
      });
    }
  }

  if (mode === "ohlc" || mode === "all") {
    for (const id of ids) {
      await runStep(`ohlc ${id}`, async () => {
        const report = await fetchCoinGeckoOhlc(id, {
          days: ohlcDays,
          vsCurrency,
          maxHistoryDays,
        });
        await saveJson(outputDir, `coingecko ohlc_${safeFilePart(id)}_${ohlcDays}d.json`, report);
        console.log(
          `  ✓ ohlc ${id} ${ohlcDays}d (${report.candles.length} candle(s), ` +
            `${report.granularity.sourceIntervalLabel ?? "unknown"} spacing, ` +
            `db interval=${report.granularity.assetPriceHistoryInterval ?? "null"})`,
        );
      });
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} CoinGecko step(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nCoinGecko collection complete. Output: ${outputDir}`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("CoinGecko collection failed:", error);
    process.exitCode = 1;
  });
}
