import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

/**
 * Shared GDELT Cloud MCP connection.
 *
 * ## Why the wrapper matters
 *
 * GDELT Cloud does NOT expose its ~106 data tools directly. The server exposes
 * 49 tools, of which only three matter for data access:
 *
 *   - `gdelt_cloud_tool_list`  - browse the catalogue
 *   - `gdelt_cloud_tool_get`   - input/output schema for one tool
 *   - `gdelt_cloud_tool_call`  - actually invoke one
 *
 * `gdelt_cloud_tool_call` takes exactly two keys:
 *
 *   { tool_name: "search_events", tool_arguments: { ... } }
 *
 * The nesting key is **`tool_arguments`**, not `arguments`. Passing `arguments`
 * is rejected upstream with a pydantic `unexpected_keyword_argument` error
 * naming `call[category_tool_call].arguments`.
 */

/** The three progressive-discovery wrappers the server actually exposes. */
export const GDELT_WRAPPER_TOOLS = [
  "gdelt_cloud_tool_list",
  "gdelt_cloud_tool_get",
  "gdelt_cloud_tool_call",
] as const;

/** The seven data tools the agents need. */
export const GDELT_TARGET_TOOLS = [
  "search_events",
  "summarize_events",
  "get_event",
  "search_stories",
  "summarize_stories",
  "get_story",
  "get_story_articles",
] as const;

export type GdeltTargetTool = (typeof GDELT_TARGET_TOOLS)[number];

const GDELT_MCP_URL =
  process.env.GDELT_MCP_URL ?? "https://gdelt-cloud-mcp.fastmcp.app/mcp";

/**
 * A raw MCP tool result, kept unnormalized on purpose: the discovery phase
 * exists to inspect exactly what upstream sends.
 */
export type RawGdeltResult = {
  isError?: boolean;
  content?: unknown;
  structuredContent?: unknown;
};

let clientPromise: Promise<Client> | null = null;

const createClient = async (): Promise<Client> => {
  const apiKey = process.env.GDELT_CLOUD_MCP_KEY;

  if (!apiKey) {
    throw new Error(
      "GDELT_CLOUD_MCP_KEY is not set in the environment.",
    );
  }

  const client = new Client({
    name: "crypto-intelligence-gdelt",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(GDELT_MCP_URL),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    },
  );

  await client.connect(transport);

  return client;
};

/**
 * One connection, reused across calls.
 *
 * A failed connect clears the memo so the next caller retries rather than
 * inheriting a rejected promise forever.
 */
export const getGdeltClient = async (): Promise<Client> => {
  if (clientPromise === null) {
    clientPromise = createClient().catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
};

export const closeGdeltClient = async (): Promise<void> => {
  if (clientPromise === null) {
    return;
  }

  const client = await clientPromise.catch(() => null);
  clientPromise = null;

  await client?.close();
};

/**
 * Default record limit for the list fetchers.
 *
 * Applied when the caller omits `limit`, so a captured fixture or an agent call
 * returns enough records to be useful without needing to know the pagination.
 * Upstream caps search rows at 100 and summary buckets at 500, so 20 sits well
 * inside both.
 *
 * An explicit `limit` always wins, so a caller that needs volume or a single
 * record is unaffected.
 */
export const DEFAULT_RECORD_LIMIT = 20;

/** Merges `input` over `{ limit: DEFAULT_RECORD_LIMIT }`. */
export const withDefaultLimit = (
  input: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { limit: DEFAULT_RECORD_LIMIT };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
};

/**
 * Invokes a GDELT Cloud data tool through `gdelt_cloud_tool_call`.
 *
 * Returns the raw MCP result untouched - no throwing on `isError`, no unwrapping
 * - so the discovery fixtures keep the full upstream shape including errors.
 */
export const callGdeltTool = async (
  toolName: GdeltTargetTool,
  toolArguments: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<RawGdeltResult> => {
  const client = await getGdeltClient();

  const result = await client.callTool(
    {
      name: "gdelt_cloud_tool_call",
      arguments: {
        tool_name: toolName,
        tool_arguments: toolArguments,
      },
    },
    signal ? { signal } : undefined,
  );

  return result as RawGdeltResult;
};

/**
 * Pulls `structuredContent` out of a raw result.
 *
 * GDELT Cloud returns the payload there; `content[0].text` is the same JSON as
 * a string. Returns undefined when the call errored so callers can branch.
 */
export const readStructured = (
  result: RawGdeltResult,
): Record<string, unknown> | undefined => {
  const structured = result.structuredContent;

  if (structured && typeof structured === "object") {
    return structured as Record<string, unknown>;
  }

  const text = result.content as
    | { type: string; text?: string }[]
    | undefined;
  const first = text?.[0]?.text;

  if (typeof first !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(first) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/** Concatenated text blocks, used to surface upstream error messages. */
export const readText = (result: RawGdeltResult): string => {
  const content = result.content as { type: string; text?: string }[] | undefined;

  return (content ?? [])
    .map((item) => item.text ?? "")
    .join("\n");
};