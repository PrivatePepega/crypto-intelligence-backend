import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import "dotenv/config";

/**
 * Client for CoinGecko's hosted MCP server.
 *
 * ## Endpoints
 *
 * CoinGecko publishes two remote servers and they authenticate differently:
 *
 *   keyless  https://mcp.api.coingecko.com/mcp        no auth
 *   pro-api  https://mcp.pro-api.coingecko.com/mcp   OAuth access token
 *
 * Verified 2026-10-03: the `pro-api` server rejects an **API key** in every
 * conventional place - `Authorization: Bearer`, `x-cg-pro-api-key`,
 * `x-cg-demo-api-key` and an `apikey` query parameter all return
 * `{"error":"invalid_token"}`. It wants an OAuth *access token* obtained
 * through a browser flow, which cannot complete on a headless server.
 *
 * So `COINGECKO_API_KEY` is **not** used by this client. It remains valid for
 * the REST API and the local `@coingecko/coingecko-mcp` package, but the
 * keyless MCP server does not need it and does not use it. Keyless is the
 * default here because it is the only option that works unattended; override
 * with `COINGECKO_MCP_URL` once an OAuth token is available.
 *
 * ## Tool surface
 *
 * Only two tools, which is a fundamentally different shape from FMP's 28:
 *
 *   `search_docs`  looks up SDK documentation
 *   `execute`      runs TypeScript against the CoinGecko SDK in a sandbox
 *
 * There is no per-endpoint tool and no `endpoint` enum. Reaching the ~100 API
 * endpoints means writing SDK code, which `execute` interprets server-side.
 *
 * ## SECURITY: `execute` runs code
 *
 * `execute` takes a `code` string and evaluates it. Passing model-authored
 * code straight through would let a prompt injection reach CoinGecko's
 * sandbox, so this client does not expose a generic passthrough as its
 * primary API. Instead:
 *
 *  - The named helpers below (`pingCoinGecko`, `getCoinGeckoUsage`,
 *    `fetchCoinGeckoSimplePrice`) contain **fixed** code and are safe to call
 *    with untrusted input, because parameters are serialised with
 *    `JSON.stringify` rather than interpolated as source.
 *  - {@link runCoinGeckoCode} is the only escape hatch. It is exported
 *    deliberately, must be reached deliberately, and should not be wired
 *    straight to an LLM tool. Read the note on it before using it.
 */

/** Base endpoint, overridable so the client can be pointed at a mock. */
const getCoinGeckoMcpUrl = (): string =>
  process.env.COINGECKO_MCP_URL ?? "https://mcp.api.coingecko.com/mcp";

/** Identifies this project to CoinGecko during the MCP handshake. */
const CLIENT_INFO = {
  name: "crypto-intelligence-coingecko",
  version: "1.0.0",
} as const;

/** Human-readable endpoint description. Safe to log; holds no secret. */
export const describeCoinGeckoEndpoint = (): string => getCoinGeckoMcpUrl();

/**
 * True when an API key is present.
 *
 * Reported for diagnostics only. The keyless MCP server does not consume it -
 * see the note at the top of this file.
 */
export const isCoinGeckoConfigured = (): boolean =>
  Boolean(process.env.COINGECKO_API_KEY);

let clientPromise: Promise<Client> | null = null;

const createCoinGeckoClient = async (): Promise<Client> => {
  const client = new Client(CLIENT_INFO);

  await client.connect(
    new StreamableHTTPClientTransport(new URL(getCoinGeckoMcpUrl())),
  );

  return client;
};

/**
 * Returns the shared CoinGecko MCP client, connecting on first use.
 *
 * The connection is a live Streamable HTTP session and is cached rather than
 * rebuilt per call. A failed connection clears the cache so the next call
 * retries instead of replaying a rejected promise.
 */
export const getCoinGeckoClient = async (): Promise<Client> => {
  if (clientPromise === null) {
    clientPromise = createCoinGeckoClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
};

/** Closes the shared client. Safe to call when never connected. */
export const closeCoinGeckoClient = async (): Promise<void> => {
  if (clientPromise === null) {
    return;
  }

  const client = await clientPromise.catch(() => null);

  clientPromise = null;

  await client?.close();
};

/** Lists the tools the server exposes. CoinGecko currently returns two. */
export const listCoinGeckoTools = async () => {
  const client = await getCoinGeckoClient();

  const { tools } = await client.listTools();

  return tools;
};

// --------------------------------------------------
// Result readers
// --------------------------------------------------

/**
 * Minimal shape of an MCP content block.
 *
 * The readers below take `unknown` and narrow internally rather than
 * declaring the SDK's result type. That keeps them compiling under
 * `exactOptionalPropertyTypes` and makes them immune to changes in the SDK's
 * `content` union, which is a tagged union of five block types.
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

/**
 * Reads the payload out of an `execute` result.
 *
 * Verified 2026-10-03: `execute` leaves `structuredContent` **undefined** and
 * returns the payload as a JSON string in the text block, wrapped in a
 * `result` key:
 *
 *   content[0].text === '{"result":{"bitcoin":{"usd":84789}}}'
 *
 * Unlike FMP there is no `data` wrapper and no bare-array variant to worry
 * about, but `structuredContent` is still accepted first in case CoinGecko
 * populates it in future.
 *
 * Returns `undefined` when the payload cannot be read, so a caller can tell
 * "no payload" apart from "payload was null".
 */
export const readExecuteResult = <T = unknown>(result: unknown): T | undefined => {
  const structured = prop<Record<string, unknown>>(result, "structuredContent");

  if (structured != null && "result" in structured) {
    return structured.result as T;
  }

  const text = readText(result).trim();

  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    if (parsed && typeof parsed === "object" && "result" in parsed) {
      return (parsed as { result: T }).result;
    }

    // A payload that is not wrapped in `result` is still usable.
    return parsed as T;
  } catch {
    return undefined;
  }
};

/**
 * Throws when a tool call failed.
 *
 * CoinGecko reports every problem as `isError: true` with a plain-text
 * explanation - including the sandbox's own complaints about malformed code -
 * so the message is usually the only diagnostic available.
 */
export const assertNotError = (result: unknown): void => {
  if (prop<boolean>(result, "isError") !== true) {
    return;
  }

  const message = readText(result).trim();

  throw new Error(
    message
      ? `CoinGecko: ${message.slice(0, 600)}`
      : "CoinGecko call failed with no error message.",
  );
};

/**
 * Builds the `run(client)` wrapper that `execute` requires.
 *
 * Values are embedded with `JSON.stringify`, which yields a JSON literal that
 * is also valid TypeScript and is correctly escaped. That is what makes the
 * named helpers safe to call with untrusted input: a value containing a quote,
 * backslash or newline cannot break out of the generated source.
 */
const buildRunWrapper = (
  body: (argsLiteral: string) => string,
  args?: unknown,
): string => {
  const argsLiteral = JSON.stringify(args ?? {}, null, 2);

  return `async function run(client) {
  const args = ${argsLiteral};
${body(argsLiteral)}
}`;
};

// --------------------------------------------------
// Safe, fixed-code queries
// --------------------------------------------------

/** Response from `ping.get()`. */
export type CoinGeckoPing = {
  gecko_says?: string;
};

/** Response from `key.get()` - account quota and rate limit. */
export type CoinGeckoUsage = {
  plan?: string;
  rate_limit_request_per_minute?: number;
  monthly_call_credit?: number;
  current_total_monthly_calls?: number;
  current_remaining_monthly_calls?: number;
  api_key_rate_limit_request_per_minute?: number;
  api_key_monthly_call_credit?: number;
  api_key_current_total_monthly_calls?: number;
};

/**
 * Liveness check. The cheapest possible call, and the right first probe when
 * diagnosing connectivity.
 *
 * Uses fixed code - nothing is interpolated.
 */
export const pingCoinGecko = async (
  signal?: AbortSignal,
): Promise<CoinGeckoPing> => {
  const client = await getCoinGeckoClient();

  const result = await client.callTool(
    {
      name: "execute",
      arguments: {
        code: buildRunWrapper(() => "  return await client.ping.get();"),
        intent: "Check that the CoinGecko API server is reachable.",
      },
    },
    signal ? { signal } : undefined,
  );

  assertNotError(result);

  return (readExecuteResult<CoinGeckoPing>(result) ?? {}) as CoinGeckoPing;
};

/**
 * Account usage: plan, rate limit and remaining monthly calls.
 *
 * Also the way to confirm which quota the keyless server is drawing on. Uses
 * fixed code.
 */
export const getCoinGeckoUsage = async (
  signal?: AbortSignal,
): Promise<CoinGeckoUsage> => {
  const client = await getCoinGeckoClient();

  const result = await client.callTool(
    {
      name: "execute",
      arguments: {
        code: buildRunWrapper(() => "  return await client.key.get();"),
        intent: "Report API usage, rate limits and remaining credits.",
      },
    },
    signal ? { signal } : undefined,
  );

  assertNotError(result);

  return (readExecuteResult<CoinGeckoUsage>(result) ?? {}) as CoinGeckoUsage;
};

/** Options for {@link fetchCoinGeckoSimplePrice}. */
export type SimplePriceOptions = {
  /** CoinGecko ids, e.g. `["bitcoin", "ethereum"]`. */
  ids: string[];

  /** Currencies to quote in, e.g. `["usd"]`. */
  vsCurrencies?: string[];
};

/**
 * Current price for one or more coins.
 *
 * The generated code is a fixed template; `ids` and `vsCurrencies` are
 * serialised as JSON literals rather than interpolated into source, so
 * untrusted input cannot alter what runs. Returns the SDK's own shape:
 *
 *   { bitcoin: { usd: 84789 } }
 *
 * The SDK types `ids` and `vs_currencies` as comma-separated **strings**, not
 * arrays - the sandbox rejects an array with a real TypeScript diagnostic
 * ("Type 'string[]' is not assignable to type 'string'"), so the join happens
 * inside the fixed template.
 */
export const fetchCoinGeckoSimplePrice = async (
  options: SimplePriceOptions,
  signal?: AbortSignal,
): Promise<Record<string, Record<string, number>>> => {
  const ids = options.ids.map((id) => String(id));

  const vsCurrencies =
    options.vsCurrencies?.map((currency) => String(currency)) ?? ["usd"];

  const client = await getCoinGeckoClient();

  const result = await client.callTool(
    {
      name: "execute",
      arguments: {
        code: buildRunWrapper(
          () =>
            "  return await client.simple.price.get({\n" +
            '    ids: args.ids.join(","),\n' +
            '    vs_currencies: args.vsCurrencies.join(","),\n' +
            "  });",
          { ids, vsCurrencies },
        ),
        intent: `Fetch the current price of ${ids.join(", ")}.`,
      },
    },
    signal ? { signal } : undefined,
  );

  assertNotError(result);

  return (
    readExecuteResult<Record<string, Record<string, number>>>(result) ?? {}
  );
};

// --------------------------------------------------
// Escape hatch
// --------------------------------------------------

/**
 * Runs arbitrary TypeScript against the CoinGecko SDK sandbox.
 *
 * ## Read this before using it
 *
 * `code` is evaluated server-side. This function exists because CoinGecko's
 * MCP server offers no other way to reach its ~100 API endpoints, and because
 * hardcoding all of them would be unmaintainable. That does not make it safe to
 * expose to a model.
 *
 * Do not pass model-authored `code` here. The sandbox is CoinGecko's, not
 * ours, and the blast radius of a prompt injection reaching it is unknown -
 * at minimum it burns the account's call credit, and it may reach anything the
 * sandbox exposes.
 *
 * Prefer the named helpers above, which use fixed code. When genuinely new
 * CoinGecko data is needed, add a named helper with fixed code and parameters
 * serialised as JSON literals, exactly as `fetchCoinGeckoSimplePrice` does.
 *
 * @param code    TypeScript declaring `async function run(client)`.
 * @param intent  Plain-English description of what the code should do.
 */
export const runCoinGeckoCode = async <T = unknown>(
  code: string,
  intent: string,
  signal?: AbortSignal,
): Promise<T> => {
  const client = await getCoinGeckoClient();

  const result = await client.callTool(
    {
      name: "execute",
      arguments: { code, intent },
    },
    signal ? { signal } : undefined,
  );

  assertNotError(result);

  const payload = readExecuteResult<T>(result);

  if (payload === undefined) {
    throw new Error(
      "CoinGecko: tool call succeeded but returned no readable payload.",
    );
  }

  return payload;
};