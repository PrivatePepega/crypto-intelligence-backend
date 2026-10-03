import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import "dotenv/config";

/**
 * Client for Financial Modeling Prep's official hosted MCP server.
 *
 * FMP publishes a single remote Streamable HTTP MCP endpoint that wraps its
 * whole REST API:
 *
 *   https://financialmodelingprep.com/mcp?apikey=YOUR_FMP_API_KEY
 *
 * There is no separate SDK and no second base URL to negotiate. Two traits of
 * that server shape everything below:
 *
 *  1. **Tool multiplexing.** The server exposes ~28 tool names, but each covers
 *     a whole product family. Every news feed - crypto, general, press
 *     releases, FMP articles - is the *same* `news` tool, discriminated only
 *     by an `endpoint` enum in the arguments. Callers should pin `endpoint`
 *     per feature rather than pass it through from the outside.
 *
 *  2. **Inconsistent result envelopes.** The documented shape is
 *     `structuredContent = { data: [...] }`, and most endpoints honour it.
 *     `fmp-articles` does not: it returns an empty `structuredContent` and
 *     puts a bare JSON array in the first text content block.
 *     {@link readPayloadRecords} accepts every shape observed so a caller
 *     never has to care which one it received.
 *
 * Authentication is an `apikey` query parameter on the URL, not a header.
 *
 * `dotenv` is imported here, matching `mcp/newsFlash` and `mcp/composio`, so
 * this client also works when run directly as a script (see `fmp.test.ts`)
 * rather than through the app's entry point.
 */

/**
 * Reads configuration at call time rather than at module load.
 *
 * Module-scope `process.env` reads are captured once, which silently yields
 * `undefined` when this module is imported before `dotenv` has populated the
 * environment - a standalone `tsx` script hits exactly that. Resolving on each
 * call makes the client independent of import order.
 */
const getFmpMcpUrl = (): string =>
  process.env.FMP_MCP_URL ?? "https://financialmodelingprep.com/mcp";

const getFmpApiKey = (): string | undefined => process.env.FMP_API_KEY;

/** Identifies this project to FMP during the MCP handshake. */
const CLIENT_INFO = {
  name: "crypto-intelligence-fmp",
  version: "1.0.0",
} as const;

/**
 * Builds the connection URL with the API key attached.
 *
 * The result contains the secret, so it must never be logged. Use
 * {@link describeFmpEndpoint} when a URL needs to be shown to a human.
 */
export const buildFmpMcpUrl = (): string => {
  const apiKey = getFmpApiKey();

  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not set. Add it to .env to use the FMP MCP server.",
    );
  }

  const url = new URL(getFmpMcpUrl());

  url.searchParams.set("apikey", apiKey);

  return url.toString();
};

/** Human-readable endpoint description with the key redacted. */
export const describeFmpEndpoint = (): string => {
  const base = getFmpMcpUrl();

  return getFmpApiKey()
    ? `${base}?apikey=${"*".repeat(8)}`
    : `${base} (no API key configured)`;
};

/** True when an API key is present, so callers can skip the provider cleanly. */
export const isFmpConfigured = (): boolean => Boolean(getFmpApiKey());

let clientPromise: Promise<Client> | null = null;

const createFmpClient = async (): Promise<Client> => {
  const client = new Client(CLIENT_INFO);

  const transport = new StreamableHTTPClientTransport(
    new URL(buildFmpMcpUrl()),
  );

  await client.connect(transport);

  return client;
};

/**
 * Returns the shared FMP MCP client, connecting on first use.
 *
 * The connection is cached because it is a live Streamable HTTP session with
 * server state; opening one per call would cost a handshake on every tool
 * invocation. A failed connection clears the cache so the next call retries
 * rather than replaying a rejected promise forever.
 */
export const getFmpClient = async (): Promise<Client> => {
  if (clientPromise === null) {
    clientPromise = createFmpClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
};

/** Closes the shared client. Safe to call when never connected. */
export const closeFmpClient = async (): Promise<void> => {
  if (clientPromise === null) {
    return;
  }

  const client = await clientPromise.catch(() => null);

  clientPromise = null;

  await client?.close();
};

// --------------------------------------------------
// Calls
// --------------------------------------------------

/** Arguments accepted by {@link callFmpTool}. */
export type FmpToolArgs = Record<string, unknown>;

/**
 * Calls one FMP MCP tool and returns the raw result.
 *
 * Errors are *not* thrown here. FMP reports both transport problems and
 * plan-gating as `isError: true` on a successful HTTP round trip, and a caller
 * usually wants to tell those apart - run {@link assertNotError} to convert a
 * failed result into an exception once that distinction has been made.
 */
export const callFmpTool = async (
  name: string,
  args: FmpToolArgs,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<Client["callTool"]>>> => {
  const client = await getFmpClient();

  return await client.callTool(
    { name, arguments: args },
    signal ? { signal } : undefined,
  );
};

/** Lists every tool the server exposes, for discovery and capability checks. */
export const listFmpTools = async () => {
  const client = await getFmpClient();

  const { tools } = await client.listTools();

  return tools;
};

// --------------------------------------------------
// Result readers
// --------------------------------------------------

/** Concatenated text blocks from a tool result. */
/**
 * Minimal shape of an MCP content block.
 *
 * The readers take `unknown` and narrow internally rather than declaring the
 * SDK's result type. The SDK's `content` is a tagged union of five block types,
 * which is not assignable to a hand-written shape under
 * `exactOptionalPropertyTypes`, so passing a real tool result straight in is a
 * compile error. Narrowing here keeps every call site clean and makes the
 * readers immune to SDK type changes.
 */
type ContentBlock = {
  type?: string | undefined;
  text?: string | undefined;
};

/** Extracts the content blocks from an arbitrary tool result. */
const contentBlocks = (result: unknown): ContentBlock[] => {
  if (typeof result !== "object" || result === null) {
    return [];
  }

  const content = (result as { content?: unknown }).content;

  return Array.isArray(content) ? (content as ContentBlock[]) : [];
};

/** Reads a possibly-absent property from an arbitrary value. */
const prop = <T>(value: unknown, key: string): T | undefined =>
  typeof value === "object" && value !== null
    ? ((value as Record<string, unknown>)[key] as T | undefined)
    : undefined;

/** Concatenated text blocks from a tool result. */
export const readText = (result: unknown): string =>
  contentBlocks(result)
    .map((item) => item.text ?? "")
    .join("\n");

/** Pulls an array out of a value, wrapping a lone object. */
const toRecords = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === "object") {
    return [value as T];
  }

  return [];
};

/**
 * Reads the record array out of a raw FMP tool result.
 *
 * Three envelope shapes have been observed against the live server and all
 * three are accepted, in order of preference:
 *
 *   1. `structuredContent.data` - documented, used by most endpoints
 *   2. `structuredContent`      - a bare array
 *   3. text content block       - a bare JSON array (`fmp-articles`) or
 *                                 `{ data: [...] }`
 *
 * An unparseable payload yields `[]`. That is deliberately not an error here:
 * a genuine empty result and an unrecognised envelope are indistinguishable
 * here, so callers pair this with {@link assertNotError} and treat an empty
 * array from a successful call as "no matches".
 */
export const readPayloadRecords = <T = Record<string, unknown>>(
  result: unknown,
): T[] => {
  const structured = prop<unknown>(result, "structuredContent");

  if (structured != null) {
    const fromData = toRecords<T>(prop<unknown>(structured, "data"));

    if (fromData.length > 0) {
      return fromData;
    }

    const bare = toRecords<T>(structured);

    if (bare.length > 0) {
      return bare;
    }
  }

  const text = readText(result).trim();

  if (text) {
    try {
      const fromText = toRecords<T>(JSON.parse(text) as unknown);

      if (fromText.length > 0) {
        return fromText;
      }
    } catch {
      // Not JSON. Leave empty; the caller decides whether that is a problem.
    }
  }

  return [];
};

/**
 * Rewrites FMP's plan-gating message into something actionable.
 *
 * An under-tiered key gets `isError: true` with an "ACCESS DENIED ... requires
 * the Starter, Premium, ..." message. Passed through verbatim that reads like
 * an outage and invites pointless retries, so the tier is named and the
 * upgrade link is included. Non-gating messages are returned unchanged.
 */
export const describeFmpError = (message: string): string => {
  const trimmed = message.trim();

  if (!/ACCESS DENIED|requires the/i.test(trimmed)) {
    return trimmed;
  }

  const tiers = trimmed.match(/requires the ([A-Za-z,\s]+?)plan/i)?.[1];

  return [
    "FMP subscription does not include this endpoint",
    tiers ? `requires the ${tiers.trim()} plan or higher` : null,
    "upgrade at https://financialmodelingprep.com/developer/docs/pricing",
    "do not retry until the plan is upgraded",
  ]
    .filter(Boolean)
    .join("; ");
};

/**
 * Throws when a tool call failed, so a failed call can never be mistaken for
 * "nothing matched".
 */
export const assertNotError = (result: unknown): void => {
  if (prop<boolean>(result, "isError") !== true) {
    return;
  }

  const message = readText(result).trim().slice(0, 600);

  throw new Error(
    message
      ? `FMP: ${describeFmpError(message)}`
      : "FMP call failed with no error message.",
  );
};