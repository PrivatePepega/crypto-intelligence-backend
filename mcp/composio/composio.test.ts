
import { executeCurrentsTool } from "./currents.client.js";

const run = async () => {
  console.log("");
  console.log("==============================================");
  console.log("CURRENTS COMPOSIO TEST");
  console.log("==============================================");

  console.log("");
  console.log("Testing latest news...");
  console.log("");

  const latestNews = await executeCurrentsTool(
    "CURRENTS_API_ACTIVITIES_LIST",
    {
      language: "en",
      page_number: 1,
      page_size: 5,
    },
  );

  console.log(JSON.stringify(latestNews, null, 2));

  console.log("");
  console.log("----------------------------------------------");
  console.log("Testing news search...");
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

  console.log(JSON.stringify(searchNews, null, 2));

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