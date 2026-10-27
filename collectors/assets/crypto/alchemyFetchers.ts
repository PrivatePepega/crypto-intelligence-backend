import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Alchemy on-chain collector for EVM token metadata, bytecode, supply,
 * wallet balances and historical token transfers.
 *
 * Alchemy is a per-network RPC provider, not a global asset directory. Each
 * network has its own endpoint and its own set of enabled APIs. The collector
 * supports the EVM networks configured in `.env`:
 *
 *   ethereum  ALCHEMY_ETH_ENDPOINT        chain id 1
 *   base      ALCHEMY_BASE_ENDPOINT       chain id 8453
 *   arbitrum  ALCHEMY_ARBITRUM_ENDPOINT   chain id 42161
 *   polygon   ALCHEMY_POLYGON_ENDPOINT    chain id 137
 *
 * Solana is deliberately excluded: it is not an EVM network and does not
 * support these JSON-RPC methods.
 *
 * Methods used:
 *
 *   eth_blockNumber
 *   alchemy_getTokenMetadata       name, symbol, decimals, logo
 *   eth_getCode                    runtime bytecode (hash and size only)
 *   eth_call                       0x18160ddd = totalSupply()
 *   alchemy_getTokenBalances       balances for a known wallet
 *   alchemy_getAssetTransfers      historical transfers in a bounded range
 *
 * Important limits:
 *
 *   - Bytecode is runtime hex, not verified Solidity source. Only its SHA-256
 *     hash, size and deterministic selector findings are persisted.
 *   - Alchemy metadata is network-specific contract metadata. It does not
 *     establish canonical asset identity; compare it with CoinGecko first.
 *   - `alchemy_getTokenBalances` does not enumerate holders. It only answers
 *     for a wallet the caller already knows.
 *   - Transfer scans are bounded by block range and pagination; checkpoints
 *     make repeated scans incremental instead of starting at block zero.
 *   - The API key is embedded in the endpoint URL, so all recorded URLs and
 *     error messages redact it.
 *
 * Run with:
 *   npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=all --network=polygon
 *   npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=token --network=ethereum --token=0xa0b8...
 *   npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=balances --network=polygon --wallet=0x...
 *   npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=transfers --network=polygon --block-window=2000
 *   npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=transfers --from-block=96000000 --to-block=96001000
 */

const DEFAULT_OUTPUT_DIR = "collectors/assets/crypto/data";
const DEFAULT_NETWORK: AlchemyNetwork = "ethereum";
const DEFAULT_REQUESTS_PER_SECOND = 5;
const DEFAULT_BLOCK_WINDOW = 5_000;
const DEFAULT_MAX_BLOCK_RANGE = 50_000;
const DEFAULT_MAX_COUNT = 100;
const DEFAULT_MAX_PAGES = 1;
const MAX_MAX_COUNT = 1_000;
const MAX_MAX_PAGES = 100;
const MAX_TOKENS = 50;

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;

const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

const ALCHEMY_NETWORKS = ["ethereum", "base", "arbitrum", "polygon"] as const;
export type AlchemyNetwork = (typeof ALCHEMY_NETWORKS)[number];

interface AlchemyNetworkConfig {
  endpointEnv: string;
  chainId: number;
  explorerBaseUrl: string;
  nativeSymbol: string;
  label: string;
  defaultToken: string;
}

const ALCHEMY_NETWORK_CONFIG: Record<AlchemyNetwork, AlchemyNetworkConfig> = {
  ethereum: {
    endpointEnv: "ALCHEMY_ETH_ENDPOINT",
    chainId: 1,
    explorerBaseUrl: "https://etherscan.io",
    nativeSymbol: "ETH",
    label: "Ethereum Mainnet",
    defaultToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
  base: {
    endpointEnv: "ALCHEMY_BASE_ENDPOINT",
    chainId: 8453,
    explorerBaseUrl: "https://basescan.org",
    nativeSymbol: "ETH",
    label: "Base Mainnet",
    defaultToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  },
  arbitrum: {
    endpointEnv: "ALCHEMY_ARBITRUM_ENDPOINT",
    chainId: 42161,
    explorerBaseUrl: "https://arbiscan.io",
    nativeSymbol: "ETH",
    label: "Arbitrum One",
    defaultToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  },
  polygon: {
    endpointEnv: "ALCHEMY_POLYGON_ENDPOINT",
    chainId: 137,
    explorerBaseUrl: "https://polygonscan.com",
    nativeSymbol: "POL",
    label: "Polygon Mainnet",
    defaultToken: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  },
};

const NETWORK_ALIASES: Record<string, AlchemyNetwork> = {
  eth: "ethereum",
  ethereum: "ethereum",
  mainnet: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  polygon: "polygon",
  matic: "polygon",
};

const TRANSFER_CATEGORIES = [
  "external",
  "internal",
  "erc20",
  "erc721",
  "erc1155",
  "specialnft",
] as const;
export type AlchemyTransferCategory = (typeof TRANSFER_CATEGORIES)[number];

const ERC20_SELECTORS = [
  { name: "name", selector: "06fdde03" },
  { name: "symbol", selector: "95d89b41" },
  { name: "decimals", selector: "313ce567" },
  { name: "totalSupply", selector: "18160ddd" },
  { name: "balanceOf", selector: "70a08231" },
  { name: "transfer", selector: "a9059cbb" },
  { name: "transferFrom", selector: "23b872dd" },
  { name: "approve", selector: "095ea7b3" },
  { name: "allowance", selector: "dd62ed3e" },
] as const;

const MINIMAL_PROXY_PATTERN =
  /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/;

const PROXY_SELECTORS = [
  { name: "implementation", selector: "5c60da1b" },
  { name: "upgradeTo", selector: "3659cfe6" },
  { name: "upgradeToAndCall", selector: "4f1ef286" },
] as const;

// --------------------------------------------------
// Network and input validation
// --------------------------------------------------

/** Resolves a network name or alias to a supported EVM network. */
export function normalizeAlchemyNetwork(value: string): AlchemyNetwork {
  const normalized = value.trim().toLowerCase();

  if (normalized === "solana" || normalized === "sol") {
    throw new Error(
      "Alchemy Solana is not supported by this collector: Solana is not an EVM " +
        "network and does not implement these JSON-RPC methods.",
    );
  }

  const resolved = NETWORK_ALIASES[normalized];
  if (!resolved) {
    throw new Error(
      `Unsupported Alchemy network "${value}". Supported EVM networks: ` +
        `${ALCHEMY_NETWORKS.join(", ")}.`,
    );
  }

  return resolved;
}

export function getAlchemyChainId(network: AlchemyNetwork): number {
  return ALCHEMY_NETWORK_CONFIG[network].chainId;
}

export function getExplorerTokenUrl(network: AlchemyNetwork, address: string): string {
  return `${ALCHEMY_NETWORK_CONFIG[network].explorerBaseUrl}/token/${address}`;
}

export function getExplorerAddressUrl(network: AlchemyNetwork, address: string): string {
  return `${ALCHEMY_NETWORK_CONFIG[network].explorerBaseUrl}/address/${address}`;
}

export function getExplorerTransactionUrl(
  network: AlchemyNetwork,
  transactionHash: string,
): string {
  return `${ALCHEMY_NETWORK_CONFIG[network].explorerBaseUrl}/tx/${transactionHash}`;
}

/**
 * Checks that an address is a 20-byte EVM address and lowercases it so
 * checksummed and lowercase forms dedupe to one key.
 */
export function normalizeEvmAddress(value: string, label = "address"): string {
  const trimmed = value.trim();

  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(
      `Alchemy ${label}: invalid EVM address "${trimmed}". Expected 0x followed ` +
        "by 40 hexadecimal characters.",
    );
  }

  return trimmed.toLowerCase();
}

/**
 * Normalizes a block tag. `latest`, `earliest` and `pending` are passed
 * through; decimal integers become hex quantities.
 */
export function normalizeBlockTag(value: string | number | bigint, label = "block"): string {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`Alchemy ${label}: block number must not be negative.`);
    }
    return `0x${value.toString(16)}`;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Alchemy ${label}: block number must be a non-negative safe integer.`);
    }
    return `0x${value.toString(16)}`;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "latest" || trimmed === "earliest" || trimmed === "pending") {
    return trimmed;
  }

  if (/^0x[0-9a-f]+$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d+$/.test(trimmed)) {
    return `0x${BigInt(trimmed).toString(16)}`;
  }

  throw new Error(
    `Alchemy ${label}: invalid block value "${value}". Use a decimal integer, ` +
      "a 0x-prefixed hex quantity, or latest/earliest/pending.",
  );
}

/** Converts a hex block quantity to a safe JS number, or null for tags. */
export function blockTagToNumber(value: string): number | null {
  if (!/^0x[0-9a-f]+$/i.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function uniqueAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const address of addresses) {
    const normalized = normalizeEvmAddress(address, "token");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }

  return unique;
}

function uniqueCategories(categories: string[]): AlchemyTransferCategory[] {
  const seen = new Set<string>();
  const unique: AlchemyTransferCategory[] = [];

  for (const category of categories) {
    const normalized = category.trim().toLowerCase();
    if (!(TRANSFER_CATEGORIES as readonly string[]).includes(normalized)) {
      throw new Error(
        `Alchemy transfers: unsupported category "${category}". Allowed: ` +
          `${TRANSFER_CATEGORIES.join(", ")}.`,
      );
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized as AlchemyTransferCategory);
    }
  }

  return unique;
}

// --------------------------------------------------
// Endpoint redaction, errors and rate limiting
// --------------------------------------------------

/** Removes the API key from an endpoint or any message containing one. */
export function redactAlchemyEndpoint(value: string): string {
  let redacted = value.replace(/\/v2\/[^/?#\s]+/gi, "/v2/<redacted>");

  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (key) {
    redacted = redacted.split(key).join("<redacted>");
  }

  return redacted;
}

function sanitizeAlchemyMessage(message: string): string {
  return redactAlchemyEndpoint(message);
}

function getAlchemyEndpoint(network: AlchemyNetwork): string {
  const config = ALCHEMY_NETWORK_CONFIG[network];
  const endpoint = process.env[config.endpointEnv]?.trim();

  if (!endpoint) {
    throw new Error(
      `Alchemy ${network}: ${config.endpointEnv} is not set. Add the network ` +
        "endpoint URL to .env or choose another --network.",
    );
  }

  return endpoint;
}

export interface AlchemyRpcErrorDetails {
  status: number;
  code: number | null;
  method: string;
  url: string;
  apiMessage: string | null;
}

/** An HTTP or JSON-RPC failure with the redacted request URL. */
export class AlchemyRpcError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly method: string;
  readonly url: string;
  readonly apiMessage: string | null;

  constructor(message: string, details: AlchemyRpcErrorDetails) {
    super(message);
    this.name = "AlchemyRpcError";
    this.status = details.status;
    this.code = details.code;
    this.method = details.method;
    this.url = details.url;
    this.apiMessage = details.apiMessage;
  }
}

let requestsPerSecond = readRequestsPerSecondFromEnv();
let lastRequestStartedAt = 0;
let nextRequestId = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRequestsPerSecondFromEnv(): number {
  const raw = process.env.ALCHEMY_REQUESTS_PER_SECOND;
  if (!raw) {
    return DEFAULT_REQUESTS_PER_SECOND;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUESTS_PER_SECOND;
}

export function setAlchemyRequestsPerSecond(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid Alchemy request rate: ${value}`);
  }
  requestsPerSecond = value;
}

async function waitForRateLimit(): Promise<void> {
  const minimumGapMs = Math.ceil(1_000 / requestsPerSecond);
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

function isoDateOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function httpUrlOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function evmAddressOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

function transactionHashOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw || !/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

function hexQuantityOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw || !/^0x[0-9a-fA-F]+$/.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

function readApiError(body: unknown): { code: number | null; message: string | null } {
  const record = asJsonObject(body);
  const error = jsonObjectAt(record, "error");

  return {
    code: integerOrNull(error["code"], Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    message:
      stringOrNull(error["message"]) ??
      stringOrNull(record["message"]) ??
      stringOrNull(record["error"]),
  };
}

// --------------------------------------------------
// JSON-RPC client
// --------------------------------------------------

function isNetworkDisabledMessage(message: string | null): boolean {
  return message !== null && /not enabled for this app/i.test(message);
}

function isRetryableRpcError(code: number | null, message: string | null): boolean {
  if (code === 429) {
    return true;
  }

  return code === -32603 && message !== null && /rate|capacity|limit|too many|429/i.test(message);
}

async function rpcRequest(
  network: AlchemyNetwork,
  method: string,
  params: unknown[],
  label: string,
): Promise<{ result: unknown; sourceUrl: string }> {
  const endpoint = getAlchemyEndpoint(network);
  const sourceUrl = redactAlchemyEndpoint(endpoint);
  let lastNetworkError: Error | null = null;

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    await waitForRateLimit();

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: nextRequestId++,
          method,
          params,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastNetworkError =
        error instanceof Error ? error : new Error(`Alchemy ${label}: ${String(error)}`);

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
      throw new Error(`Alchemy ${label}: response was not valid JSON (HTTP ${response.status}).`);
    }

    const apiError = readApiError(body);

    if (!response.ok) {
      if (response.status === 403 && isNetworkDisabledMessage(apiError.message)) {
        throw new AlchemyRpcError(
          `Alchemy network "${network}" is not enabled for this app. Enable it in ` +
            `the Alchemy dashboard or choose another --network. (${sourceUrl})`,
          {
            status: response.status,
            code: apiError.code,
            method,
            url: sourceUrl,
            apiMessage: null,
          },
        );
      }

      const retryable = response.status === 429 || response.status >= 500;
      const message =
        `Alchemy ${label} failed: HTTP ${response.status}` +
        (apiError.message ? ` - ${sanitizeAlchemyMessage(apiError.message)}` : "") +
        ` (${sourceUrl})`;

      if (!retryable || attempt === MAX_REQUEST_ATTEMPTS - 1) {
        throw new AlchemyRpcError(message, {
          status: response.status,
          code: apiError.code,
          method,
          url: sourceUrl,
          apiMessage: apiError.message ? sanitizeAlchemyMessage(apiError.message) : null,
        });
      }

      await sleep(readRetryAfterMs(response) ?? retryDelayMs(attempt));
      continue;
    }

    if (apiError.message !== null || apiError.code !== null) {
      const message =
        `Alchemy ${label} failed: JSON-RPC error` +
        (apiError.code !== null ? ` ${apiError.code}` : "") +
        (apiError.message ? ` - ${sanitizeAlchemyMessage(apiError.message)}` : "") +
        ` (${sourceUrl})`;

      if (
        isRetryableRpcError(apiError.code, apiError.message) &&
        attempt < MAX_REQUEST_ATTEMPTS - 1
      ) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      throw new AlchemyRpcError(message, {
        status: response.status,
        code: apiError.code,
        method,
        url: sourceUrl,
        apiMessage: apiError.message ? sanitizeAlchemyMessage(apiError.message) : null,
      });
    }

    const record = asJsonObject(body);
    if (!("result" in record)) {
      throw new Error(`Alchemy ${label}: response has no result (${sourceUrl}).`);
    }

    return { result: record["result"], sourceUrl };
  }

  throw new Error(
    `Alchemy ${label} failed after ${MAX_REQUEST_ATTEMPTS} attempts: ` +
      sanitizeAlchemyMessage(lastNetworkError?.message ?? "network error"),
  );
}

// --------------------------------------------------
// Units, bytecode and record normalizers
// --------------------------------------------------

/**
 * Converts a raw integer to a decimal string using the contract's decimals.
 *
 * BigInt arithmetic keeps 18-decimal values exact. The result is a string
 * because token amounts routinely exceed JS safe-integer precision.
 */
export function formatTokenUnits(rawValue: bigint | string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }

  let raw: bigint;
  if (typeof rawValue === "bigint") {
    raw = rawValue;
  } else {
    const trimmed = rawValue.trim();
    if (!/^0x[0-9a-f]+$/i.test(trimmed) && !/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid raw token value: ${rawValue}`);
    }
    raw = BigInt(trimmed);
  }

  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const sign = negative ? "-" : "";

  if (decimals === 0 || fraction === 0n) {
    return `${sign}${whole.toString()}`;
  }

  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");

  return `${sign}${whole.toString()}.${fractionText}`;
}

export interface AlchemyTokenMetadataRecord {
  source: "Alchemy";
  sourceUrl: string;
  observedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  contractAddress: string;
  explorerUrl: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  isToken: boolean;
}

export interface AlchemyMetadataContext {
  network: AlchemyNetwork;
  sourceUrl: string;
  observedAt: string;
  contractAddress: string;
}

/**
 * Normalizes `alchemy_getTokenMetadata`.
 *
 * The endpoint returns `{decimals: 0, name: "", symbol: ""}` for a plain
 * account, so empty name and symbol make `isToken` false rather than creating
 * a zero-decimal token.
 */
export function normalizeTokenMetadata(
  rawValue: unknown,
  context: AlchemyMetadataContext,
): AlchemyTokenMetadataRecord {
  const raw = asJsonObject(rawValue);
  const name = stringOrNull(raw["name"]);
  const symbol = stringOrNull(raw["symbol"]);
  const decimals = integerOrNull(raw["decimals"], 0, 255);
  const logoUrl = httpUrlOrNull(raw["logo"]);
  const isToken = decimals !== null && (name !== null || symbol !== null);

  return {
    source: "Alchemy",
    sourceUrl: context.sourceUrl,
    observedAt: context.observedAt,
    network: context.network,
    chainId: getAlchemyChainId(context.network),
    contractAddress: context.contractAddress,
    explorerUrl: getExplorerTokenUrl(context.network, context.contractAddress),
    name,
    symbol,
    decimals,
    logoUrl,
    isToken,
  };
}

export interface AlchemyContractSelector {
  name: string;
  selector: string;
}

export interface AlchemyContractAnalysis {
  source: "Alchemy";
  sourceUrl: string;
  retrievedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  contractAddress: string;
  explorerUrl: string;
  isContract: boolean;
  bytecodeHash: string | null;
  hashAlgorithm: "sha256";
  bytecodeBytes: number;
  isMinimalProxy: boolean;
  minimalProxyImplementation: string | null;
  isProxyLike: boolean;
  proxyEvidence: AlchemyContractSelector[];
  selectorsPresent: AlchemyContractSelector[];
  selectorsMissing: AlchemyContractSelector[];
  note: string;
}

export interface AlchemyContractContext {
  network: AlchemyNetwork;
  sourceUrl: string;
  retrievedAt: string;
  contractAddress: string;
}

/**
 * Analyzes runtime bytecode without persisting it.
 *
 * A selector being present means its four bytes occur in the runtime code.
 * That is evidence the dispatcher may implement the function, not proof of
 * ERC-20 compliance, because four-byte sequences can also occur in data.
 */
export function analyzeContractBytecode(
  rawValue: unknown,
  context: AlchemyContractContext,
): AlchemyContractAnalysis {
  if (typeof rawValue !== "string" || !/^0x[0-9a-fA-F]*$/.test(rawValue)) {
    throw new Error("Alchemy eth_getCode: response is not a hex bytecode string.");
  }

  const bytecode = rawValue.toLowerCase();
  const isContract = bytecode.length > 2;
  const bytecodeBytes = isContract ? (bytecode.length - 2) / 2 : 0;
  const bytecodeHash = isContract
    ? `0x${createHash("sha256")
        .update(Buffer.from(bytecode.slice(2), "hex"))
        .digest("hex")}`
    : null;
  const minimalProxyMatch = bytecode.match(MINIMAL_PROXY_PATTERN);
  const minimalProxyImplementation = minimalProxyMatch?.[1] ?? null;
  const proxyEvidence = PROXY_SELECTORS.filter((entry) => bytecode.includes(entry.selector)).map(
    (entry) => ({ name: entry.name, selector: entry.selector }),
  );
  const isProxyLike = minimalProxyImplementation !== null || proxyEvidence.length > 0;

  const selectorsPresent: AlchemyContractSelector[] = [];
  const selectorsMissing: AlchemyContractSelector[] = [];

  for (const entry of ERC20_SELECTORS) {
    const match = { name: entry.name, selector: entry.selector };
    if (bytecode.includes(entry.selector)) {
      selectorsPresent.push(match);
    } else {
      selectorsMissing.push(match);
    }
  }

  return {
    source: "Alchemy",
    sourceUrl: context.sourceUrl,
    retrievedAt: context.retrievedAt,
    network: context.network,
    chainId: getAlchemyChainId(context.network),
    contractAddress: context.contractAddress,
    explorerUrl: getExplorerTokenUrl(context.network, context.contractAddress),
    isContract,
    bytecodeHash,
    hashAlgorithm: "sha256",
    bytecodeBytes,
    isMinimalProxy: minimalProxyImplementation !== null,
    minimalProxyImplementation,
    isProxyLike,
    proxyEvidence,
    selectorsPresent,
    selectorsMissing,
    note:
      "Runtime bytecode only; this is not verified Solidity source. Selector " +
      "presence is heuristic and does not prove ERC-20 compliance." +
      (isProxyLike
        ? " Proxy-like selectors were found; implementation bytecode is not " +
          "fetched, so some token selectors may live in the implementation."
        : ""),
  };
}

export interface AlchemyTokenSupplyRecord {
  source: "Alchemy";
  sourceUrl: string;
  observedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  contractAddress: string;
  explorerUrl: string;
  blockTag: string;
  blockNumber: number | null;
  callData: typeof TOTAL_SUPPLY_SELECTOR;
  rawValue: string | null;
  decimals: number | null;
  decimalsSource: "alchemy_getTokenMetadata" | "cli" | null;
  totalSupply: string | null;
  note: string | null;
}

export interface AlchemySupplyContext {
  network: AlchemyNetwork;
  sourceUrl: string;
  observedAt: string;
  contractAddress: string;
  blockTag: string;
  decimals: number | null;
  decimalsSource: "alchemy_getTokenMetadata" | "cli" | null;
}

/**
 * Normalizes the `totalSupply()` eth_call.
 *
 * `0x` means the call returned no data, usually because the contract does not
 * implement the selector. Without decimals the raw integer is retained but no
 * decimal supply is invented.
 */
export function normalizeTokenSupply(
  rawValue: unknown,
  context: AlchemySupplyContext,
): AlchemyTokenSupplyRecord {
  if (typeof rawValue !== "string" || !/^0x[0-9a-fA-F]*$/.test(rawValue)) {
    throw new Error("Alchemy eth_call totalSupply: response is not a hex string.");
  }

  const hasData = rawValue.length > 2;
  const rawHex = hasData ? rawValue.toLowerCase() : null;
  const totalSupply =
    rawHex !== null && context.decimals !== null
      ? formatTokenUnits(BigInt(rawHex), context.decimals)
      : null;

  let note: string | null = null;
  if (!hasData) {
    note =
      "eth_call returned no data for totalSupply(); the contract may not " +
      "implement the selector.";
  } else if (context.decimals === null) {
    note =
      "Decimals are unavailable; the raw integer is retained and no decimal " +
      "supply is derived.";
  }

  return {
    source: "Alchemy",
    sourceUrl: context.sourceUrl,
    observedAt: context.observedAt,
    network: context.network,
    chainId: getAlchemyChainId(context.network),
    contractAddress: context.contractAddress,
    explorerUrl: getExplorerTokenUrl(context.network, context.contractAddress),
    blockTag: context.blockTag,
    blockNumber: blockTagToNumber(context.blockTag),
    callData: TOTAL_SUPPLY_SELECTOR,
    rawValue: rawHex,
    decimals: context.decimals,
    decimalsSource: context.decimalsSource,
    totalSupply,
    note,
  };
}

export interface AlchemyTokenBalanceMetadata {
  source: "Alchemy";
  sourceUrl: string;
  observedAt: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
}

export interface AlchemyTokenBalanceRecord {
  contractAddress: string;
  explorerUrl: string;
  tokenBalanceRaw: string;
  balance: string | null;
  decimals: number | null;
  metadata: AlchemyTokenBalanceMetadata | null;
  metadataError: string | null;
  note: string | null;
}

export interface AlchemyWalletBalancesReport {
  source: "Alchemy";
  sourceUrl: string;
  observedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  walletAddress: string;
  walletExplorerUrl: string;
  requestedTokens: string[];
  tokens: AlchemyTokenBalanceRecord[];
  nonZeroCount: number;
  rejectedRows: number;
  note: string;
}

export interface AlchemyBalanceContext {
  network: AlchemyNetwork;
  sourceUrl: string;
  observedAt: string;
  walletAddress: string;
  requestedTokens: string[];
}

/**
 * Normalizes `alchemy_getTokenBalances` without metadata enrichment.
 *
 * Rows without a contract address are rejected. The raw hex amount is always
 * kept; `balance` stays null until decimals are known.
 */
export function normalizeTokenBalances(
  rawValue: unknown,
  context: AlchemyBalanceContext,
): {
  tokens: AlchemyTokenBalanceRecord[];
  rejectedRows: number;
} {
  const raw = asJsonObject(rawValue);
  const rows = arrayAt(raw, "tokenBalances");
  const tokens: AlchemyTokenBalanceRecord[] = [];
  const seen = new Set<string>();
  let rejectedRows = 0;

  for (const row of rows) {
    const record = asJsonObject(row);
    const contractAddress = evmAddressOrNull(record["contractAddress"]);
    const tokenBalanceRaw = hexQuantityOrNull(record["tokenBalance"]);

    if (!contractAddress || tokenBalanceRaw === null || seen.has(contractAddress)) {
      rejectedRows += 1;
      continue;
    }

    seen.add(contractAddress);
    const rawAmount = BigInt(tokenBalanceRaw);

    tokens.push({
      contractAddress,
      explorerUrl: getExplorerTokenUrl(context.network, contractAddress),
      tokenBalanceRaw,
      balance: rawAmount === 0n ? "0" : null,
      decimals: null,
      metadata: null,
      metadataError: stringOrNull(record["error"]),
      note:
        rawAmount === 0n
          ? "Zero balance; metadata lookup skipped."
          : "Balance awaits decimals from token metadata.",
    });
  }

  return { tokens, rejectedRows };
}

/**
 * Adds decimals and display metadata to balance rows.
 *
 * Metadata errors stay attached to the token, and a missing decimal count
 * leaves `balance` null rather than assuming 18 decimals.
 */
export function applyBalanceMetadata(
  tokens: AlchemyTokenBalanceRecord[],
  metadataByAddress: Map<string, AlchemyTokenMetadataRecord>,
  metadataErrors: Map<string, string>,
): AlchemyTokenBalanceRecord[] {
  return tokens.map((token) => {
    const metadata = metadataByAddress.get(token.contractAddress);
    const metadataError = metadataErrors.get(token.contractAddress) ?? token.metadataError;

    if (!metadata) {
      return {
        ...token,
        metadataError,
        note: metadataError !== null ? "Metadata lookup failed; raw balance retained." : token.note,
      };
    }

    const rawAmount = BigInt(token.tokenBalanceRaw);
    const balance =
      metadata.decimals !== null
        ? formatTokenUnits(rawAmount, metadata.decimals)
        : rawAmount === 0n
          ? "0"
          : null;

    return {
      ...token,
      balance,
      decimals: metadata.decimals,
      metadata: {
        source: "Alchemy",
        sourceUrl: metadata.sourceUrl,
        observedAt: metadata.observedAt,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        logoUrl: metadata.logoUrl,
      },
      metadataError,
      note:
        metadata.decimals === null && rawAmount !== 0n
          ? "Decimals are unavailable; the raw balance is retained without conversion."
          : balance === "0"
            ? "Zero balance."
            : null,
    };
  });
}

export interface AlchemyTransferRecord {
  blockNumber: number | null;
  blockNumberHex: string | null;
  uniqueId: string | null;
  transactionHash: string | null;
  from: string | null;
  to: string | null;
  category: string | null;
  asset: string | null;
  contractAddress: string | null;
  valueRaw: string | null;
  value: string | null;
  decimals: number | null;
  providerValue: number | null;
  tokenId: string | null;
  blockTimestamp: string | null;
  explorerTransactionUrl: string | null;
}

export interface AlchemyTransfersReport {
  source: "Alchemy";
  sourceUrl: string;
  sourceUrls: string[];
  observedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  fromBlock: string;
  toBlock: string;
  fromBlockNumber: number;
  toBlockNumber: number;
  contractAddresses: string[];
  categories: AlchemyTransferCategory[];
  order: "asc" | "desc";
  maxCount: number;
  pagesFetched: number;
  transfers: AlchemyTransferRecord[];
  rejectedRows: number;
  nextPageKey: string | null;
  truncated: boolean;
  note: string;
}

export interface AlchemyTransferContext {
  network: AlchemyNetwork;
  sourceUrl: string;
  observedAt: string;
}

/**
 * Normalizes one `alchemy_getAssetTransfers` page.
 *
 * Raw contract values are preferred over the provider's floating-point
 * `value` field. A missing decimal count leaves the formatted value null.
 */
export function normalizeAssetTransfers(
  rawValue: unknown,
  context: AlchemyTransferContext,
): {
  transfers: AlchemyTransferRecord[];
  rejectedRows: number;
  pageKey: string | null;
} {
  const raw = asJsonObject(rawValue);
  const rows = raw["transfers"];

  if (!Array.isArray(rows)) {
    throw new Error("Alchemy alchemy_getAssetTransfers: response has no transfers array.");
  }

  const transfers: AlchemyTransferRecord[] = [];
  let rejectedRows = 0;

  for (const row of rows) {
    if (!isJsonObject(row)) {
      rejectedRows += 1;
      continue;
    }

    const transactionHash = transactionHashOrNull(row["hash"]);
    const uniqueId = stringOrNull(row["uniqueId"]);
    if (!transactionHash && !uniqueId) {
      rejectedRows += 1;
      continue;
    }

    const blockNumberHex = hexQuantityOrNull(row["blockNum"]);
    const rawContract = jsonObjectAt(row, "rawContract");
    const valueRaw = hexQuantityOrNull(rawContract["value"]);
    const decimalHex = hexQuantityOrNull(rawContract["decimal"]);
    const parsedDecimals = decimalHex !== null ? Number.parseInt(decimalHex.slice(2), 16) : null;
    const decimals =
      parsedDecimals !== null &&
      Number.isInteger(parsedDecimals) &&
      parsedDecimals >= 0 &&
      parsedDecimals <= 255
        ? parsedDecimals
        : null;
    const value =
      valueRaw !== null && decimals !== null ? formatTokenUnits(BigInt(valueRaw), decimals) : null;
    const metadata = jsonObjectAt(row, "metadata");

    transfers.push({
      blockNumber: blockNumberHex !== null ? blockTagToNumber(blockNumberHex) : null,
      blockNumberHex,
      uniqueId,
      transactionHash,
      from: evmAddressOrNull(row["from"]),
      to: evmAddressOrNull(row["to"]),
      category: stringOrNull(row["category"]),
      asset: stringOrNull(row["asset"]),
      contractAddress: evmAddressOrNull(rawContract["address"]),
      valueRaw,
      value,
      decimals,
      providerValue: numberOrNull(row["value"]),
      tokenId: stringOrNull(row["tokenId"]),
      blockTimestamp: isoDateOrNull(metadata["blockTimestamp"]),
      explorerTransactionUrl:
        transactionHash !== null
          ? getExplorerTransactionUrl(context.network, transactionHash)
          : null,
    });
  }

  return {
    transfers,
    rejectedRows,
    pageKey: stringOrNull(raw["pageKey"]),
  };
}

// --------------------------------------------------
// API functions
// --------------------------------------------------

export interface AlchemyBlockNumberReport {
  source: "Alchemy";
  sourceUrl: string;
  observedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  blockNumber: number;
  blockTag: string;
}

/** Reads the current block number and returns it as a pinned hex tag too. */
export async function fetchAlchemyBlockNumber(
  networkValue: string,
): Promise<AlchemyBlockNumberReport> {
  const network = normalizeAlchemyNetwork(networkValue);
  const observedAt = new Date().toISOString();
  const { result, sourceUrl } = await rpcRequest(network, "eth_blockNumber", [], "block number");

  if (typeof result !== "string" || !/^0x[0-9a-f]+$/i.test(result)) {
    throw new Error("Alchemy eth_blockNumber: response is not a hex block quantity.");
  }

  const blockNumber = blockTagToNumber(result);
  if (blockNumber === null) {
    throw new Error("Alchemy eth_blockNumber: block number exceeds the safe integer range.");
  }

  return {
    source: "Alchemy",
    sourceUrl,
    observedAt,
    network,
    chainId: getAlchemyChainId(network),
    blockNumber,
    blockTag: normalizeBlockTag(blockNumber),
  };
}

/** Fetches token metadata for a contract on one network. */
export async function fetchAlchemyTokenMetadata(
  networkValue: string,
  contractAddressValue: string,
): Promise<AlchemyTokenMetadataRecord> {
  const network = normalizeAlchemyNetwork(networkValue);
  const contractAddress = normalizeEvmAddress(contractAddressValue, "token");
  const observedAt = new Date().toISOString();

  const { result, sourceUrl } = await rpcRequest(
    network,
    "alchemy_getTokenMetadata",
    [contractAddress],
    `token metadata ${contractAddress}`,
  );

  const record = normalizeTokenMetadata(result, {
    network,
    sourceUrl,
    observedAt,
    contractAddress,
  });

  return record;
}

/** Fetches runtime bytecode and returns its hash, size and selector findings. */
export async function fetchAlchemyContractAnalysis(
  networkValue: string,
  contractAddressValue: string,
  options: { blockTag?: string } = {},
): Promise<AlchemyContractAnalysis> {
  const network = normalizeAlchemyNetwork(networkValue);
  const contractAddress = normalizeEvmAddress(contractAddressValue, "contract");
  const blockTag = normalizeBlockTag(options.blockTag ?? "latest", "block");
  const retrievedAt = new Date().toISOString();

  const { result, sourceUrl } = await rpcRequest(
    network,
    "eth_getCode",
    [contractAddress, blockTag],
    `contract code ${contractAddress}`,
  );

  return analyzeContractBytecode(result, {
    network,
    sourceUrl,
    retrievedAt,
    contractAddress,
  });
}

/** Reads `totalSupply()` and converts it with the contract's decimals. */
export async function fetchAlchemyTokenSupply(
  networkValue: string,
  contractAddressValue: string,
  options: {
    decimals?: number | null;
    decimalsSource?: "alchemy_getTokenMetadata" | "cli" | null;
    blockTag?: string;
  } = {},
): Promise<AlchemyTokenSupplyRecord> {
  const network = normalizeAlchemyNetwork(networkValue);
  const contractAddress = normalizeEvmAddress(contractAddressValue, "token");
  const blockTag = normalizeBlockTag(options.blockTag ?? "latest", "block");
  const observedAt = new Date().toISOString();

  let decimals = options.decimals;
  let decimalsSource = options.decimalsSource ?? null;

  if (decimals === undefined) {
    const metadata = await fetchAlchemyTokenMetadata(network, contractAddress);
    decimals = metadata.decimals;
    decimalsSource = "alchemy_getTokenMetadata";
  }

  const { result, sourceUrl } = await rpcRequest(
    network,
    "eth_call",
    [{ to: contractAddress, data: TOTAL_SUPPLY_SELECTOR }, blockTag],
    `total supply ${contractAddress}`,
  );

  return normalizeTokenSupply(result, {
    network,
    sourceUrl,
    observedAt,
    contractAddress,
    blockTag,
    decimals,
    decimalsSource,
  });
}

export interface AlchemyContractReference {
  network: string;
  chainId: number;
  address: string;
  standard: "ERC-20" | null;
  standardConfidence: "heuristic" | "none";
  explorerUrl: string;
  source: "Alchemy";
  contractExists: boolean;
}

export interface AlchemyStandardEvidence {
  metadataReportedToken: boolean;
  totalSupplyCallSucceeded: boolean;
  erc20SelectorsPresent: string[];
  erc20SelectorsMissing: string[];
  note: string;
}

export interface AlchemyTokenProfile {
  source: "Alchemy";
  sourceUrl: string;
  fetchedAt: string;
  network: AlchemyNetwork;
  chainId: number;
  metadata: AlchemyTokenMetadataRecord;
  contract: AlchemyContractAnalysis;
  supply: AlchemyTokenSupplyRecord | null;
  supplyError: string | null;
  contractReference: AlchemyContractReference;
  standardEvidence: AlchemyStandardEvidence;
  resolution: {
    provider: "Alchemy";
    method: "contract_address";
    verified: false;
    note: string;
  };
}

/**
 * Collects metadata, bytecode analysis and supply for one contract.
 *
 * A supply failure is recorded on the profile instead of discarding the
 * metadata and bytecode that already succeeded.
 */
export async function fetchAlchemyTokenProfile(
  networkValue: string,
  contractAddressValue: string,
): Promise<AlchemyTokenProfile> {
  const network = normalizeAlchemyNetwork(networkValue);
  const contractAddress = normalizeEvmAddress(contractAddressValue, "token");
  const fetchedAt = new Date().toISOString();

  const metadata = await fetchAlchemyTokenMetadata(network, contractAddress);
  const contract = await fetchAlchemyContractAnalysis(network, contractAddress);

  let supply: AlchemyTokenSupplyRecord | null = null;
  let supplyError: string | null = null;
  try {
    supply = await fetchAlchemyTokenSupply(network, contractAddress, {
      decimals: metadata.decimals,
      decimalsSource: "alchemy_getTokenMetadata",
    });
  } catch (error) {
    supplyError = error instanceof Error ? error.message : String(error);
  }

  const totalSupplyCallSucceeded = supply !== null && supply.rawValue !== null;
  const standard =
    metadata.isToken && totalSupplyCallSucceeded && (metadata.decimals ?? 0) > 0 ? "ERC-20" : null;

  return {
    source: "Alchemy",
    sourceUrl: metadata.sourceUrl,
    fetchedAt,
    network,
    chainId: getAlchemyChainId(network),
    metadata,
    contract,
    supply,
    supplyError,
    contractReference: {
      network,
      chainId: getAlchemyChainId(network),
      address: contractAddress,
      standard,
      standardConfidence: standard === null ? "none" : "heuristic",
      explorerUrl: getExplorerTokenUrl(network, contractAddress),
      source: "Alchemy",
      contractExists: contract.isContract,
    },
    standardEvidence: {
      metadataReportedToken: metadata.isToken,
      totalSupplyCallSucceeded,
      erc20SelectorsPresent: contract.selectorsPresent.map((entry) => entry.name),
      erc20SelectorsMissing: contract.selectorsMissing.map((entry) => entry.name),
      note:
        "Standard is inferred from token metadata, a successful totalSupply() " +
        "call and a positive decimal count. It is not verified against the " +
        "contract's declared interfaces.",
    },
    resolution: {
      provider: "Alchemy",
      method: "contract_address",
      verified: false,
      note:
        "Contract values are read directly from the selected network. Canonical " +
        "asset identity is not resolved; compare with CoinGecko before merging.",
    },
  };
}

/** Fetches wallet balances and optionally enriches each non-zero token. */
export async function fetchAlchemyTokenBalances(
  networkValue: string,
  walletAddressValue: string,
  tokenAddresses: string[],
  options: { enrich?: boolean } = {},
): Promise<AlchemyWalletBalancesReport> {
  const network = normalizeAlchemyNetwork(networkValue);
  const walletAddress = normalizeEvmAddress(walletAddressValue, "wallet");
  const requestedTokens = uniqueAddresses(tokenAddresses);

  if (requestedTokens.length === 0) {
    throw new Error("Alchemy balances: at least one token contract address is required.");
  }

  if (requestedTokens.length > MAX_TOKENS) {
    throw new Error(`Alchemy balances: at most ${MAX_TOKENS} token contracts per request.`);
  }

  const observedAt = new Date().toISOString();
  const { result, sourceUrl } = await rpcRequest(
    network,
    "alchemy_getTokenBalances",
    [walletAddress, requestedTokens],
    `token balances ${walletAddress}`,
  );

  const parsed = normalizeTokenBalances(result, {
    network,
    sourceUrl,
    observedAt,
    walletAddress,
    requestedTokens,
  });

  let tokens = parsed.tokens;
  if (options.enrich ?? true) {
    const metadataByAddress = new Map<string, AlchemyTokenMetadataRecord>();
    const metadataErrors = new Map<string, string>();

    for (const token of tokens) {
      if (BigInt(token.tokenBalanceRaw) === 0n) {
        continue;
      }

      try {
        const metadata = await fetchAlchemyTokenMetadata(network, token.contractAddress);
        metadataByAddress.set(token.contractAddress, metadata);
      } catch (error) {
        metadataErrors.set(
          token.contractAddress,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    tokens = applyBalanceMetadata(tokens, metadataByAddress, metadataErrors);
  }

  return {
    source: "Alchemy",
    sourceUrl,
    observedAt,
    network,
    chainId: getAlchemyChainId(network),
    walletAddress,
    walletExplorerUrl: getExplorerAddressUrl(network, walletAddress),
    requestedTokens,
    tokens,
    nonZeroCount: tokens.filter((token) => BigInt(token.tokenBalanceRaw) !== 0n).length,
    rejectedRows: parsed.rejectedRows,
    note:
      "Balances cover only the requested wallet and token contracts. Alchemy does " +
      "not enumerate all holders of a token.",
  };
}

export interface AlchemyTransfersOptions {
  fromBlock: string | number | bigint;
  toBlock: string | number | bigint;
  contractAddresses?: string[];
  categories?: string[];
  withMetadata?: boolean;
  excludeZeroValue?: boolean;
  maxCount?: number;
  order?: "asc" | "desc";
  maxPages?: number;
  pageKey?: string | null;
}

/**
 * Fetches historical transfers in a bounded block range.
 *
 * `fromBlock` and `toBlock` must be concrete block numbers; callers resolve
 * `latest` first so pagination cannot drift while it runs.
 */
export async function fetchAlchemyAssetTransfers(
  networkValue: string,
  options: AlchemyTransfersOptions,
): Promise<AlchemyTransfersReport> {
  const network = normalizeAlchemyNetwork(networkValue);
  const fromBlock = normalizeBlockTag(options.fromBlock, "fromBlock");
  const toBlock = normalizeBlockTag(options.toBlock, "toBlock");
  const fromBlockNumber = blockTagToNumber(fromBlock);
  const toBlockNumber = blockTagToNumber(toBlock);

  if (fromBlockNumber === null || toBlockNumber === null) {
    throw new Error(
      "Alchemy transfers: fromBlock and toBlock must be concrete block numbers, " +
        "not latest/earliest/pending. Resolve latest with eth_blockNumber first.",
    );
  }

  if (fromBlockNumber > toBlockNumber) {
    throw new Error(
      `Alchemy transfers: fromBlock ${fromBlockNumber} is after toBlock ${toBlockNumber}.`,
    );
  }

  const contractAddresses = uniqueAddresses(options.contractAddresses ?? []);
  const categories = uniqueCategories(options.categories ?? ["erc20"]);
  const maxCount = options.maxCount ?? DEFAULT_MAX_COUNT;
  if (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > MAX_MAX_COUNT) {
    throw new Error(`Alchemy transfers: maxCount must be between 1 and ${MAX_MAX_COUNT}.`);
  }

  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_MAX_PAGES) {
    throw new Error(`Alchemy transfers: maxPages must be between 1 and ${MAX_MAX_PAGES}.`);
  }

  const order = options.order ?? "desc";
  if (order !== "asc" && order !== "desc") {
    throw new Error('Alchemy transfers: order must be "asc" or "desc".');
  }

  const observedAt = new Date().toISOString();
  const transfers: AlchemyTransferRecord[] = [];
  const sourceUrls: string[] = [];
  let rejectedRows = 0;
  let pageKey = options.pageKey ?? null;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, unknown> = {
      fromBlock,
      toBlock,
      category: categories,
      withMetadata: options.withMetadata ?? true,
      excludeZeroValue: options.excludeZeroValue ?? true,
      maxCount: `0x${maxCount.toString(16)}`,
      order,
    };

    if (contractAddresses.length > 0) {
      params["contractAddresses"] = contractAddresses;
    }

    if (pageKey !== null) {
      params["pageKey"] = pageKey;
    }

    const { result, sourceUrl } = await rpcRequest(
      network,
      "alchemy_getAssetTransfers",
      [params],
      `asset transfers ${fromBlockNumber}-${toBlockNumber} (page ${page + 1})`,
    );

    const parsed = normalizeAssetTransfers(result, { network, sourceUrl, observedAt });
    transfers.push(...parsed.transfers);
    rejectedRows += parsed.rejectedRows;
    pagesFetched += 1;
    if (!sourceUrls.includes(sourceUrl)) {
      sourceUrls.push(sourceUrl);
    }

    pageKey = parsed.pageKey;
    if (pageKey === null) {
      break;
    }
  }

  return {
    source: "Alchemy",
    sourceUrl: sourceUrls[0] ?? redactAlchemyEndpoint(getAlchemyEndpoint(network)),
    sourceUrls,
    observedAt,
    network,
    chainId: getAlchemyChainId(network),
    fromBlock,
    toBlock,
    fromBlockNumber,
    toBlockNumber,
    contractAddresses,
    categories,
    order,
    maxCount,
    pagesFetched,
    transfers,
    rejectedRows,
    nextPageKey: pageKey,
    truncated: pageKey !== null,
    note:
      "Transfers are limited to the requested block range and page count. A " +
      "non-null nextPageKey means the range was not exhausted; do not advance a " +
      "checkpoint until it is null.",
  };
}

// --------------------------------------------------
// Transfer checkpoints
// --------------------------------------------------

export interface AlchemyCheckpointEntry {
  network: AlchemyNetwork;
  chainId: number;
  contractAddresses: string[];
  categories: AlchemyTransferCategory[];
  lastScannedBlock: number;
  updatedAt: string;
}

export interface AlchemyCheckpointFile {
  source: "Alchemy";
  updatedAt: string;
  checkpoints: Record<string, AlchemyCheckpointEntry>;
}

/** Stable key for a checkpoint: network + contracts + categories. */
export function alchemyCheckpointKey(
  network: AlchemyNetwork,
  contractAddresses: string[],
  categories: string[],
): string {
  const addresses = [...contractAddresses].sort().join("+") || "all";
  const sortedCategories = [...categories].sort().join("+") || "erc20";
  return `${network}:${addresses}:${sortedCategories}`;
}

async function loadAlchemyCheckpoints(outputDir: string): Promise<AlchemyCheckpointFile> {
  const filePath = path.join(outputDir, "alchemy checkpoints.json");

  try {
    const text = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(text) as unknown;
    const record = asJsonObject(parsed);
    const checkpoints = jsonObjectAt(record, "checkpoints");
    const entries: Record<string, AlchemyCheckpointEntry> = {};

    for (const [key, value] of Object.entries(checkpoints)) {
      const entry = asJsonObject(value);
      const networkValue = stringOrNull(entry["network"]);
      const lastScannedBlock = numberOrNull(entry["lastScannedBlock"]);

      if (!networkValue || lastScannedBlock === null) {
        continue;
      }

      let network: AlchemyNetwork;
      try {
        network = normalizeAlchemyNetwork(networkValue);
      } catch {
        continue;
      }

      entries[key] = {
        network,
        chainId: getAlchemyChainId(network),
        contractAddresses: arrayAt(entry, "contractAddresses")
          .map((item) => stringOrNull(item))
          .filter((item): item is string => item !== null),
        categories: uniqueCategories(
          arrayAt(entry, "categories")
            .map((item) => stringOrNull(item))
            .filter((item): item is string => item !== null),
        ),
        lastScannedBlock,
        updatedAt: stringOrNull(entry["updatedAt"]) ?? new Date().toISOString(),
      };
    }

    return {
      source: "Alchemy",
      updatedAt: stringOrNull(record["updatedAt"]) ?? new Date().toISOString(),
      checkpoints: entries,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        "  ! Could not read transfer checkpoints; starting without them: " +
          sanitizeAlchemyMessage(error instanceof Error ? error.message : String(error)),
      );
    }

    return { source: "Alchemy", updatedAt: new Date().toISOString(), checkpoints: {} };
  }
}

async function saveAlchemyCheckpoints(
  outputDir: string,
  checkpoints: AlchemyCheckpointFile,
): Promise<void> {
  const filePath = path.join(outputDir, "alchemy checkpoints.json");
  const updated: AlchemyCheckpointFile = {
    source: "Alchemy",
    updatedAt: new Date().toISOString(),
    checkpoints: checkpoints.checkpoints,
  };
  await fs.writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
}

// --------------------------------------------------
// CLI
// --------------------------------------------------

const MODES = ["token", "code", "supply", "balances", "transfers", "all"] as const;
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

function parseAddressList(value: string | null, label: string): string[] {
  if (!value) {
    return [];
  }

  return uniqueAddresses(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ).map((address) => normalizeEvmAddress(address, label));
}

function safeFilePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned === "" ? "unknown" : cleaned.slice(0, 100);
}

async function saveJson(outputDir: string, filename: string, data: unknown): Promise<void> {
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  console.log(`  ✓ Wrote ${filePath}`);
}

function printHelp(): void {
  console.log(`Alchemy on-chain collector

Usage:
  npx tsx collectors/assets/crypto/alchemyFetchers.ts --mode=all --network=polygon

Modes:
  token      Metadata + bytecode analysis + total supply for --token.
  code       Runtime bytecode hash, size and selector findings.
  supply     totalSupply() converted with the contract's decimals.
  balances   Wallet balances for a known --wallet and --token list.
  transfers  Bounded, checkpointed alchemy_getAssetTransfers scan.
  all        token + balances (when --wallet is set) + transfers.

Options:
  --network=ethereum         ethereum, base, arbitrum or polygon (default ethereum).
  --token=0x...              Token contract(s), comma separated. Defaults to USDC
                             on the selected network.
  --wallet=0x...             Wallet for --mode=balances.
  --from-block=N             First block for transfers. Defaults to a checkpoint
                             or the last --block-window blocks.
  --to-block=N               Last block for transfers. Defaults to the pinned latest.
  --block-window=5000        First-run transfer window when no checkpoint exists.
  --max-block-range=50000    Reject larger explicit ranges before requesting.
  --max-count=100            Transfers per page, 1-1000.
  --max-pages=1              Pages per scan, 1-100.
  --categories=erc20         Comma-separated transfer categories.
  --order=desc               asc or desc.
  --checkpoint=true          Read and advance the transfer checkpoint file.
  --enrich=true              Fetch token metadata for non-zero balances.
  --rps=5                    Requests per second, per process.
  --output-dir=...           Default collectors/assets/crypto/data.
  --help                     Show this message.

Networks must be enabled for the Alchemy app behind ALCHEMY_*_ENDPOINT. A 403
means the network is disabled, not that the request shape is wrong.

Only normalized findings are written: bytecode is represented by a hash, size
and selector evidence, never stored verbatim. API keys never appear in output
or error URLs.
`);
}

interface ResolvedTransferRange {
  fromBlockNumber: number;
  toBlockNumber: number;
  checkpointKey: string;
  previousLastScannedBlock: number | null;
}

async function resolveTransferRange(input: {
  network: AlchemyNetwork;
  contractAddresses: string[];
  categories: string[];
  outputDir: string;
  fromBlockArg: string | null;
  toBlockArg: string | null;
  blockWindow: number;
  maxBlockRange: number;
  checkpointEnabled: boolean;
  toBlockNumber: number;
}): Promise<ResolvedTransferRange> {
  const checkpointKey = alchemyCheckpointKey(
    input.network,
    input.contractAddresses,
    input.categories,
  );
  const toBlockNumber =
    input.toBlockArg !== null
      ? (blockTagToNumber(normalizeBlockTag(input.toBlockArg, "toBlock")) ?? input.toBlockNumber)
      : input.toBlockNumber;

  let fromBlockNumber: number;
  let previousLastScannedBlock: number | null = null;

  if (input.fromBlockArg !== null) {
    const parsed = blockTagToNumber(normalizeBlockTag(input.fromBlockArg, "fromBlock"));
    if (parsed === null) {
      throw new Error("--from-block must be a concrete block number.");
    }
    fromBlockNumber = parsed;
  } else if (input.checkpointEnabled) {
    const checkpoints = await loadAlchemyCheckpoints(input.outputDir);
    const entry = checkpoints.checkpoints[checkpointKey];
    previousLastScannedBlock = entry?.lastScannedBlock ?? null;
    fromBlockNumber =
      previousLastScannedBlock !== null
        ? previousLastScannedBlock + 1
        : Math.max(0, toBlockNumber - input.blockWindow + 1);
  } else {
    fromBlockNumber = Math.max(0, toBlockNumber - input.blockWindow + 1);
  }

  if (fromBlockNumber > toBlockNumber) {
    if (input.fromBlockArg !== null) {
      throw new Error(
        `Alchemy transfers: --from-block ${fromBlockNumber} is after ` +
          `--to-block ${toBlockNumber}.`,
      );
    }

    return {
      fromBlockNumber,
      toBlockNumber,
      checkpointKey,
      previousLastScannedBlock,
    };
  }

  const rangeSize = toBlockNumber - fromBlockNumber + 1;
  const resumingFromCheckpoint = input.fromBlockArg === null && previousLastScannedBlock !== null;

  if (resumingFromCheckpoint && input.toBlockArg === null && rangeSize > input.maxBlockRange) {
    // A long gap since the last checkpoint is walked in bounded chunks: this
    // scan stops at the range limit and the checkpoint advances to that block,
    // so a later run continues from there instead of failing outright.
    const cappedToBlock = fromBlockNumber + input.maxBlockRange - 1;
    console.log(
      `  ! gap since checkpoint covers ${rangeSize.toLocaleString("en-US")} blocks; ` +
        `scanning ${fromBlockNumber}-${cappedToBlock} first`,
    );

    return {
      fromBlockNumber,
      toBlockNumber: cappedToBlock,
      checkpointKey,
      previousLastScannedBlock,
    };
  }

  if (rangeSize > input.maxBlockRange) {
    throw new Error(
      `Alchemy transfers: range ${fromBlockNumber}-${toBlockNumber} covers ` +
        `${rangeSize.toLocaleString("en-US")} blocks, above --max-block-range=` +
        `${input.maxBlockRange.toLocaleString("en-US")}. Narrow the range or raise ` +
        "the limit deliberately.",
    );
  }

  return {
    fromBlockNumber,
    toBlockNumber,
    checkpointKey,
    previousLastScannedBlock,
  };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    printHelp();
    return;
  }

  const mode = parseMode(getArg("mode") ?? "all");
  const network = normalizeAlchemyNetwork(getArg("network") ?? DEFAULT_NETWORK);
  const requestedTokens = parseAddressList(getArg("token"), "token");
  const tokens =
    requestedTokens.length > 0 ? requestedTokens : [ALCHEMY_NETWORK_CONFIG[network].defaultToken];
  const walletArg = getArg("wallet");
  const wallet = walletArg ? normalizeEvmAddress(walletArg, "wallet") : null;

  if (tokens.length > MAX_TOKENS) {
    throw new Error(`--token accepts at most ${MAX_TOKENS} contracts.`);
  }

  if (mode === "balances" && wallet === null) {
    throw new Error("--mode=balances requires --wallet=0x...");
  }

  const requestsPerSecond = parsePositiveNumber(getArg("rps"), DEFAULT_REQUESTS_PER_SECOND, "rps");
  const blockWindow = parsePositiveInteger(
    getArg("block-window"),
    DEFAULT_BLOCK_WINDOW,
    "block-window",
  );
  const maxBlockRange = parsePositiveInteger(
    getArg("max-block-range"),
    DEFAULT_MAX_BLOCK_RANGE,
    "max-block-range",
  );
  const maxCount = parsePositiveInteger(getArg("max-count"), DEFAULT_MAX_COUNT, "max-count");
  const maxPages = parsePositiveInteger(getArg("max-pages"), DEFAULT_MAX_PAGES, "max-pages");
  const orderValue = getArg("order") ?? "desc";
  if (orderValue !== "asc" && orderValue !== "desc") {
    throw new Error('--order must be "asc" or "desc".');
  }
  const order: "asc" | "desc" = orderValue;
  const categories = uniqueCategories(
    (getArg("categories") ?? "erc20").split(",").map((entry) => entry.trim()),
  );
  const checkpointEnabled = parseBoolean(getArg("checkpoint"), true, "checkpoint");
  const enrich = parseBoolean(getArg("enrich"), true, "enrich");
  const outputDir = path.resolve(process.cwd(), getArg("output-dir") ?? DEFAULT_OUTPUT_DIR);

  if (maxCount > MAX_MAX_COUNT) {
    throw new Error(`--max-count cannot exceed ${MAX_MAX_COUNT}.`);
  }
  if (maxPages > MAX_MAX_PAGES) {
    throw new Error(`--max-pages cannot exceed ${MAX_MAX_PAGES}.`);
  }

  setAlchemyRequestsPerSecond(requestsPerSecond);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(
    `Alchemy collection: mode=${mode} network=${network} ` +
      `tokens=${tokens.join(",")} rps=${requestsPerSecond}`,
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

  if (mode === "token" || mode === "all") {
    for (const token of tokens) {
      await runStep(`token ${token}`, async () => {
        const profile = await fetchAlchemyTokenProfile(network, token);
        await saveJson(outputDir, `alchemy token_${network}_${token}.json`, profile);
        console.log(
          `  ✓ token ${profile.metadata.symbol ?? "unknown"} ` +
            `(${profile.metadata.decimals ?? "?"} decimals, ` +
            `${profile.contract.bytecodeBytes} byte(s), ` +
            `supply=${profile.supply?.totalSupply ?? "unavailable"})`,
        );
      });
    }
  }

  if (mode === "code") {
    for (const token of tokens) {
      await runStep(`code ${token}`, async () => {
        const analysis = await fetchAlchemyContractAnalysis(network, token);
        await saveJson(outputDir, `alchemy code_${network}_${token}.json`, analysis);
        console.log(
          `  ✓ code ${token} (${analysis.bytecodeBytes} byte(s), ` +
            `${analysis.selectorsPresent.length}/${ERC20_SELECTORS.length} selectors)`,
        );
      });
    }
  }

  if (mode === "supply") {
    for (const token of tokens) {
      await runStep(`supply ${token}`, async () => {
        const supply = await fetchAlchemyTokenSupply(network, token);
        await saveJson(outputDir, `alchemy supply_${network}_${token}.json`, supply);
        console.log(
          `  ✓ supply ${token} (${supply.totalSupply ?? "unavailable"} at ` + `${supply.blockTag})`,
        );
      });
    }
  }

  if (mode === "balances" || (mode === "all" && wallet !== null)) {
    if (wallet === null) {
      throw new Error("--mode=balances requires --wallet=0x...");
    }

    await runStep(`balances ${wallet}`, async () => {
      const report = await fetchAlchemyTokenBalances(network, wallet, tokens, { enrich });
      await saveJson(outputDir, `alchemy balances_${network}_${wallet}.json`, report);
      console.log(
        `  ✓ balances ${wallet} (${report.nonZeroCount} non-zero of ` +
          `${report.tokens.length} token(s))`,
      );
    });
  }

  if (mode === "transfers" || mode === "all") {
    const block = await fetchAlchemyBlockNumber(network);
    console.log(`  ✓ pinned latest block ${block.blockNumber}`);

    const checkpoints = checkpointEnabled ? await loadAlchemyCheckpoints(outputDir) : null;

    for (const token of tokens) {
      await runStep(`transfers ${token}`, async () => {
        const range = await resolveTransferRange({
          network,
          contractAddresses: [token],
          categories,
          outputDir,
          fromBlockArg: getArg("from-block"),
          toBlockArg: getArg("to-block"),
          blockWindow,
          maxBlockRange,
          checkpointEnabled,
          toBlockNumber: block.blockNumber,
        });

        if (range.fromBlockNumber > range.toBlockNumber) {
          console.log(
            `  ✓ transfers ${token}: no new blocks ` +
              `(checkpoint ${range.previousLastScannedBlock})`,
          );
          return;
        }

        const report = await fetchAlchemyAssetTransfers(network, {
          fromBlock: range.fromBlockNumber,
          toBlock: range.toBlockNumber,
          contractAddresses: [token],
          categories,
          maxCount,
          maxPages,
          order,
        });

        const filename =
          `alchemy transfers_${network}_${token}_` +
          `${range.fromBlockNumber}-${range.toBlockNumber}.json`;
        await saveJson(outputDir, filename, report);
        console.log(
          `  ✓ transfers ${token} ${range.fromBlockNumber}-${range.toBlockNumber} ` +
            `(${report.transfers.length} record(s), ${report.pagesFetched} page(s)` +
            `${report.truncated ? ", more pages remain" : ""})`,
        );

        if (
          checkpointEnabled &&
          checkpoints !== null &&
          getArg("from-block") === null &&
          report.nextPageKey === null
        ) {
          checkpoints.checkpoints[range.checkpointKey] = {
            network,
            chainId: getAlchemyChainId(network),
            contractAddresses: [token],
            categories,
            lastScannedBlock: range.toBlockNumber,
            updatedAt: new Date().toISOString(),
          };
          await saveAlchemyCheckpoints(outputDir, checkpoints);
          console.log(`  ✓ checkpoint ${range.checkpointKey} -> ${range.toBlockNumber}`);
        } else if (report.nextPageKey !== null) {
          console.log("  ! checkpoint not advanced: more pages remain for this range");
        }
      });
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} Alchemy step(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAlchemy collection complete. Output: ${outputDir}`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("Alchemy collection failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
