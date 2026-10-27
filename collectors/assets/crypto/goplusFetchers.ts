import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * GoPlus Security collector for EVM token risk indicators.
 *
 * GoPlus is an external security-signal provider, not a source of canonical
 * asset identity and not a source of truth about whether a token is safe. Every
 * value here is provider-reported and must be treated as an untrusted signal
 * that is compared over time, never as a verdict.
 *
 * Endpoints used:
 *
 *   GET /supported_chains
 *   GET /token_security/{chain_id}?contract_addresses={contract_address}
 *
 * Observed provider behavior on 2026-10-27 (free tier):
 *
 *   - HTTP status is 200 even for application errors. The envelope is
 *     `{code, message, result}`; `code: 1` means success.
 *   - `code: 2022` means the chain is not supported.
 *   - `code: 4029` means rate limited ("too many requests").
 *   - `code: 5000` is a generic system error, returned for invalid addresses.
 *   - An unknown contract returns `code: 1` with an empty `result` object.
 *   - A multi-address `contract_addresses=a,b` request returned only one entry,
 *     so this collector issues one request per contract.
 *   - Responses carry no rate-limit headers. The documented free limit is 30
 *     requests per minute, enforced here with a 2s minimum gap by default.
 *   - Missing fields mean "not reported"; empty strings (`"transfer_tax": ""`)
 *     mean "unknown", not zero. Both normalize to null.
 *   - `owner_address` of 0x000...000 means the owner is renounced, not that the
 *     zero address is a real controller.
 *
 * Field semantics:
 *
 *   - Booleans are tri-state: true, false or null (unknown/not reported).
 *   - Tax percentages are provider estimates and stay null when unparseable.
 *   - `total_supply` from GoPlus is already decimal-adjusted by the provider and
 *     is kept as `supply.provider_total_supply`; it is not written to
 *     `assets.crypto.total_supply` because Alchemy holds the raw value plus the
 *     contract's decimals.
 *   - Holder addresses are not stored in the normalized record; the raw entry
 *     is preserved, so nothing is lost.
 *
 * Run with:
 *   npx tsx collectors/assets/crypto/goplusFetchers.ts --mode=chains
 *   npx tsx collectors/assets/crypto/goplusFetchers.ts --mode=token --chain=1 --token=0xa0b8...
 *   npx tsx collectors/assets/crypto/goplusFetchers.ts --mode=all --chain=137 --token=0x3c49...
 *   npx tsx collectors/assets/crypto/goplusFetchers.ts --mode=compare --chain=1 --token=0xa0b8...
 */

const DEFAULT_BASE_URL = "https://api.gopluslabs.io/api/v1";
const DEFAULT_OUTPUT_DIR = "collectors/assets/crypto/data";
const DEFAULT_CHAIN_ID = "1";
const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 2_000;
const MAX_TOKENS_PER_RUN = 50;

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 10_000;
const RETRY_MAX_DELAY_MS = 60_000;

const PROVIDER_OK = 1;
const PROVIDER_RATE_LIMITED = 4029;
const PROVIDER_UNSUPPORTED_CHAIN = 2022;

/** Tax percentage at or above which this collector raises a risk flag. */
const TAX_PERCENT_RISK_THRESHOLD = 10;

/** Ownership share at or above which this collector raises a risk flag. */
const OWNERSHIP_PERCENT_RISK_THRESHOLD = 10;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Default token per chain, used when `--token` is omitted. */
const DEFAULT_TOKENS_BY_CHAIN: Record<string, string> = {
  "1": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "56": "0x55d398326f99059ff775485246999027b3197955",
  "137": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  "8453": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "42161": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
};

/** Convenience aliases only. `/supported_chains` remains authoritative. */
const CHAIN_ALIASES: Record<string, string> = {
  ethereum: "1",
  eth: "1",
  mainnet: "1",
  bsc: "56",
  bnb: "56",
  polygon: "137",
  matic: "137",
  arbitrum: "42161",
  arb: "42161",
  optimism: "10",
  op: "10",
  base: "8453",
  avalanche: "43114",
  avax: "43114",
};

/** Fields documented by GoPlus for the Token Security endpoint. */
const KNOWN_PROVIDER_FIELDS = [
  "anti_whale_modifiable",
  "buy_tax",
  "can_take_back_ownership",
  "cannot_buy",
  "cannot_sell_all",
  "creator_address",
  "creator_balance",
  "creator_percent",
  "dex",
  "external_call",
  "fake_token",
  "hidden_owner",
  "holder_count",
  "holders",
  "honeypot_with_same_creator",
  "is_airdrop_scam",
  "is_anti_whale",
  "is_blacklisted",
  "is_honeypot",
  "is_in_cex",
  "is_in_dex",
  "is_mintable",
  "is_open_source",
  "is_proxy",
  "is_true_token",
  "is_verified",
  "is_whitelisted",
  "lp_holder_count",
  "lp_holders",
  "lp_total_supply",
  "note",
  "other_potential_risks",
  "owner_address",
  "owner_balance",
  "owner_change_balance",
  "owner_percent",
  "personal_slippage_modifiable",
  "selfdestruct",
  "sell_tax",
  "slippage_modifiable",
  "token_name",
  "token_symbol",
  "total_supply",
  "trading_cooldown",
  "transfer_pausable",
  "transfer_tax",
  "trust_list",
] as const;

// --------------------------------------------------
// Errors and rate limiting
// --------------------------------------------------

export interface GoPlusApiErrorDetails {
  status: number;
  code: number | null;
  url: string;
  apiMessage: string | null;
}

/** An HTTP or application-level GoPlus failure. */
export class GoPlusApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly url: string;
  readonly apiMessage: string | null;

  constructor(message: string, details: GoPlusApiErrorDetails) {
    super(message);
    this.name = "GoPlusApiError";
    this.status = details.status;
    this.code = details.code;
    this.url = details.url;
    this.apiMessage = details.apiMessage;
  }
}

let requestsPerMinute = readRequestsPerMinuteFromEnv();
let lastRequestStartedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRequestsPerMinuteFromEnv(): number {
  const raw = process.env.GOPLUS_REQUESTS_PER_MINUTE;
  if (!raw) {
    return DEFAULT_REQUESTS_PER_MINUTE;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUESTS_PER_MINUTE;
}

/**
 * Sets the request rate for this process.
 *
 * The free tier allows 30 requests per minute. Slower values are safe; faster
 * values trigger `code: 4029`, which is retried with backoff but still wastes
 * time and requests.
 */
export function setGoPlusRequestsPerMinute(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid GoPlus request rate: ${value}`);
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
    return Math.min(seconds * 1_000, RETRY_MAX_DELAY_MS);
  }

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), RETRY_MAX_DELAY_MS);
  }

  return null;
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

function stringOrNull(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > maxLength ? null : trimmed;
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
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function integerOrNull(value: unknown, min: number, max: number): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function percentOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || parsed < 0 || parsed > 1_000) {
    return null;
  }
  return parsed;
}

/**
 * Parses GoPlus booleans.
 *
 * The provider mixes `"1"`, `"0"`, numbers and missing values. Anything that is
 * not an explicit true/false is null, because "not reported" must never look
 * like "no risk".
 */
export function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "1" || trimmed === "true") {
      return true;
    }
    if (trimmed === "0" || trimmed === "false") {
      return false;
    }
  }

  return null;
}

function evmAddressOrNull(value: unknown): string | null {
  const raw = stringOrNull(value, 42);
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

function hexOrDecimalStringOrNull(value: unknown): string | null {
  const raw = stringOrNull(value, 120);
  if (!raw) {
    return null;
  }
  return /^\d+(\.\d+)?$/.test(raw) ? raw : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of value) {
    const text = stringOrNull(entry, 120);
    if (text !== null) {
      result.push(text);
    }
  }
  return result;
}

// --------------------------------------------------
// Chain and address normalization
// --------------------------------------------------

export interface GoPlusChain {
  id: string;
  name: string | null;
  is_evm: boolean;
}

export interface GoPlusChainList {
  provider: "goplus";
  source_url: string;
  fetched_at: string;
  chains: GoPlusChain[];
  evm_chain_ids: string[];
}

/**
 * Normalizes a chain id or alias to a numeric EVM chain id string.
 *
 * GoPlus also lists `solana` and `tron`; those are rejected here because this
 * collector is built around EVM contract addresses.
 */
export function normalizeChainId(value: string): string {
  const trimmed = value.trim().toLowerCase();

  if (trimmed === "") {
    throw new Error("GoPlus chain id is empty.");
  }

  const resolved = CHAIN_ALIASES[trimmed] ?? trimmed;

  if (resolved === "solana" || resolved === "tron") {
    throw new Error(
      `GoPlus chain "${value}" is not an EVM chain. This collector only handles ` +
        "numeric EVM chain ids; Solana and Tron need a separate collector.",
    );
  }

  if (!/^\d+$/.test(resolved)) {
    throw new Error(
      `Unsupported GoPlus chain "${value}". Use a numeric EVM chain id such as ` +
        "1 (Ethereum) or 137 (Polygon), or an alias like ethereum, bsc or polygon.",
    );
  }

  const normalized = BigInt(resolved).toString();
  if (normalized === "0") {
    throw new Error("GoPlus chain id must be positive.");
  }

  return normalized;
}

/** Lowercases and validates a 20-byte EVM address. */
export function normalizeEvmAddress(value: string, label = "contract"): string {
  const trimmed = value.trim();

  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(
      `GoPlus ${label}: invalid EVM address "${trimmed}". Expected 0x followed ` +
        "by 40 hexadecimal characters.",
    );
  }

  return trimmed.toLowerCase();
}

/** Normalizes the `/supported_chains` result array. */
export function normalizeSupportedChains(rawResult: unknown): GoPlusChain[] {
  if (!Array.isArray(rawResult)) {
    return [];
  }

  const chains: GoPlusChain[] = [];
  const seen = new Set<string>();

  for (const row of rawResult) {
    const record = asJsonObject(row);
    const rawId = record["id"];
    const id =
      typeof rawId === "number" && Number.isInteger(rawId)
        ? String(rawId)
        : stringOrNull(rawId, 40);

    if (id === null || seen.has(id)) {
      continue;
    }

    seen.add(id);
    chains.push({
      id,
      name: stringOrNull(record["name"], 120),
      is_evm: /^\d+$/.test(id),
    });
  }

  return chains;
}

export function buildChainList(
  rawResult: unknown,
  sourceUrl: string,
  fetchedAt: string,
): GoPlusChainList {
  const chains = normalizeSupportedChains(rawResult);

  return {
    provider: "goplus",
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    chains,
    evm_chain_ids: chains.filter((chain) => chain.is_evm).map((chain) => chain.id),
  };
}

/**
 * Confirms that `/supported_chains` lists the requested chain and that it is an
 * EVM chain. The provider list, not a hardcoded table, decides support.
 */
export function assertSupportedChain(chains: GoPlusChain[], chainId: string): GoPlusChain {
  const chain = chains.find((entry) => entry.id === chainId);

  if (!chain) {
    const evmIds = chains
      .filter((entry) => entry.is_evm)
      .map((entry) => entry.id)
      .join(", ");

    throw new Error(
      `GoPlus does not list chain ${chainId} in /supported_chains. Supported EVM ` +
        `chain ids: ${evmIds || "(none returned)"}.`,
    );
  }

  if (!chain.is_evm) {
    throw new Error(
      `GoPlus chain ${chainId} is not an EVM chain id. Use an EVM chain such as ` +
        "1 (Ethereum) or 137 (Polygon).",
    );
  }

  return chain;
}

// --------------------------------------------------
// Provider request
// --------------------------------------------------

function getBaseUrl(): string {
  const configured = process.env.GOPLUS_BASE_URL?.trim();
  const base = configured && configured !== "" ? configured : DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`Invalid GOPLUS_BASE_URL: ${base}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid GOPLUS_BASE_URL protocol: ${parsed.protocol}`);
  }

  return base.replace(/\/+$/, "");
}

function readProviderEnvelope(body: unknown): {
  code: number | null;
  message: string | null;
} {
  const record = asJsonObject(body);
  return {
    code: integerOrNull(record["code"], Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    message: stringOrNull(record["message"], 500),
  };
}

async function requestJson(
  pathName: string,
  label: string,
): Promise<{ body: JsonObject; url: string }> {
  const base = getBaseUrl();
  const url = `${base}${pathName}`;
  let lastNetworkError: Error | null = null;

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    await waitForRateLimit();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastNetworkError = error instanceof Error ? error : new Error(String(error));

      if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
        break;
      }

      await sleep(retryDelayMs(attempt));
      continue;
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`GoPlus ${label}: response was not valid JSON (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const message = `GoPlus ${label} failed: HTTP ${response.status} (${url}).`;

      if (!retryable || attempt === MAX_REQUEST_ATTEMPTS - 1) {
        throw new GoPlusApiError(message, {
          status: response.status,
          code: null,
          url,
          apiMessage: null,
        });
      }

      await sleep(readRetryAfterMs(response) ?? retryDelayMs(attempt));
      continue;
    }

    const envelope = readProviderEnvelope(body);

    if (envelope.code !== PROVIDER_OK) {
      const apiMessage = envelope.message;
      const message =
        `GoPlus ${label} failed: code ${envelope.code ?? "unknown"}` +
        (apiMessage ? ` - ${apiMessage}` : "") +
        ` (${url})`;

      if (envelope.code === PROVIDER_RATE_LIMITED && attempt < MAX_REQUEST_ATTEMPTS - 1) {
        console.warn(`  ! GoPlus rate limit hit; backing off before retry ${attempt + 2}`);
        await sleep(readRetryAfterMs(response) ?? retryDelayMs(attempt));
        continue;
      }

      throw new GoPlusApiError(message, {
        status: response.status,
        code: envelope.code,
        url,
        apiMessage,
      });
    }

    return { body: asJsonObject(body), url };
  }

  throw new Error(
    `GoPlus ${label} failed after ${MAX_REQUEST_ATTEMPTS} attempts: ` +
      (lastNetworkError?.message ?? "network error"),
  );
}

/** Fetches the provider's chain list. No API key is required on the free tier. */
export async function fetchSupportedChains(): Promise<GoPlusChainList> {
  const fetchedAt = new Date().toISOString();
  const { body, url } = await requestJson("/supported_chains", "supported chains");
  const chains = normalizeSupportedChains(body["result"]);

  if (chains.length === 0) {
    throw new Error("GoPlus /supported_chains returned no chains.");
  }

  return buildChainList(body["result"], url, fetchedAt);
}

// --------------------------------------------------
// Token security normalization
// --------------------------------------------------

export type GoPlusRiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface GoPlusRiskFlag {
  id: string;
  severity: GoPlusRiskSeverity;
  label: string;
  evidence: string;
}

export interface GoPlusOwnerControls {
  owner_address: string | null;
  owner_renounced: boolean | null;
  owner_balance: string | null;
  owner_percent: number | null;
  creator_address: string | null;
  creator_percent: number | null;
  can_take_back_ownership: boolean | null;
  hidden_owner: boolean | null;
  owner_change_balance: boolean | null;
  selfdestruct: boolean | null;
  external_call: boolean | null;
}

export interface GoPlusPermissions {
  transfer_pausable: boolean | null;
  is_blacklisted: boolean | null;
  is_whitelisted: boolean | null;
  trading_cooldown: boolean | null;
  personal_slippage_modifiable: boolean | null;
  slippage_modifiable: boolean | null;
  anti_whale_modifiable: boolean | null;
  is_anti_whale: boolean | null;
  cannot_buy: boolean | null;
  cannot_sell_all: boolean | null;
}

export interface GoPlusTaxIndicators {
  buy_tax_percent: number | null;
  sell_tax_percent: number | null;
  transfer_tax_percent: number | null;
}

export interface GoPlusDexListing {
  name: string | null;
  liquidity_type: string | null;
  liquidity: string | null;
  pair: string | null;
  pool_fee: string | null;
}

export interface GoPlusTrading {
  is_honeypot: boolean | null;
  honeypot_with_same_creator: boolean | null;
  is_in_dex: boolean | null;
  is_in_cex: boolean | null;
  cex_list: string[];
  dexes: GoPlusDexListing[];
  lp_holder_count: number | null;
  lp_total_supply: string | null;
}

export interface GoPlusTrustSignals {
  trust_list: boolean | null;
  is_airdrop_scam: boolean | null;
  is_true_token: boolean | null;
  is_verified: boolean | null;
  fake_token: boolean | null;
  other_potential_risks: string | null;
  note: string | null;
}

export interface GoPlusTokenSecurityRecord {
  provider: "goplus";
  chain_id: string;
  chain_name: string | null;
  contract_address: string;
  token_name: string | null;
  token_symbol: string | null;
  checked_at: string;
  source_url: string;
  provider_code: number | null;
  provider_message: string | null;
  found: boolean;
  is_open_source: boolean | null;
  is_proxy: boolean | null;
  is_mintable: boolean | null;
  owner_controls: GoPlusOwnerControls;
  permissions: GoPlusPermissions;
  tax_indicators: GoPlusTaxIndicators;
  trading: GoPlusTrading;
  holders: { count: number | null };
  supply: { provider_total_supply: string | null };
  trust: GoPlusTrustSignals;
  risk_flags: GoPlusRiskFlag[];
  missing_fields: string[];
  security_summary: string;
  limitations: string[];
  raw: JsonObject;
}

export interface GoPlusSecurityContext {
  chainId: string;
  chainName: string | null;
  contractAddress: string;
  checkedAt: string;
  sourceUrl: string;
  providerCode: number | null;
  providerMessage: string | null;
}

function parseOwnerControls(entry: JsonObject): GoPlusOwnerControls {
  const reportedOwner = evmAddressOrNull(entry["owner_address"]);
  const ownerRenounced = reportedOwner === null ? null : reportedOwner === ZERO_ADDRESS;

  return {
    owner_address: ownerRenounced === false ? reportedOwner : null,
    owner_renounced: ownerRenounced,
    owner_balance: hexOrDecimalStringOrNull(entry["owner_balance"]),
    owner_percent: percentOrNull(entry["owner_percent"]),
    creator_address: evmAddressOrNull(entry["creator_address"]),
    creator_percent: percentOrNull(entry["creator_percent"]),
    can_take_back_ownership: booleanOrNull(entry["can_take_back_ownership"]),
    hidden_owner: booleanOrNull(entry["hidden_owner"]),
    owner_change_balance: booleanOrNull(entry["owner_change_balance"]),
    selfdestruct: booleanOrNull(entry["selfdestruct"]),
    external_call: booleanOrNull(entry["external_call"]),
  };
}

function parsePermissions(entry: JsonObject): GoPlusPermissions {
  return {
    transfer_pausable: booleanOrNull(entry["transfer_pausable"]),
    is_blacklisted: booleanOrNull(entry["is_blacklisted"]),
    is_whitelisted: booleanOrNull(entry["is_whitelisted"]),
    trading_cooldown: booleanOrNull(entry["trading_cooldown"]),
    personal_slippage_modifiable: booleanOrNull(entry["personal_slippage_modifiable"]),
    slippage_modifiable: booleanOrNull(entry["slippage_modifiable"]),
    anti_whale_modifiable: booleanOrNull(entry["anti_whale_modifiable"]),
    is_anti_whale: booleanOrNull(entry["is_anti_whale"]),
    cannot_buy: booleanOrNull(entry["cannot_buy"]),
    cannot_sell_all: booleanOrNull(entry["cannot_sell_all"]),
  };
}

function parseTaxIndicators(entry: JsonObject): GoPlusTaxIndicators {
  return {
    buy_tax_percent: percentOrNull(entry["buy_tax"]),
    sell_tax_percent: percentOrNull(entry["sell_tax"]),
    transfer_tax_percent: percentOrNull(entry["transfer_tax"]),
  };
}

function parseDexListings(value: unknown): GoPlusDexListing[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const listings: GoPlusDexListing[] = [];
  for (const row of value) {
    const record = asJsonObject(row);
    const listing: GoPlusDexListing = {
      name: stringOrNull(record["name"], 120),
      liquidity_type: stringOrNull(record["liquidity_type"], 60),
      liquidity: hexOrDecimalStringOrNull(record["liquidity"]),
      pair: stringOrNull(record["pair"], 120),
      pool_fee: stringOrNull(record["pool_fee"], 40),
    };

    if (
      listing.name === null &&
      listing.liquidity_type === null &&
      listing.liquidity === null &&
      listing.pair === null
    ) {
      continue;
    }

    listings.push(listing);
  }

  return listings;
}

function parseTrading(entry: JsonObject): GoPlusTrading {
  const cex = entry["is_in_cex"];
  let cexListed: boolean | null;
  let cexList: string[];

  if (isJsonObject(cex)) {
    cexListed = booleanOrNull(cex["listed"]);
    cexList = stringArray(cex["cex_list"]);
  } else {
    cexListed = booleanOrNull(cex);
    cexList = [];
  }

  return {
    is_honeypot: booleanOrNull(entry["is_honeypot"]),
    honeypot_with_same_creator: booleanOrNull(entry["honeypot_with_same_creator"]),
    is_in_dex: booleanOrNull(entry["is_in_dex"]),
    is_in_cex: cexListed,
    cex_list: cexList,
    dexes: parseDexListings(entry["dex"]),
    lp_holder_count: integerOrNull(entry["lp_holder_count"], 0, Number.MAX_SAFE_INTEGER),
    lp_total_supply: hexOrDecimalStringOrNull(entry["lp_total_supply"]),
  };
}

function parseTrustSignals(entry: JsonObject): GoPlusTrustSignals {
  return {
    trust_list: booleanOrNull(entry["trust_list"]),
    is_airdrop_scam: booleanOrNull(entry["is_airdrop_scam"]),
    is_true_token: booleanOrNull(entry["is_true_token"]),
    is_verified: booleanOrNull(entry["is_verified"]),
    fake_token: booleanOrNull(entry["fake_token"]),
    other_potential_risks: stringOrNull(entry["other_potential_risks"], 500),
    note: stringOrNull(entry["note"], 500),
  };
}

/**
 * Converts one provider entry into the normalized security record.
 *
 * Missing or unparseable fields stay null. They are never coerced to false,
 * because "the provider did not report this" is not the same as "the risk is
 * absent".
 */
export function normalizeTokenSecurity(
  rawEntry: unknown,
  context: GoPlusSecurityContext,
): GoPlusTokenSecurityRecord {
  const entry = asJsonObject(rawEntry);
  const found = Object.keys(entry).length > 0;
  const missingFields = KNOWN_PROVIDER_FIELDS.filter((field) => !(field in entry));

  const record: GoPlusTokenSecurityRecord = {
    provider: "goplus",
    chain_id: context.chainId,
    chain_name: context.chainName,
    contract_address: context.contractAddress,
    token_name: stringOrNull(entry["token_name"], 200),
    token_symbol: stringOrNull(entry["token_symbol"], 60),
    checked_at: context.checkedAt,
    source_url: context.sourceUrl,
    provider_code: context.providerCode,
    provider_message: context.providerMessage,
    found,
    is_open_source: booleanOrNull(entry["is_open_source"]),
    is_proxy: booleanOrNull(entry["is_proxy"]),
    is_mintable: booleanOrNull(entry["is_mintable"]),
    owner_controls: parseOwnerControls(entry),
    permissions: parsePermissions(entry),
    tax_indicators: parseTaxIndicators(entry),
    trading: parseTrading(entry),
    holders: {
      count: integerOrNull(entry["holder_count"], 0, Number.MAX_SAFE_INTEGER),
    },
    supply: {
      provider_total_supply: hexOrDecimalStringOrNull(entry["total_supply"]),
    },
    trust: parseTrustSignals(entry),
    risk_flags: [],
    missing_fields: missingFields,
    security_summary: "",
    limitations: [
      "Provider-reported indicators; not independently verified and not proof of safety or malice.",
      "Tax percentages and holder counts are provider estimates.",
      "Holder addresses are not enumerated in the normalized record; the raw entry is preserved.",
      "One contract per request: a multi-address request returned a single entry in live testing.",
    ],
    raw: entry,
  };

  record.risk_flags = deriveRiskFlags(record);
  record.security_summary = summarizeTokenSecurity(record);

  return record;
}

// --------------------------------------------------
// Risk flags and summary
// --------------------------------------------------

function flag(
  id: string,
  severity: GoPlusRiskSeverity,
  label: string,
  evidence: string,
): GoPlusRiskFlag {
  return { id, severity, label, evidence };
}

/**
 * Derives deterministic risk flags from explicit provider findings only.
 *
 * Thresholds for taxes and ownership share are chosen by this collector, not by
 * GoPlus, and are stated in the evidence text.
 */
export function deriveRiskFlags(record: GoPlusTokenSecurityRecord): GoPlusRiskFlag[] {
  const flags: GoPlusRiskFlag[] = [];
  const owner = record.owner_controls;
  const permissions = record.permissions;
  const taxes = record.tax_indicators;
  const trading = record.trading;
  const trust = record.trust;

  if (trading.is_honeypot === true) {
    flags.push(flag("honeypot", "critical", "Honeypot", "is_honeypot=true"));
  }
  if (trading.honeypot_with_same_creator === true) {
    flags.push(
      flag(
        "honeypot_same_creator",
        "high",
        "Honeypot by the same creator",
        "honeypot_with_same_creator=true",
      ),
    );
  }
  if (permissions.cannot_buy === true) {
    flags.push(flag("cannot_buy", "high", "Cannot buy", "cannot_buy=true"));
  }
  if (permissions.cannot_sell_all === true) {
    flags.push(flag("cannot_sell_all", "high", "Cannot sell all", "cannot_sell_all=true"));
  }
  if (owner.hidden_owner === true) {
    flags.push(flag("hidden_owner", "high", "Hidden owner", "hidden_owner=true"));
  }
  if (owner.owner_change_balance === true) {
    flags.push(
      flag(
        "owner_can_change_balance",
        "critical",
        "Owner can change balances",
        "owner_change_balance=true",
      ),
    );
  }
  if (owner.can_take_back_ownership === true) {
    flags.push(
      flag(
        "owner_can_reclaim",
        "high",
        "Owner can reclaim ownership",
        "can_take_back_ownership=true",
      ),
    );
  }
  if (owner.selfdestruct === true) {
    flags.push(flag("selfdestruct", "high", "Self-destruct", "selfdestruct=true"));
  }
  if (owner.external_call === true) {
    flags.push(flag("external_call", "medium", "External call", "external_call=true"));
  }
  if (record.is_mintable === true) {
    flags.push(flag("mintable", "medium", "Supply is mintable", "is_mintable=true"));
  }
  if (permissions.transfer_pausable === true) {
    flags.push(
      flag("transfer_pausable", "medium", "Transfers can be paused", "transfer_pausable=true"),
    );
  }
  if (permissions.is_blacklisted === true) {
    flags.push(flag("blacklist", "medium", "Blacklist function", "is_blacklisted=true"));
  }
  if (permissions.is_whitelisted === true) {
    flags.push(flag("whitelist", "low", "Whitelist function", "is_whitelisted=true"));
  }
  if (permissions.trading_cooldown === true) {
    flags.push(flag("trading_cooldown", "low", "Trading cooldown", "trading_cooldown=true"));
  }
  if (permissions.slippage_modifiable === true) {
    flags.push(
      flag("slippage_modifiable", "medium", "Slippage can be changed", "slippage_modifiable=true"),
    );
  }
  if (permissions.personal_slippage_modifiable === true) {
    flags.push(
      flag(
        "personal_slippage_modifiable",
        "medium",
        "Per-address slippage can be changed",
        "personal_slippage_modifiable=true",
      ),
    );
  }
  if (permissions.anti_whale_modifiable === true) {
    flags.push(
      flag(
        "anti_whale_modifiable",
        "low",
        "Anti-whale limits can be changed",
        "anti_whale_modifiable=true",
      ),
    );
  }
  if (permissions.is_anti_whale === true) {
    flags.push(flag("anti_whale", "low", "Anti-whale limits", "is_anti_whale=true"));
  }
  if (record.is_open_source === false) {
    flags.push(flag("closed_source", "medium", "Closed source", "is_open_source=false"));
  }
  if (record.is_proxy === true) {
    flags.push(flag("proxy_contract", "info", "Proxy contract", "is_proxy=true"));
  }
  if (taxes.buy_tax_percent !== null && taxes.buy_tax_percent >= TAX_PERCENT_RISK_THRESHOLD) {
    flags.push(
      flag(
        "high_buy_tax",
        "medium",
        "High buy tax",
        `buy_tax=${taxes.buy_tax_percent}% (collector threshold ${TAX_PERCENT_RISK_THRESHOLD}%)`,
      ),
    );
  }
  if (taxes.sell_tax_percent !== null && taxes.sell_tax_percent >= TAX_PERCENT_RISK_THRESHOLD) {
    flags.push(
      flag(
        "high_sell_tax",
        "high",
        "High sell tax",
        `sell_tax=${taxes.sell_tax_percent}% (collector threshold ${TAX_PERCENT_RISK_THRESHOLD}%)`,
      ),
    );
  }
  if (
    taxes.transfer_tax_percent !== null &&
    taxes.transfer_tax_percent >= TAX_PERCENT_RISK_THRESHOLD
  ) {
    flags.push(
      flag(
        "high_transfer_tax",
        "high",
        "High transfer tax",
        `transfer_tax=${taxes.transfer_tax_percent}% (collector threshold ${TAX_PERCENT_RISK_THRESHOLD}%)`,
      ),
    );
  }
  if (trading.is_in_dex === false) {
    flags.push(flag("no_dex_market", "low", "No DEX market", "is_in_dex=false"));
  }
  if (
    trading.is_in_dex === true &&
    trading.lp_holder_count !== null &&
    trading.lp_holder_count === 0
  ) {
    flags.push(
      flag("no_liquidity_providers", "low", "No liquidity providers", "lp_holder_count=0"),
    );
  }
  if (trust.is_airdrop_scam === true) {
    flags.push(flag("airdrop_scam", "high", "Airdrop scam", "is_airdrop_scam=true"));
  }
  if (trust.fake_token === true) {
    flags.push(flag("fake_token", "high", "Fake token", "fake_token=true"));
  }
  if (trust.is_true_token === false) {
    flags.push(flag("not_true_token", "high", "Not the true token", "is_true_token=false"));
  }
  if (trust.other_potential_risks !== null) {
    flags.push(
      flag("other_potential_risks", "medium", "Other potential risks", trust.other_potential_risks),
    );
  }
  if (trust.note !== null) {
    flags.push(flag("provider_note", "info", "Provider note", trust.note));
  }
  if (owner.creator_percent !== null && owner.creator_percent >= OWNERSHIP_PERCENT_RISK_THRESHOLD) {
    flags.push(
      flag(
        "creator_holds_large_share",
        "medium",
        "Creator holds a large share",
        `creator_percent=${owner.creator_percent}% (collector threshold ${OWNERSHIP_PERCENT_RISK_THRESHOLD}%)`,
      ),
    );
  }
  if (owner.owner_percent !== null && owner.owner_percent >= OWNERSHIP_PERCENT_RISK_THRESHOLD) {
    flags.push(
      flag(
        "owner_holds_large_share",
        "medium",
        "Owner holds a large share",
        `owner_percent=${owner.owner_percent}% (collector threshold ${OWNERSHIP_PERCENT_RISK_THRESHOLD}%)`,
      ),
    );
  }

  return flags;
}

const SEVERITY_ORDER: Record<GoPlusRiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function triStateLabel(value: boolean | null): string {
  return value === null ? "unknown" : value ? "yes" : "no";
}

function describeOwner(owner: GoPlusOwnerControls): string {
  if (owner.owner_renounced === true) {
    return "owner renounced";
  }
  if (owner.owner_address !== null) {
    return `owner ${owner.owner_address}`;
  }
  return "owner unknown";
}

/**
 * Builds a short summary from explicit findings.
 *
 * A clean result is described as "no indicators matching this collector's
 * checks", never as "safe", because the provider only reports what it models.
 */
export function summarizeTokenSecurity(record: GoPlusTokenSecurityRecord): string {
  if (!record.found) {
    return (
      "GoPlus returned no security entry for this contract. The token may be " +
      "unindexed, newly deployed or unsupported; no conclusion about its safety " +
      "can be drawn."
    );
  }

  const context =
    `Open source: ${triStateLabel(record.is_open_source)}; ` +
    `proxy: ${triStateLabel(record.is_proxy)}; ` +
    `${describeOwner(record.owner_controls)}.`;

  if (record.risk_flags.length === 0) {
    return (
      "GoPlus reported no risk indicator matching this collector's checks. " +
      `${context} Absence of flags is not evidence that the token is safe.`
    );
  }

  const highest = [...record.risk_flags].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  )[0];

  const ids = record.risk_flags
    .slice(0, 4)
    .map((entry) => entry.id)
    .join(", ");
  const more = record.risk_flags.length > 4 ? ` and ${record.risk_flags.length - 4} more` : "";

  return (
    `GoPlus reported ${record.risk_flags.length} risk indicator(s), highest ` +
    `severity ${highest?.severity ?? "unknown"}: ${ids}${more}. ` +
    `${context} Provider-reported indicators are not proof of malicious behaviour.`
  );
}

// --------------------------------------------------
// Snapshots and change detection
// --------------------------------------------------

export interface GoPlusSecuritySnapshot {
  checked_at: string;
  is_open_source: boolean | null;
  is_proxy: boolean | null;
  is_mintable: boolean | null;
  owner_address: string | null;
  owner_renounced: boolean | null;
  owner_can_take_back_ownership: boolean | null;
  owner_hidden: boolean | null;
  owner_can_change_balance: boolean | null;
  transfer_pausable: boolean | null;
  is_blacklisted: boolean | null;
  is_whitelisted: boolean | null;
  trading_cooldown: boolean | null;
  personal_slippage_modifiable: boolean | null;
  slippage_modifiable: boolean | null;
  anti_whale_modifiable: boolean | null;
  is_anti_whale: boolean | null;
  cannot_buy: boolean | null;
  cannot_sell_all: boolean | null;
  is_honeypot: boolean | null;
  honeypot_with_same_creator: boolean | null;
  buy_tax_percent: number | null;
  sell_tax_percent: number | null;
  transfer_tax_percent: number | null;
  risk_flag_ids: string[];
  security_summary: string;
}

/** Fields compared between snapshots. Timestamps and summaries are excluded. */
const SNAPSHOT_DIFF_FIELDS = [
  "is_open_source",
  "is_proxy",
  "is_mintable",
  "owner_address",
  "owner_renounced",
  "owner_can_take_back_ownership",
  "owner_hidden",
  "owner_can_change_balance",
  "transfer_pausable",
  "is_blacklisted",
  "is_whitelisted",
  "trading_cooldown",
  "personal_slippage_modifiable",
  "slippage_modifiable",
  "anti_whale_modifiable",
  "is_anti_whale",
  "cannot_buy",
  "cannot_sell_all",
  "is_honeypot",
  "honeypot_with_same_creator",
  "buy_tax_percent",
  "sell_tax_percent",
  "transfer_tax_percent",
  "risk_flag_ids",
] as const;

/** Compact point-in-time view used for the audit history and diffing. */
export function buildSecuritySnapshot(record: GoPlusTokenSecurityRecord): GoPlusSecuritySnapshot {
  return {
    checked_at: record.checked_at,
    is_open_source: record.is_open_source,
    is_proxy: record.is_proxy,
    is_mintable: record.is_mintable,
    owner_address: record.owner_controls.owner_address,
    owner_renounced: record.owner_controls.owner_renounced,
    owner_can_take_back_ownership: record.owner_controls.can_take_back_ownership,
    owner_hidden: record.owner_controls.hidden_owner,
    owner_can_change_balance: record.owner_controls.owner_change_balance,
    transfer_pausable: record.permissions.transfer_pausable,
    is_blacklisted: record.permissions.is_blacklisted,
    is_whitelisted: record.permissions.is_whitelisted,
    trading_cooldown: record.permissions.trading_cooldown,
    personal_slippage_modifiable: record.permissions.personal_slippage_modifiable,
    slippage_modifiable: record.permissions.slippage_modifiable,
    anti_whale_modifiable: record.permissions.anti_whale_modifiable,
    is_anti_whale: record.permissions.is_anti_whale,
    cannot_buy: record.permissions.cannot_buy,
    cannot_sell_all: record.permissions.cannot_sell_all,
    is_honeypot: record.trading.is_honeypot,
    honeypot_with_same_creator: record.trading.honeypot_with_same_creator,
    buy_tax_percent: record.tax_indicators.buy_tax_percent,
    sell_tax_percent: record.tax_indicators.sell_tax_percent,
    transfer_tax_percent: record.tax_indicators.transfer_tax_percent,
    risk_flag_ids: record.risk_flags.map((entry) => entry.id),
    security_summary: record.security_summary,
  };
}

/** Re-reads a stored snapshot defensively so a corrupt row cannot crash a run. */
export function coerceSecuritySnapshot(value: unknown): GoPlusSecuritySnapshot | null {
  const record = asJsonObject(value);
  const checkedAt = stringOrNull(record["checked_at"], 60);

  if (checkedAt === null) {
    return null;
  }

  return {
    checked_at: checkedAt,
    is_open_source: booleanOrNull(record["is_open_source"]),
    is_proxy: booleanOrNull(record["is_proxy"]),
    is_mintable: booleanOrNull(record["is_mintable"]),
    owner_address: evmAddressOrNull(record["owner_address"]),
    owner_renounced: booleanOrNull(record["owner_renounced"]),
    owner_can_take_back_ownership: booleanOrNull(record["owner_can_take_back_ownership"]),
    owner_hidden: booleanOrNull(record["owner_hidden"]),
    owner_can_change_balance: booleanOrNull(record["owner_can_change_balance"]),
    transfer_pausable: booleanOrNull(record["transfer_pausable"]),
    is_blacklisted: booleanOrNull(record["is_blacklisted"]),
    is_whitelisted: booleanOrNull(record["is_whitelisted"]),
    trading_cooldown: booleanOrNull(record["trading_cooldown"]),
    personal_slippage_modifiable: booleanOrNull(record["personal_slippage_modifiable"]),
    slippage_modifiable: booleanOrNull(record["slippage_modifiable"]),
    anti_whale_modifiable: booleanOrNull(record["anti_whale_modifiable"]),
    is_anti_whale: booleanOrNull(record["is_anti_whale"]),
    cannot_buy: booleanOrNull(record["cannot_buy"]),
    cannot_sell_all: booleanOrNull(record["cannot_sell_all"]),
    is_honeypot: booleanOrNull(record["is_honeypot"]),
    honeypot_with_same_creator: booleanOrNull(record["honeypot_with_same_creator"]),
    buy_tax_percent: percentOrNull(record["buy_tax_percent"]),
    sell_tax_percent: percentOrNull(record["sell_tax_percent"]),
    transfer_tax_percent: percentOrNull(record["transfer_tax_percent"]),
    risk_flag_ids: stringArray(record["risk_flag_ids"]),
    security_summary: stringOrNull(record["security_summary"], 2_000) ?? "",
  };
}

export interface GoPlusSecurityHistory {
  provider: "goplus";
  chain_id: string;
  contract_address: string;
  updated_at: string;
  snapshots: GoPlusSecuritySnapshot[];
}

export interface GoPlusSecurityChange {
  field: string;
  before: unknown;
  after: unknown;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  return left === right;
}

/**
 * Compares two snapshots field by field.
 *
 * Only fields that can change meaningfully are compared; timestamps are skipped
 * because every observation has a new one.
 */
export function compareSecuritySnapshots(
  previous: GoPlusSecuritySnapshot,
  current: GoPlusSecuritySnapshot,
): GoPlusSecurityChange[] {
  const changes: GoPlusSecurityChange[] = [];
  const before = previous as unknown as Record<string, unknown>;
  const after = current as unknown as Record<string, unknown>;

  for (const field of SNAPSHOT_DIFF_FIELDS) {
    if (!valuesEqual(before[field], after[field])) {
      changes.push({ field, before: before[field] ?? null, after: after[field] ?? null });
    }
  }

  return changes;
}

/** Appends a snapshot and keeps only the most recent `limit` entries. */
export function appendSecuritySnapshot(
  history: GoPlusSecurityHistory,
  snapshot: GoPlusSecuritySnapshot,
  limit: number,
): GoPlusSecurityHistory {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
    throw new Error(`History limit must be between 1 and ${MAX_HISTORY_LIMIT}.`);
  }

  const snapshots = [...history.snapshots, snapshot].slice(-limit);

  return {
    provider: "goplus",
    chain_id: history.chain_id,
    contract_address: history.contract_address,
    updated_at: snapshot.checked_at,
    snapshots,
  };
}

// --------------------------------------------------
// API functions
// --------------------------------------------------

export interface GoPlusFetchOptions {
  /** Pre-fetched chain list, to avoid a request per token. */
  chains?: GoPlusChain[];
}

/**
 * Fetches security indicators for one EVM contract.
 *
 * One request per contract: the provider returned a single entry for
 * multi-address requests in live testing, so batching cannot be relied on.
 */
export async function fetchTokenSecurity(
  chainIdValue: string,
  contractAddressValue: string,
  options: GoPlusFetchOptions = {},
): Promise<GoPlusTokenSecurityRecord> {
  const chainId = normalizeChainId(chainIdValue);
  const contractAddress = normalizeEvmAddress(contractAddressValue);

  const chains =
    options.chains && options.chains.length > 0
      ? options.chains
      : (await fetchSupportedChains()).chains;
  const chain = assertSupportedChain(chains, chainId);

  const checkedAt = new Date().toISOString();
  const { body, url } = await requestJson(
    `/token_security/${chainId}?contract_addresses=${contractAddress}`,
    `token security ${contractAddress}`,
  );

  const envelope = readProviderEnvelope(body);
  const result = asJsonObject(body["result"]);
  const entry =
    result[contractAddress] ??
    (Object.keys(result).length === 1 ? Object.values(result)[0] : undefined);

  return normalizeTokenSecurity(entry ?? {}, {
    chainId,
    chainName: chain.name,
    contractAddress,
    checkedAt,
    sourceUrl: url,
    providerCode: envelope.code,
    providerMessage: envelope.message,
  });
}

// --------------------------------------------------
// Local persistence
// --------------------------------------------------

async function loadHistory(
  filePath: string,
): Promise<{ status: "missing" | "ok" | "invalid"; history: GoPlusSecurityHistory | null }> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", history: null };
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const record = asJsonObject(parsed);
    const chainId = stringOrNull(record["chain_id"], 40);
    const contractAddress = evmAddressOrNull(record["contract_address"]);
    const rawSnapshots = record["snapshots"];

    if (chainId === null || contractAddress === null || !Array.isArray(rawSnapshots)) {
      return { status: "invalid", history: null };
    }

    const snapshots: GoPlusSecuritySnapshot[] = [];
    for (const value of rawSnapshots) {
      const snapshot = coerceSecuritySnapshot(value);
      if (snapshot !== null) {
        snapshots.push(snapshot);
      }
    }

    return {
      status: "ok",
      history: {
        provider: "goplus",
        chain_id: chainId,
        contract_address: contractAddress,
        updated_at: stringOrNull(record["updated_at"], 60) ?? new Date().toISOString(),
        snapshots,
      },
    };
  } catch {
    return { status: "invalid", history: null };
  }
}

async function saveJson(outputDir: string, filename: string, data: unknown): Promise<void> {
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  console.log(`  ✓ Wrote ${filePath}`);
}

// --------------------------------------------------
// CLI
// --------------------------------------------------

const MODES = ["chains", "token", "all", "compare"] as const;
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

function parsePositiveInteger(value: string | null, fallback: number, label: string): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer, got "${value}".`);
  }
  return parsed;
}

function parseBoolean(value: string | null, fallback: boolean, label: string): boolean {
  if (value === null) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`--${label} must be "true" or "false", got "${value}".`);
}

function parseTokenList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") {
      continue;
    }
    const address = normalizeEvmAddress(trimmed, "token");
    if (!seen.has(address)) {
      seen.add(address);
      tokens.push(address);
    }
  }

  return tokens;
}

function severityCounts(flags: GoPlusRiskFlag[]): string {
  const counts: Record<GoPlusRiskSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const entry of flags) {
    counts[entry.severity] += 1;
  }

  return Object.entries(counts)
    .map(([severity, count]) => `${severity}:${count}`)
    .join(" ");
}

function printHelp(): void {
  console.log(`GoPlus Security token risk collector

Usage:
  npx tsx collectors/assets/crypto/goplusFetchers.ts --mode=token --chain=1 --token=0x...

Modes:
  chains     Fetch /supported_chains and write the provider's chain list.
  token      Fetch security indicators for each --token contract.
  all        chains + token.
  compare    Diff the last two stored snapshots for one contract.

Options:
  --chain=1              Numeric EVM chain id or alias (default 1).
  --token=0x...          Contract(s), comma separated. Defaults to USDC/USDT
                         for a few well-known chains.
  --rpm=30               Requests per minute (free tier limit is 30).
  --history=true         Append a compact snapshot to the audit history.
  --history-limit=200    Snapshots kept per contract (1-2000).
  --output-dir=...       Default collectors/assets/crypto/data.
  --help                 Show this message.

No API key is required for the public API. GOPLUS_BASE_URL overrides the base
URL if a mirror is used. GOPLUS_REQUESTS_PER_MINUTE sets the default rate.

Provider indicators are signals, not verdicts. Missing fields stay null and are
never treated as "no risk". One request is issued per contract because
multi-address requests returned a single entry in live testing.
`);
}

async function runChains(outputDir: string): Promise<void> {
  const chainList = await fetchSupportedChains();
  await saveJson(outputDir, "goplus supported_chains.json", chainList);
  console.log(
    `  ✓ chains: ${chainList.chains.length} supported, ` + `${chainList.evm_chain_ids.length} EVM`,
  );
}

async function runToken(
  outputDir: string,
  chainId: string,
  chains: GoPlusChain[],
  token: string,
  options: { history: boolean; historyLimit: number },
): Promise<void> {
  const record = await fetchTokenSecurity(chainId, token, { chains });
  const filename = `goplus security_${chainId}_${token}.json`;
  await saveJson(outputDir, filename, record);

  console.log(
    `  ✓ security ${token} (${record.token_symbol ?? "unknown"}): ` +
      `${record.found ? "found" : "no entry"}, ` +
      severityCounts(record.risk_flags),
  );

  if (!options.history) {
    return;
  }

  const historyPath = path.join(outputDir, `goplus history_${chainId}_${token}.json`);
  const loaded = await loadHistory(historyPath);

  if (loaded.status === "invalid") {
    console.warn(`  ! ${historyPath} is unreadable; leaving it untouched and skipping history`);
    return;
  }

  const emptyHistory: GoPlusSecurityHistory = {
    provider: "goplus",
    chain_id: chainId,
    contract_address: token,
    updated_at: record.checked_at,
    snapshots: [],
  };

  const nextHistory = appendSecuritySnapshot(
    loaded.history ?? emptyHistory,
    buildSecuritySnapshot(record),
    options.historyLimit,
  );

  await saveJson(outputDir, `goplus history_${chainId}_${token}.json`, nextHistory);
  console.log(`  ✓ history ${token} (${nextHistory.snapshots.length} snapshot(s))`);
}

async function runCompare(outputDir: string, chainId: string, token: string): Promise<void> {
  const historyPath = path.join(outputDir, `goplus history_${chainId}_${token}.json`);
  const loaded = await loadHistory(historyPath);

  if (loaded.status === "missing") {
    throw new Error(
      `No history file at ${historyPath}. Run --mode=token at least twice with ` +
        "--history=true before comparing.",
    );
  }

  if (loaded.status === "invalid" || loaded.history === null) {
    throw new Error(`History file ${historyPath} is unreadable.`);
  }

  const snapshots = loaded.history.snapshots;
  if (snapshots.length < 2) {
    console.log(`  ✓ ${token}: only ${snapshots.length} snapshot(s); nothing to compare yet`);
    return;
  }

  const previous = snapshots[snapshots.length - 2];
  const current = snapshots[snapshots.length - 1];

  if (previous === undefined || current === undefined) {
    return;
  }

  const changes = compareSecuritySnapshots(previous, current);

  if (changes.length === 0) {
    console.log(`  ✓ ${token}: no material change since ${previous.checked_at}`);
    return;
  }

  const report = {
    provider: "goplus" as const,
    chain_id: chainId,
    contract_address: token,
    from_checked_at: previous.checked_at,
    to_checked_at: current.checked_at,
    change_count: changes.length,
    changes,
  };

  await saveJson(outputDir, `goplus change_${chainId}_${token}.json`, report);
  console.log(`  ✓ change ${token}: ${changes.length} field(s) changed`);

  for (const change of changes) {
    console.log(
      `    - ${change.field}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    printHelp();
    return;
  }

  const mode = parseMode(getArg("mode") ?? "all");
  const chainId = normalizeChainId(getArg("chain") ?? DEFAULT_CHAIN_ID);
  const requestsPerMinute = parsePositiveInteger(getArg("rpm"), DEFAULT_REQUESTS_PER_MINUTE, "rpm");
  const history = parseBoolean(getArg("history"), true, "history");
  const historyLimit = parsePositiveInteger(
    getArg("history-limit"),
    DEFAULT_HISTORY_LIMIT,
    "history-limit",
  );
  const outputDir = path.resolve(process.cwd(), getArg("output-dir") ?? DEFAULT_OUTPUT_DIR);

  if (historyLimit > MAX_HISTORY_LIMIT) {
    throw new Error(`--history-limit cannot exceed ${MAX_HISTORY_LIMIT}.`);
  }

  setGoPlusRequestsPerMinute(requestsPerMinute);
  await fs.mkdir(outputDir, { recursive: true });

  if (mode === "compare") {
    const requested = parseTokenList(getArg("token"));
    const token = requested[0] ?? DEFAULT_TOKENS_BY_CHAIN[chainId];

    if (!token) {
      throw new Error("--mode=compare requires --token=0x...");
    }

    console.log(`GoPlus compare: chain=${chainId} token=${token}`);
    await runCompare(outputDir, chainId, token);
    return;
  }

  const tokensArg = parseTokenList(getArg("token"));
  const defaultToken = DEFAULT_TOKENS_BY_CHAIN[chainId];
  const tokens = tokensArg.length > 0 ? tokensArg : defaultToken ? [defaultToken] : [];

  if (mode !== "chains" && tokens.length === 0) {
    throw new Error(
      `--mode=${mode} requires --token=0x... for chain ${chainId}. ` +
        "No default token is configured for this chain.",
    );
  }

  if (tokens.length > MAX_TOKENS_PER_RUN) {
    throw new Error(`--token accepts at most ${MAX_TOKENS_PER_RUN} contracts per run.`);
  }

  console.log(
    `GoPlus collection: mode=${mode} chain=${chainId} rpm=${requestsPerMinute}` +
      (tokens.length > 0 ? ` tokens=${tokens.join(",")}` : ""),
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

  let chains: GoPlusChain[] = [];

  if (mode === "chains" || mode === "token" || mode === "all") {
    await runStep("chains", async () => {
      const chainList = await fetchSupportedChains();
      chains = chainList.chains;
      await saveJson(outputDir, "goplus supported_chains.json", chainList);
      console.log(
        `  ✓ chains: ${chainList.chains.length} supported, ` +
          `${chainList.evm_chain_ids.length} EVM`,
      );
    });
  }

  if (chains.length === 0) {
    console.error("GoPlus chain list unavailable; cannot validate the chain id.");
    process.exitCode = 1;
    return;
  }

  if (mode === "chains") {
    // Nothing else to do.
  } else if (mode === "token" || mode === "all") {
    for (const token of tokens) {
      await runStep(`security ${token}`, async () => {
        await runToken(outputDir, chainId, chains, token, { history, historyLimit });
      });
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} GoPlus step(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nGoPlus collection complete. Output: ${outputDir}`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("GoPlus collection failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
