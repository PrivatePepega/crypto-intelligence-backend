import {
  closeNewsflashClient,
  getNewsflashClient,
} from "./client.js";

const run = async () => {
  console.log("");
  console.log("==============================================");
  console.log("NEWSFLASH MCP TEST");
  console.log("==============================================");

  const client = await getNewsflashClient();

  const { tools } = await client.listTools();

  console.log("");
  console.log("Available tools:");
  console.log("----------------------------------------------");

  for (const tool of tools) {
    console.log(`- ${tool.name}`);
  }

  // --------------------------------------------------
  // 1. get_events
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("1. get_events");
  console.log("==============================================");

  const eventsResult = await client.callTool({
    name: "get_events",
    arguments: {
      q: "Bitcoin",
      limit: 5,
    },
  });

  console.log(JSON.stringify(eventsResult, null, 2));

  // Extract first event ID for get_event.
  let firstEventId: number | null = null;

  try {
    const textContent = eventsResult.content
      .filter(
        (item): item is { type: "text"; text: string } =>
          item.type === "text",
      )
      .map((item) => item.text)
      .join("\n");

    const parsed = JSON.parse(textContent);

    firstEventId = parsed.events?.[0]?.id ?? null;
  } catch {
    console.log("Could not extract event ID.");
  }

  // --------------------------------------------------
  // 2. get_event
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("2. get_event");
  console.log("==============================================");

  if (firstEventId === null) {
    console.log("Skipping get_event because no event ID was found.");
  } else {
    const eventResult = await client.callTool({
      name: "get_event",
      arguments: {
        id: firstEventId,
      },
    });

    console.log(JSON.stringify(eventResult, null, 2));
  }

  // --------------------------------------------------
  // 3. search_articles
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("3. search_articles");
  console.log("==============================================");

  const articlesResult = await client.callTool({
    name: "search_articles",
    arguments: {
      q: "Bitcoin",
      limit: 5,
    },
  });

  console.log(JSON.stringify(articlesResult, null, 2));

  // --------------------------------------------------
  // 4. list_sources
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("4. list_sources");
  console.log("==============================================");

  const sourcesResult = await client.callTool({
    name: "list_sources",
    arguments: {},
  });

  console.log(JSON.stringify(sourcesResult, null, 2));

  // --------------------------------------------------
  // 5. corpus_stats
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("5. corpus_stats");
  console.log("==============================================");

  const statsResult = await client.callTool({
    name: "corpus_stats",
    arguments: {},
  });

  console.log(JSON.stringify(statsResult, null, 2));

  console.log("");
  console.log("==============================================");
  console.log("NEWSFLASH MCP TEST COMPLETE");
  console.log("==============================================");
};

run()
  .catch((error) => {
    console.error("");
    console.error("NEWSFLASH MCP TEST FAILED");
    console.error("----------------------------------------------");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNewsflashClient();
  });