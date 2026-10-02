import {
  callMcpTool,
  closeMcpClient,
} from "../client.js";

const run = async () => {
  console.log("");
  console.log("==============================================");
  console.log("CURRENTS MCP STEP 1 QUERY TEST");
  console.log("==============================================");

  console.log("");
  console.log("Testing exact Step 1 query...");
  console.log("----------------------------------------------");
  console.log("");

  const result = await callMcpTool(
    "currents_search_news",
    {
      keywords: "Bitcoin crypto",
      language: "en",
      page_number: 1,
      page_size: 10,
      start_date: "2026-02-05T00:00:00Z",
    },
  );

  console.log(
    JSON.stringify(result, null, 2),
  );

  console.log("");
  console.log("==============================================");
  console.log("CURRENTS MCP STEP 1 QUERY TEST COMPLETE");
  console.log("==============================================");
};

run()
  .catch((error) => {
    console.error("");
    console.error("CURRENTS MCP STEP 1 QUERY TEST FAILED");
    console.error("----------------------------------------------");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMcpClient();
  });