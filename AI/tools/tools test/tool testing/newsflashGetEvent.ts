import { runTool } from "./_harness.js";
import { newsflashGetEventTool } from "../../newsflashGetEvent.js";
import { newsflashGetEventsTool } from "../../newsflashGetEvents.js";

/**
 * Qualifying run for `newsflashGetEvent`.
 *
 * **Singular use** - it is a detail lookup, not a search, so one run rather than
 * three domains.
 *
 * ## Why this file does two calls
 *
 * The tool's only input is an `id`, and an id can only come from a prior
 * `newsflashGetEvents` call. Rather than hardcode an id that would go stale or
 * 404, this discovers a live one first and then fetches its detail.
 *
 * That makes it the only file in this folder that calls two tools, and it is
 * worth knowing when reading the captured output: the `events.crypto.response.json`
 * file is the discovery step, and this one is the lookup being qualified.
 */

/** Event id shape is not exported by the tool, so it is read defensively. */
const readFirstEventId = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;

  const container = ["items", "data", "events", "results"].find((key) =>
    Array.isArray(source[key]),
  );

  if (!container) {
    return null;
  }

  const first = (source[container] as unknown[])[0];

  const id =
    first && typeof first === "object"
      ? (first as Record<string, unknown>).id
      : undefined;

  return typeof id === "number" ? id : null;
};

/**
 * The AI SDK types `execute`'s options as requiring a `context`, which is
 * supplied by the agent runtime and has no meaning outside it. Loosened here so
 * the discovery call type-checks.
 */
const looseEventsTool = newsflashGetEventsTool as unknown as {
  execute: (
    input: unknown,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("  newsflashGetEvent - discovering a live event id first");
  console.log("=".repeat(70));

  let id: number | null = null;

  try {
    const events = await looseEventsTool.execute(
      { q: "Bitcoin", category: "crypto", limit: 5, min_sources: 2 },
      {
        toolCallId: "qualify-newsflashGetEvent-discovery",
        messages: [],
        context: undefined,
      },
    );

    id = readFirstEventId(events);

    console.log(`  discovery: ${id === null ? "no event id found" : `id ${id}`}`);
  } catch (error) {
    console.log(
      `  discovery FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Fall through so the harness records the failure against the real tool.
  }

  await runTool({
    name: "newsflashGetEvent",
    tool: newsflashGetEventTool,
    ...(id === null ? {} : { args: { id } }),
  });
};

void main();