import fs from "fs";

async function testCryptoSearch() {
  console.log("Testing /api-v1/crypto/search?q=DOGE&limit=10...");
  const response = await fetch("http://localhost:5000/api-v1/crypto/search?q=DOGE&limit=10");
  const data = await response.json();
  console.log("Status:", response.status);
  fs.writeFileSync("collectors/assets/data/crypto_search_DOGE.json", JSON.stringify(data, null, 2));
  console.log("Results count:", data.count || 0);
}

async function testCryptoIntelligence() {
  console.log("\nTesting /api-v1/crypto/intelligence POST...");
  const response = await fetch("http://localhost:5000/api-v1/crypto/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "DOGE",
      refresh: false,
      include: ["profile", "market_snapshot", "price_history"],
      readOnly: false
    })
  });
  const data = await response.json();
  console.log("Status:", response.status);
  fs.writeFileSync("collectors/assets/data/crypto_intelligence_DOGE.json", JSON.stringify(data, null, 2));
  console.log("Has profile:", !!data.profile);
  console.log("Has market_snapshot:", !!data.quote);
  console.log("Has price_history:", !!data.history);
  console.log("Candles count:", data.history?.candles?.length || 0);
}

async function testCryptoIntelligenceGet() {
  console.log("\nTesting /api-v1/crypto/intelligence/DOGE GET...");
  const response = await fetch("http://localhost:5000/api-v1/crypto/intelligence/DOGE?refresh=false&include=profile,market_snapshot,price_history&readOnly=false");
  const data = await response.json();
  console.log("Status:", response.status);
  fs.writeFileSync("collectors/assets/data/crypto_intelligence_GET_DOGE.json", JSON.stringify(data, null, 2));
  console.log("Has profile:", !!data.profile);
  console.log("Has market_snapshot:", !!data.quote);
  console.log("Has price_history:", !!data.history);
  console.log("Candles count:", data.history?.candles?.length || 0);
}

async function main() {
  try {
    await testCryptoSearch();
    await testCryptoIntelligence();
    await testCryptoIntelligenceGet();
    console.log("\n✅ All crypto endpoints tested!");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();