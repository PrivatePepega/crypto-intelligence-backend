import {
  closeNewsflashClient,
  getNewsflashClient,
} from "./client.js";

import {
  normalizeNewsflashEvents,
  normalizeNewsflashEventsForAI,
  normalizeNewsflashEvent,
  normalizeNewsflashEventForAI,
  normalizeNewsflashArticles,
  normalizeNewsflashArticlesForAI,
} from "./newsFlashNormalizer.js";

const run = async () => {
  console.log("");
  console.log("==============================================");
  console.log("NEWSFLASH MCP + AI OUTPUT NORMALIZER TEST");
  console.log("==============================================");

  const client = await getNewsflashClient();

  // --------------------------------------------------
  // 1. get_events
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("1. get_events → final AI output");
  console.log("==============================================");

  const eventsResult = await client.callTool({
    name: "get_events",
    arguments: {
      q: "Bitcoin",
      limit: 5,
    },
  });

  const normalizedEvents =
    normalizeNewsflashEvents(eventsResult);

  const finalEvents =
    normalizeNewsflashEventsForAI(normalizedEvents);

  console.log(
    JSON.stringify(finalEvents, null, 2),
  );

  // Extract event ID from the provider-normalized
  // representation so we can test get_event.
  const firstEventId =
    normalizedEvents.events[0]?.id ?? null;

  // --------------------------------------------------
  // 2. get_event
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("2. get_event → final AI output");
  console.log("==============================================");

  if (firstEventId === null) {
    console.log(
      "Skipping get_event because no event ID was found.",
    );
  } else {
    const eventResult = await client.callTool({
      name: "get_event",
      arguments: {
        id: firstEventId,
      },
    });

    const normalizedEvent =
      normalizeNewsflashEvent(eventResult);

    const finalEvent =
      normalizeNewsflashEventForAI(normalizedEvent);

    console.log(
      JSON.stringify(finalEvent, null, 2),
    );
  }

  // --------------------------------------------------
  // 3. search_articles
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("3. search_articles → final AI output");
  console.log("==============================================");

  const articlesResult = await client.callTool({
    name: "search_articles",
    arguments: {
      q: "Bitcoin",
      limit: 5,
    },
  });

  const normalizedArticles =
    normalizeNewsflashArticles(articlesResult);

  const finalArticles =
    normalizeNewsflashArticlesForAI(
      normalizedArticles,
    );

  console.log(
    JSON.stringify(finalArticles, null, 2),
  );

  console.log("");
  console.log("==============================================");
  console.log("NEWSFLASH AI OUTPUT TEST COMPLETE");
  console.log("==============================================");
};

run()
  .catch((error) => {
    console.error("");
    console.error("NEWSFLASH AI OUTPUT TEST FAILED");
    console.error("----------------------------------------------");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNewsflashClient();
  });