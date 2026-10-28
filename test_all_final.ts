import fs from "fs";

async function testAllStockEndpoints() {
  // Test POST
  console.log("Testing POST /api-v1/stocks/intelligence...");
  const postResponse = await fetch("http://localhost:5000/api-v1/stocks/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "MSFT",
      refresh: false,
      include: ["profile", "quote", "history"],
      readOnly: false
    })
  });
  const postData = await postResponse.json();
  fs.writeFileSync("collectors/assets/data/stocks_intelligence_POST_MSFT.json", JSON.stringify(postData, null, 2));
  console.log("POST Status:", postResponse.status, "- Has profile:", !!postData.profile, "- Candles:", postData.history?.candles?.length);

  // Test GET
  console.log("\nTesting GET /api-v1/stocks/intelligence/MSFT...");
  const getResponse = await fetch("http://localhost:5000/api-v1/stocks/intelligence/MSFT?refresh=false&include=profile,quote,history&readOnly=false");
  const getData = await getResponse.json();
  fs.writeFileSync("collectors/assets/data/stocks_intelligence_GET_MSFT.json", JSON.stringify(getData, null, 2));
  console.log("GET Status:", getResponse.status, "- Has profile:", !!getData.profile, "- Candles:", getData.history?.candles?.length);

  // Test Search
  console.log("\nTesting GET /api-v1/stocks/search...");
  const searchResponse = await fetch("http://localhost:5000/api-v1/stocks/search?query=MSFT&limit=10");
  const searchData = await searchResponse.json();
  fs.writeFileSync("collectors/assets/data/stocks_search_MSFT.json", JSON.stringify(searchData, null, 2));
  console.log("SEARCH Status:", searchResponse.status, "- Count:", searchData.count);

  console.log("\n✅ All stock endpoints verified and saved to collectors/assets/data/");
}

testAllStockEndpoints();