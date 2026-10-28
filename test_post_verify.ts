import fs from "fs";

async function testPostIntelligence() {
  console.log("Testing POST /api-v1/stocks/intelligence...");
  const response = await fetch("http://localhost:5000/api-v1/stocks/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "MSFT",
      refresh: false,
      include: ["profile", "quote", "history"],
      readOnly: false
    })
  });
  const data = await response.json();
  console.log("Status:", response.status);
  fs.writeFileSync("collectors/assets/data/stocks_intelligence_POST_MSFT.json", JSON.stringify(data, null, 2));
  console.log("Has profile:", !!data.profile);
  console.log("Has quote:", !!data.quote);
  console.log("Has history:", !!data.history);
  console.log("Candles count:", data.history?.candles?.length || 0);
}

testPostIntelligence();