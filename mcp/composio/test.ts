import { executeCurrentsTool } from "./currents.client.js";
import "dotenv/config";

const run = async () => {
  console.log("");
  console.log("==============================================");
  console.log("CURRENTS COMPOSIO TEST");
  console.log("==============================================");

  // --------------------------------------------------
  // Test 1: Latest news
  // --------------------------------------------------

  console.log("");
  console.log("Testing CURRENTS_API_ACTIVITIES_LIST...");
  console.log("");

  const latestNews = await executeCurrentsTool(
    "CURRENTS_API_ACTIVITIES_LIST",
    {
      language: "en",
      page_number: 1,
      page_size: 5,
    },
  );

  console.log(
    JSON.stringify(latestNews, null, 2),
  );

  // --------------------------------------------------
  // Test 2: Search news
  // --------------------------------------------------

  console.log("");
  console.log("----------------------------------------------");
  console.log("Testing CURRENTS_API_USER_USAGE_REPORT_GET...");
  console.log("----------------------------------------------");
  console.log("");

  const searchNews = await executeCurrentsTool(
    "CURRENTS_API_USER_USAGE_REPORT_GET",
    {
      keywords: "Bitcoin crypto",
      language: "en",
      page_number: 1,
      page_size: 5,
    },
  );

  console.log(
    JSON.stringify(searchNews, null, 2),
  );

  console.log("");
  console.log("==============================================");
  console.log("CURRENTS TEST COMPLETE");
  console.log("==============================================");
};

run().catch((error) => {
  console.error("");
  console.error("CURRENTS TEST FAILED");
  console.error("----------------------------------------------");
  console.error(error);
  process.exitCode = 1;
});