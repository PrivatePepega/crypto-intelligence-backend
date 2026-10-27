import {
  normalizeStockProfile,
  normalizeStockQuote,
  normalizeStockHistory,
  mergeStockHistories,
  buildQuoteSnapshotKey,
  buildQuoteSnapshotData,
  parseProviderDate,
  providerDateToTimestamp,
  unixSecondsToIso,
  normalizeCurrency,
} from "../services/stocks/fmpStockNormalizer.js";
import type { StockIdentity, StockProfile, StockQuote, StockHistory } from "../types/stocks/stock.types.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const throws = (work: () => unknown): boolean => {
  try {
    work();
    return false;
  } catch {
    return true;
  }
};

// --------------------------------------------------
// Fixtures
// --------------------------------------------------

const MOCK_IDENTITY: StockIdentity = {
  assetId: "test-asset-id",
  ticker: "AAPL",
  companyName: "Apple Inc.",
  exchange: "NASDAQ",
  cik: "0000320193",
  providerIds: {
    fmp: { symbol: "AAPL", cik: "0000320193", isin: "US0378331005", cusip: "037833100" },
  },
};

const FMP_PROFILE_AAPL = {
  symbol: "AAPL",
  price: 150.25,
  marketCap: 2_500_000_000_000,
  beta: 1.2,
  lastDividend: 0.88,
  range: "120.00-180.00",
  change: 2.5,
  changePercentage: 1.69,
  volume: 50_000_000,
  averageVolume: 55_000_000,
  companyName: "Apple Inc.",
  currency: "USD",
  cik: "0000320193",
  isin: "US0378331005",
  cusip: "037833100",
  exchangeFullName: "NASDAQ Global Select",
  exchange: "NASDAQ",
  industry: "Consumer Electronics",
  website: "https://www.apple.com",
  description: "Apple Inc. designs, manufactures, and markets smartphones...",
  ceo: "Tim Cook",
  sector: "Technology",
  country: "US",
  fullTimeEmployees: "164000",
  phone: "(408) 996-1010",
  address: "One Apple Park Way",
  city: "Cupertino",
  state: "CA",
  zip: "95014",
  image: "https://example.com/aapl.png",
  ipoDate: "1980-12-12",
  defaultImage: false,
  isEtf: false,
  isActivelyTrading: true,
  isAdr: false,
  isFund: false,
};

const FMP_PROFILE_ETF = {
  ...FMP_PROFILE_AAPL,
  symbol: "SPY",
  companyName: "SPDR S&P 500 ETF Trust",
  isEtf: true,
  isFund: false,
};

const FMP_QUOTE_AAPL = {
  symbol: "AAPL",
  name: "Apple Inc.",
  price: 150.25,
  changePercentage: 1.69,
  change: 2.5,
  volume: 50_000_000,
  dayLow: 148.00,
  dayHigh: 151.50,
  yearHigh: 180.00,
  yearLow: 120.00,
  marketCap: 2_500_000_000_000,
  priceAvg50: 145.00,
  priceAvg200: 140.00,
  exchange: "NASDAQ",
  open: 148.50,
  previousClose: 147.75,
  timestamp: Math.floor(Date.now() / 1000),
};

const FMP_QUOTE_BAD_SYMBOL = {
  ...FMP_QUOTE_AAPL,
  symbol: "GOOGL",
};

const FMP_EOD_ROWS = [
  {
    symbol: "AAPL",
    date: "2026-10-27",
    open: 148.5,
    high: 151.5,
    low: 147.8,
    close: 150.25,
    volume: 50_000_000,
    change: 2.5,
    changePercent: 1.69,
    vwap: 149.8,
  },
  {
    symbol: "AAPL",
    date: "2026-10-26",
    open: 146.0,
    high: 149.0,
    low: 145.5,
    close: 147.75,
    volume: 45_000_000,
    change: -1.2,
    changePercent: -0.8,
    vwap: 147.2,
  },
  {
    symbol: "AAPL",
    date: "2026-10-25",
    open: 147.0,
    high: 149.5,
    low: 146.0,
    close: 148.95,
    volume: 42_000_000,
    change: 1.95,
    changePercent: 1.33,
    vwap: 147.5,
  },
];

// --------------------------------------------------
// Date Helpers
// --------------------------------------------------

console.log("\n=== Date Helpers ===");

pass("parseProviderDate valid", parseProviderDate("2026-10-27") === "2026-10-27");
pass("parseProviderDate invalid format", parseProviderDate("27-10-2026") === null);
pass("parseProviderDate invalid month", parseProviderDate("2026-13-01") === null);
pass("parseProviderDate invalid day", parseProviderDate("2026-02-30") === null);
pass("parseProviderDate year bounds", parseProviderDate("1969-01-01") === null);
pass("parseProviderDate year bounds high", parseProviderDate("2101-01-01") === null);
pass("parseProviderDate non-string", parseProviderDate(12345) === null);

pass("providerDateToTimestamp", providerDateToTimestamp("2026-10-27") === "2026-10-27T00:00:00.000Z");
pass("providerDateToTimestamp throws on invalid", throws(() => providerDateToTimestamp("bad")));

pass("unixSecondsToIso valid", unixSecondsToIso(1700000000) === "2023-11-14T22:13:20.000Z");
pass("unixSecondsToIso too old", unixSecondsToIso(900000000) === null);
pass("unixSecondsToIso too new", unixSecondsToIso(5000000000) === null);
pass("unixSecondsToIso non-integer", unixSecondsToIso(1.5) === null);

pass("normalizeCurrency valid", normalizeCurrency("usd") === "USD");
pass("normalizeCurrency valid upper", normalizeCurrency("USD") === "USD");
pass("normalizeCurrency invalid length", normalizeCurrency("US") === null);
pass("normalizeCurrency non-alpha", normalizeCurrency("US1") === null);
pass("normalizeCurrency non-string", normalizeCurrency(123) === null);

// --------------------------------------------------
// Profile Normalization
// --------------------------------------------------

console.log("\n=== Profile Normalization ===");

const profileResult = normalizeStockProfile(FMP_PROFILE_AAPL, MOCK_IDENTITY, { collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockProfile ok", profileResult.ok === true);
if (profileResult.ok) {
  const p = profileResult.profile;
  pass("profile ticker", p.ticker === "AAPL");
  pass("profile companyName", p.companyName === "Apple Inc.");
  pass("profile exchange", p.exchange === "NASDAQ");
  pass("profile cik", p.cik === "0000320193");
  pass("profile isin", p.isin === "US0378331005");
  pass("profile cusip", p.cusip === "037833100");
  pass("profile sector", p.sector === "Technology");
  pass("profile industry", p.industry === "Consumer Electronics");
  pass("profile currency", p.currency === "USD");
  pass("profile isEtf false", p.isEtf === false);
  pass("profile isFund false", p.isFund === false);
  pass("profile isAdr false", p.isAdr === false);
  pass("profile isActivelyTrading true", p.isActivelyTrading === true);
  pass("profile ipoDate", p.ipoDate === "1980-12-12");
  pass("profile description length", p.description !== null && p.description.length > 10);
  pass("profile providerData preserved", p.providerData.symbol === "AAPL");
  pass("profile updatedAt set", p.updatedAt === "2026-10-27T12:00:00.000Z");
}

const etfResult = normalizeStockProfile(FMP_PROFILE_ETF, { ...MOCK_IDENTITY, ticker: "SPY" }, { collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockProfile rejects ETF", etfResult.ok === false);
pass("ETF rejection reason", etfResult.ok === false && etfResult.reason.includes("ETF"));

// Missing optional fields - should still work with defaults
const profileMinimal = { symbol: "TEST", companyName: "Test Co", price: 100 };
const minimalResult = normalizeStockProfile(profileMinimal, MOCK_IDENTITY, { collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockProfile handles minimal", minimalResult.ok === true);
if (minimalResult.ok) {
  // ticker comes from identity (canonical), not provider
  pass("minimal profile has symbol", minimalResult.profile.ticker === "AAPL");
  // companyName comes from provider when available
  pass("minimal profile has companyName", minimalResult.profile.companyName === "Test Co");
  // exchange falls back to identity since provider has none
  pass("minimal profile exchange from identity", minimalResult.profile.exchange === "NASDAQ");
}

// --------------------------------------------------
// Quote Normalization
// --------------------------------------------------

console.log("\n=== Quote Normalization ===");

const quoteResult = normalizeStockQuote(FMP_QUOTE_AAPL, { symbol: "AAPL", currency: "USD", collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockQuote ok", quoteResult.ok === true);
if (quoteResult.ok) {
  const q = quoteResult.quote;
  pass("quote symbol", q.symbol === "AAPL");
  pass("quote providerSymbol", q.providerSymbol === "AAPL");
  pass("quote price", q.price === 150.25);
  pass("quote change", q.change === 2.5);
  pass("quote changePercent", q.changePercent === 1.69);
  pass("quote volume", q.volume === 50_000_000);
  pass("quote currency", q.currency === "USD");
  pass("quote exchange", q.exchange === "NASDAQ");
  pass("quote observedAt is ISO", q.observedAt !== null && q.observedAt!.includes("T"));
  pass("quote collectedAt set", q.collectedAt === "2026-10-27T12:00:00.000Z");
  pass("quote providerRaw preserved", q.providerRaw.symbol === "AAPL");
}

const badSymbolResult = normalizeStockQuote(FMP_QUOTE_BAD_SYMBOL, { symbol: "AAPL", currency: "USD", collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockQuote rejects symbol mismatch", badSymbolResult.ok === false);

const noPriceResult = normalizeStockQuote({ ...FMP_QUOTE_AAPL, price: null }, { symbol: "AAPL", currency: "USD", collectedAt: "2026-10-27T12:00:00.000Z" });
pass("normalizeStockQuote rejects no price", noPriceResult.ok === false);

// --------------------------------------------------
// History Normalization
// --------------------------------------------------

console.log("\n=== History Normalization ===");

const historyResult = normalizeStockHistory(FMP_EOD_ROWS, {
  symbol: "AAPL",
  fetchedAt: "2026-10-27T12:00:00.000Z",
  requested: { from: "2026-10-25", to: "2026-10-27" },
});

pass("normalizeStockHistory ok", historyResult.candles.length === 3);
pass("history candles sorted oldest-first", historyResult.candles[0]?.date === "2026-10-25");
pass("history last candle", historyResult.candles[2]?.date === "2026-10-27");
pass("history timestamps", historyResult.candles.every((c) => c.timestamp.endsWith("T00:00:00.000Z")));
pass("history OHLC preserved", historyResult.candles[0].open === 147.0 && historyResult.candles[0].close === 148.95);
pass("history volume", historyResult.candles[0].volume === 42_000_000);
pass("history rejected empty", historyResult.rejected.length === 0);
pass("history duplicatesRemoved", historyResult.duplicatesRemoved === 0);

// Test duplicate handling
const duplicateRows = [...FMP_EOD_ROWS, { ...FMP_EOD_ROWS[0], volume: 51_000_000 }];
const dupResult = normalizeStockHistory(duplicateRows, {
  symbol: "AAPL",
  fetchedAt: "2026-10-27T12:00:00.000Z",
  requested: { from: "2026-10-25", to: "2026-10-27" },
});
pass("normalizeStockHistory deduplicates", dupResult.candles.length === 3);
pass("normalizeStockHistory counts duplicates", dupResult.duplicatesRemoved === 1);

// Test rejection
const badRows = [{ ...FMP_EOD_ROWS[0], date: "invalid", high: 100, low: 200 }]; // high < low
const rejectResult = normalizeStockHistory(badRows, {
  symbol: "AAPL",
  fetchedAt: "2026-10-27T12:00:00.000Z",
  requested: { from: "2026-10-25", to: "2026-10-27" },
});
pass("normalizeStockQuote rejects OHLC violation", rejectResult.rejected.length === 1);

// --------------------------------------------------
// History Merge
// --------------------------------------------------

console.log("\n=== History Merge ===");

const h1 = normalizeStockHistory(FMP_EOD_ROWS.slice(0, 2), {
  symbol: "AAPL",
  fetchedAt: "2026-10-27T12:00:00.000Z",
  requested: { from: "2026-10-25", to: "2026-10-26" },
});

const h2 = normalizeStockHistory(FMP_EOD_ROWS.slice(1), {
  symbol: "AAPL",
  fetchedAt: "2026-10-27T12:00:00.000Z",
  requested: { from: "2026-10-26", to: "2026-10-27" },
});

const merged = mergeStockHistories("AAPL", "2026-10-27T12:00:00.000Z", { from: "2026-10-25", to: "2026-10-27" }, [h1, h2]);
pass("mergeStockHistories combines", merged.candles.length === 3);
pass("mergeStockHistories deduplicates overlap", merged.duplicatesRemoved === 1);
pass("mergeStockHistories sorted", merged.candles[0].date === "2026-10-25");

// --------------------------------------------------
// Snapshot Key & Data
// --------------------------------------------------

console.log("\n=== Snapshot Key & Data ===");

if (quoteResult.ok) {
  const key = buildQuoteSnapshotKey(quoteResult.quote);
  pass("buildQuoteSnapshotKey format", key.startsWith("fmp:AAPL:"));
  pass("buildQuoteSnapshotKey contains timestamp", key.includes("2026"));

  const data = buildQuoteSnapshotData(quoteResult.quote);
  pass("buildQuoteSnapshotData has snapshotKey", data.snapshotKey === key);
  pass("buildQuoteSnapshotData has price", data.price === 150.25);
  pass("buildQuoteSnapshotData has limitations", Array.isArray(data.limitations) && data.limitations.length === 3);
}

// --------------------------------------------------
// Summary
// --------------------------------------------------

console.log(`\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`);
if (failures > 0) {
  process.exitCode = 1;
}