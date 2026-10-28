import fs from "fs";

async function testAllStockEndpoints() {
  console.log("Testing GET /api-v1/stocks/search?query=MSFT&limit=10...");
  const searchResponse = await fetch("http://localhost:5000/api-v1/stocks/search?query=MSFT&limit=10");
  const searchData = await searchResponse.json();
  fs.writeFileSync("collectors/assets/data/stocks_search_MSFT.json", JSON.stringify(searchData, null, 2));
  console.log("Search Status:", searchResponse.status, "- Count:", searchData.count || 0);

  console.log("\nTesting POST /api-v1/stocks/intelligence...");
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

  console.log("\nTesting GET /api-v1/stocks/intelligence/MSFT...");
  const getResponse = await fetch("http://localhost:5000/api-v1/stocks/intelligence/MSFT?refresh=false&include=profile,quote,history&readOnly=false");
  const getData = await getResponse.json();
  fs.writeFileSync("collectors/assets/data/stocks_intelligence_GET_MSFT.json", JSON.stringify(getData, null, 2));
  console.log("GET Status:", getResponse.status, "- Has profile:", !!getData.profile, "- Candles:", getData.history?.candles?.length);

  console.log("\n✅ All stock endpoints tested and saved to collectors/assets/data/");
}

testAllStockEndpoints();