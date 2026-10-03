/**
 * Empirical test: can summarize_events / summarize_stories accept an id?
 *
 * The docs describe both as aggregate rollups over a window. This checks that
 * rather than assuming, by:
 *   1. listing every parameter the tool actually accepts
 *   2. passing an id anyway and recording what upstream does with it
 *   3. testing the relationship the docs DO describe
 *
 * Run: npx tsx mcp/GDELT/probeSummarizeId.ts
 */
import { writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { readStructured } from "./gdeltClient.js";
import {
  fetchSearchEvents,
  fetchSearchStories,
  fetchSummarizeEvents,
  fetchSummarizeStories,
} from "./fetchers/index.js";

const GDELT_MCP_URL =
  process.env.GDELT_MCP_URL ?? "https://gdelt-cloud-mcp.fastmcp.app/mcp";
const GDELT_API_KEY = process.env.GDELT_CLOUD_MCP_KEY;

/** Reads the live schema for one tool and lists its accepted parameters. */
const listParams = async (
  client: Client,
  toolName: string,
): Promise<{ params: string[]; raw: unknown }> => {
  const got = await client.callTool({
    name: "gdelt_cloud_tool_get",
    arguments: { tool_name: toolName },
  });

  const text = (
    got.content as { text?: string }[] | undefined
  )?.[0]?.text ?? "{}";

  const parsed = JSON.parse(text) as {
    tools?: { name?: string; parameters?: { properties?: object } }[];
  };

  const tool = parsed.tools?.find((t) => t.name === toolName);
  const properties = tool?.parameters?.properties ?? {};

  return { params: Object.keys(properties), raw: parsed };
};

const readFirstId = (structured: unknown): string | undefined => {
  const data = (
    structured as { _gdelt?: { payload?: { data?: unknown } } } | undefined
  )?._gdelt?.payload?.data;

  const record = Array.isArray(data) ? data[0] : data;
  const id = (record as { id?: unknown } | undefined)?.id;

  return typeof id === "string" ? id : undefined;
};

const main = async (): Promise<void> => {
  const report: Record<string, unknown> = {};

  // ---- 1. what parameters do the summarize tools actually accept? -----
  const client = new Client({
    name: "gdelt-probe-summarize-id",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(GDELT_MCP_URL),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${GDELT_API_KEY ?? ""}` },
      },
    },
  );
  await client.connect(transport);

  console.log("");
  console.log("=".repeat(72));
  console.log("1. ACCEPTED PARAMETERS");
  console.log("=".repeat(72));

  for (const toolName of ["summarize_events", "summarize_stories"]) {
    const { params } = await listParams(client, toolName);
    report[`${toolName}_params`] = params;

    const idLike = params.filter((p) =>
      /(^|_)(id|ids|event_id|story_id|uid|uids)$/.test(p),
    );

    console.log(`\n  ${toolName}: ${params.length} accepted parameters`);
    console.log(`    ${params.join(", ")}`);
    console.log(
      idLike.length > 0
        ? `    id-like params: ${idLike.join(", ")}`
        : "    id-like params: NONE",
    );
  }

  // ---- 2. get a real id, then feed it to summarize and see what happens -
  console.log("");
  console.log("=".repeat(72));
  console.log("2. FEED A REAL EVENT ID TO summarize_events");
  console.log("=".repeat(72));

  const eventsResult = await fetchSearchEvents({ days: 3, sort: "significance" });
  const eventsStructured = readStructured(eventsResult);
  const eventId = readFirstId(eventsStructured);

  console.log(`  event id from search_events: ${eventId ?? "(none)"}`);

  // The event card, so we can scope the summarize to the same slice.
  const card = (
    (eventsStructured as { _gdelt?: { payload?: { data?: unknown[] } } })
      ._gdelt?.payload?.data ?? []
  )[0] as Record<string, unknown> | undefined;

  console.log(`  card event_date: ${String(card?.event_date)}`);
  console.log(`  card category  : ${String(card?.category)}`);

  if (eventId) {
    // Try the id under several plausible names.
    for (const [key, value] of [
      ["event_id", eventId],
      ["id", eventId],
      ["event_ids", [eventId]],
      ["entity", eventId],
    ] as const) {
      const result = await fetchSummarizeEvents({
        group_by: "date",
        days: 7,
        ...({ [key]: value } as Record<string, unknown>),
      });

      const text = (
        result.content as { text?: string }[] | undefined
      )
        ?.map((c) => c.text ?? "")
        .join(" ")
        .slice(0, 180);

      const buckets = Array.isArray(
        (readStructured(result) as { _gdelt?: { payload?: { data?: unknown } } })
          ?._gdelt?.payload?.data,
      )
        ? (
            readStructured(result) as {
              _gdelt?: { payload?: { data?: unknown[] } };
            }
          )._gdelt?.payload?.data?.length
        : 0;

      report[`summarize_events_with_${key}`] = {
        isError: result.isError === true,
        buckets,
        message: text,
      };

      console.log("");
      console.log(`  pass ${key}=${JSON.stringify(value).slice(0, 40)}`);
      console.log(`    isError : ${result.isError === true}`);
      console.log(`    buckets : ${buckets ?? "n/a"}`);
      console.log(`    message : ${text?.slice(0, 140)}`);
    }
  }

  // ---- 3. the relationship the docs actually describe ------------------
  console.log("");
  console.log("=".repeat(72));
  console.log("3. THE RELATIONSHIP THAT DOES EXIST");
  console.log("=".repeat(72));

  // summarize_events group_by=subcategory discovers buckets, which then feed
  // search_events via category+subcategory. That flows summary -> search.
  const discovery = await fetchSummarizeEvents({
    group_by: "subcategory",
    category: "Battles",
    days: 7,
  });

  const buckets = (
    readStructured(discovery) as {
      _gdelt?: { payload?: { data?: { key?: string }[] } };
    }
  )?._gdelt?.payload?.data ?? [];

  console.log(`  summarize_events(group_by=subcategory, category=Battles)`);
  console.log(`    -> ${buckets.length} bucket(s)`);
  buckets.slice(0, 8).forEach((b) => {
    console.log(`       key=${b.key}`);
  });

  const topKey = buckets
    .map((b) => b.key)
    .find((k): k is string => typeof k === "string" && k.length > 0);

  if (topKey) {
    console.log("");
    console.log(`  Now feed that discovered key BACK into search_events:`);

    const drilled = await fetchSearchEvents({
      category: "Battles",
      subcategory: topKey,
      days: 7,
      limit: 3,
    });

    const records = (
      readStructured(drilled) as {
        _gdelt?: { payload?: { data?: unknown[] } };
      }
    )?._gdelt?.payload?.data ?? [];

    console.log(`    subcategory="${topKey}" -> ${records.length} event(s)`);
    records.slice(0, 3).forEach((r) => {
      const rec = r as { id?: string; title?: string };
      console.log(`       ${rec.id}  ${String(rec.title).slice(0, 60)}`);
    });

    report["discovered_subcategory"] = topKey;
    report["drilled_event_count"] = records.length;
  }

  // ---- 4. scoping a summarize to one event's own slice ----------------
  if (card) {
    console.log("");
    console.log("=".repeat(72));
    console.log("4. SCOPING A SUMMARIZE TO ONE EVENT'S SLICE");
    console.log("=".repeat(72));

    const country = (
      card.geo as { country?: string } | undefined
    )?.country;
    const category = card.category as string | undefined;

    console.log(`  scoping by event_date=${String(card.event_date)} country=${String(country)} category=${String(category)}`);

    const scoped = await fetchSummarizeEvents({
      group_by: "date",
      start_date: card.event_date as string,
      end_date: card.event_date as string,
      ...(country ? { country: [country] } : {}),
      ...(category ? { category: category as never } : {}),
    });

    const scopedBuckets = (
      readStructured(scoped) as {
        _gdelt?: { payload?: { data?: { key?: string; event_count?: number }[] } };
      }
    )?._gdelt?.payload?.data ?? [];

    console.log(`    -> ${scopedBuckets.length} bucket(s)`);
    scopedBuckets.forEach((b) => {
      console.log(`       key=${b.key}  event_count=${b.event_count}`);
    });

    report["scoped_summarize"] = {
      eventDate: card.event_date,
      country,
      category,
      buckets: scopedBuckets,
    };
  }

  // Same question for stories.
  const storiesResult = await fetchSearchStories({ days: 3, sort: "significance" });
  const storyId = readFirstId(readStructured(storiesResult));

  console.log("");
  console.log(`  story id from search_stories: ${storyId ?? "(none)"}`);

  if (storyId) {
    const withId = await fetchSummarizeStories({
      group_by: "date",
      days: 7,
      ...({ story_id: storyId } as Record<string, unknown>),
    });

    const message = (
      withId.content as { text?: string }[] | undefined
    )
      ?.map((c) => c.text ?? "")
      .join(" ")
      .slice(0, 200);

    console.log(`    pass story_id -> isError=${withId.isError === true}`);
    console.log(`    message: ${message ?? "(no message)"}`);

    report["summarize_stories_with_story_id"] = {
      isError: withId.isError === true,
      message,
    };
  }

  await client.close();

  await writeFile(
    "mcp/GDELT/raw/probe-summarize-id.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log("");
  console.log("Wrote mcp/GDELT/raw/probe-summarize-id.json");
};

main().catch((error: unknown) => {
  console.error("FAILED:", error);
  process.exitCode = 1;
});