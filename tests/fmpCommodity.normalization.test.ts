import {
  buildDateWindows,
  parseSymbolList,
  resolveDateRange,
} from "../collectors/assets/commodities/fmpCommodityFetchers.js";
import {
  buildCommodityAssetInput,
  buildMarketSnapshotData,
  buildSnapshotKey,
  findListedCommodity,
  mergeCommodityHistories,
  normalizeCommodityHistory,
  normalizeCommodityList,
  normalizeCommodityQuote,
  normalizeCurrency,
  parseProviderDate,
  providerDateToTimestamp,
  unixSecondsToIso,
} from "../collectors/assets/commodities/fmpCommodityNormalizer.js";
import {
  findCommodityReference,
  DEFAULT_COMMODITY_SYMBOLS,
  WTI_SYMBOL,
} from "../collectors/assets/commodities/commodityReference.js";
import {
  classifyFmpStatus,
  isRetryableFmpFailure,
  readFmpErrorMessage,
  redactFmpUrl,
  setFmpRequestBudget,
  setFmpRequestsPerMinute,
} from "../collectors/assets/commodities/fmpClient.js";
import type { CommodityIdentity } from "../types/FMP/fmpCommodity.types.js";

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
// Fixtures taken from live responses on 2026-10-27
// --------------------------------------------------

const GOLD_LIST_ROW = {
  symbol: "GCUSD",
  name: "Gold Futures",
  exchange: null,
  tradeMonth: "Dec",
  currency: "USD",
};

const GOLD_QUOTE = {
  symbol: "GCUSD",
  name: "Gold Futures",
  price: 4072.5,
  changePercentage: 0.84439,
  change: 34.1,
  volume: 116759,
  dayLow: 4001.6,
  dayHigh: 4078.9,
  yearHigh: 5626.8,
  yearLow: 3901.3,
  marketCap: null,
  priceAvg50: 4333.19,
  priceAvg200: 4490.37,
  exchange: "COMMODITY",
  open: 4032.8,
  previousClose: 4038.4,
  timestamp: 1793120090,
};

const GOLD_EOD_ROWS = [
  {
    symbol: "GCUSD",
    date: "2026-10-27",
    open: 4032.8,
    high: 4078.9,
    low: 4001.6,
    close: 4075.1,
    volume: 116545,
    change: 42.3,
    changePercent: 1.0489,
    vwap: 4051.87,
  },
  {
    symbol: "GCUSD",
    date: "2026-10-26",
    open: 4038.4,
    high: 4050.2,
    low: 3990.1,
    close: 4032.8,
    volume: 110233,
    change: -12.5,
    changePercent: -0.31,
    vwap: 4021.4,
  },
];

const COLLECTED_AT = "2026-10-27T17:00:00.000Z";

// --------------------------------------------------
// Provider date handling
// --------------------------------------------------

pass("valid date passes", parseProviderDate("2026-10-27") === "2026-10-27");
pass("leap day passes", parseProviderDate("2024-02-29") === "2024-02-29");
pass("non-leap leap day fails", parseProviderDate("2025-02-29") === null);
pass("impossible month fails", parseProviderDate("2026-13-01") === null);
pass("impossible day fails", parseProviderDate("2026-04-31") === null);
pass("short date fails", parseProviderDate("2026-10-1") === null);
pass("timestamp string fails", parseProviderDate("2026-10-27T00:00:00Z") === null);
pass("number fails", parseProviderDate(20261027) === null);
pass("null fails", parseProviderDate(null) === null);
pass("year below range fails", parseProviderDate("1969-12-31") === null);

pass(
  "date converts to UTC midnight",
  providerDateToTimestamp("2026-10-27") === "2026-10-27T00:00:00.000Z",
);
pass(
  "invalid date cannot convert",
  throws(() => providerDateToTimestamp("2026-10-32")),
);

pass("unix seconds convert to ISO", unixSecondsToIso(1793120090) === "2026-10-27T16:54:50.000Z");
pass("epoch zero is implausible", unixSecondsToIso(0) === null);
pass("fractional seconds are rejected", unixSecondsToIso(1793120090.5) === null);
pass("string timestamp is rejected", unixSecondsToIso("1793120090") === null);
pass("null timestamp is rejected", unixSecondsToIso(null) === null);

pass("currency uppercases", normalizeCurrency("usd") === "USD");
pass("short currency is rejected", normalizeCurrency("US") === null);
pass("long currency is rejected", normalizeCurrency("USDX") === null);
pass("numeric currency is rejected", normalizeCurrency(840) === null);

// --------------------------------------------------
// Commodity list
// --------------------------------------------------

const listSnapshot = normalizeCommodityList(
  [
    GOLD_LIST_ROW,
    { symbol: "SIUSD", name: "Silver Futures", exchange: null, tradeMonth: null, currency: "USD" },
    { name: "Missing symbol" },
    { symbol: "   " },
    { symbol: "GCUSD", name: "Duplicate gold" },
    "junk",
  ],
  { endpoint: "/commodities-list", fetchedAt: COLLECTED_AT },
);

pass(
  "list keeps valid rows",
  listSnapshot.commodities.length === 2,
  `${listSnapshot.commodities.length}`,
);
pass(
  "list counts rejected rows",
  listSnapshot.rejected_rows === 4,
  `${listSnapshot.rejected_rows}`,
);
pass("list keeps provider", listSnapshot.provider === "fmp");
pass("list keeps endpoint", listSnapshot.endpoint === "/commodities-list");
pass("list keeps fetch time", listSnapshot.fetched_at === COLLECTED_AT);
pass(
  "list deduplicates symbols",
  listSnapshot.commodities.filter((row) => row.symbol === "GCUSD").length === 1,
);
pass("list keeps provider name", listSnapshot.commodities[0]?.provider_name === "Gold Futures");
pass("list keeps trade month", listSnapshot.commodities[0]?.trade_month === "Dec");
pass("list keeps currency", listSnapshot.commodities[0]?.currency === "USD");
pass("list leaves null exchange null", listSnapshot.commodities[0]?.exchange === null);

const missingList = normalizeCommodityList(
  { not: "an array" },
  {
    endpoint: "/commodities-list",
    fetchedAt: COLLECTED_AT,
  },
);
pass("non-array list is empty", missingList.commodities.length === 0);
pass("non-array list is flagged", missingList.rejected_rows === 1);

pass("find is case-insensitive", findListedCommodity(listSnapshot, "gcusd")?.symbol === "GCUSD");
pass("find returns null for absent symbol", findListedCommodity(listSnapshot, "CLUSD") === null);

// --------------------------------------------------
// Quote
// --------------------------------------------------

const quoteResult = normalizeCommodityQuote(GOLD_QUOTE, {
  symbol: "GCUSD",
  currency: "usd",
  collectedAt: COLLECTED_AT,
});

if (!quoteResult.ok) {
  pass("quote normalizes", false, quoteResult.reason);
} else {
  const quote = quoteResult.quote;
  pass("quote normalizes", true);
  pass("quote keeps provider symbol", quote.provider_symbol === "GCUSD");
  pass("quote keeps requested symbol", quote.symbol === "GCUSD");
  pass("quote keeps price", quote.price === 4072.5);
  pass("quote keeps volume", quote.volume === 116759);
  pass("quote keeps change percent", quote.change_percent === 0.84439);
  pass("quote keeps previous close", quote.previous_close === 4038.4);
  pass("quote keeps year high", quote.year_high === 5626.8);
  pass("quote keeps exchange", quote.exchange === "COMMODITY");
  pass("quote normalizes currency", quote.currency === "USD");
  pass("quote parses provider timestamp", quote.observed_at === "2026-10-27T16:54:50.000Z");
  pass("quote keeps collection time", quote.collected_at === COLLECTED_AT);
  pass("quote keeps null market cap", quote.market_cap === null);
  pass("quote has no raw field", !("raw" in quote));

  const snapshotKey = buildSnapshotKey(quote);
  pass("snapshot key is stable", snapshotKey === buildSnapshotKey(quote));
  pass("snapshot key includes symbol", snapshotKey.includes("GCUSD"));
  pass("snapshot key includes observation", snapshotKey.includes("2026-10-27T16:54:50.000Z"));

  const snapshotData = buildMarketSnapshotData(quote);
  pass("snapshot data keeps provider", snapshotData["provider"] === "fmp");
  pass("snapshot data keeps provider symbol", snapshotData["provider_symbol"] === "GCUSD");
  pass("snapshot data keeps price", snapshotData["price"] === 4072.5);
  pass("snapshot data keeps currency", snapshotData["currency"] === "USD");
  pass("snapshot data keeps observed time", snapshotData["observed_at"] === quote.observed_at);
  pass("snapshot data keeps collected time", snapshotData["collected_at"] === COLLECTED_AT);
  pass("snapshot data keys the insert", snapshotData["snapshot_key"] === snapshotKey);
  pass("snapshot data documents volume", snapshotData["volume_unit"] === null);
  pass(
    "snapshot data carries limitations",
    Array.isArray(snapshotData["limitations"]) &&
      (snapshotData["limitations"] as unknown[]).length >= 2,
  );
}

const noVolume = normalizeCommodityQuote(
  { ...GOLD_QUOTE, volume: null },
  { symbol: "GCUSD", currency: "USD", collectedAt: COLLECTED_AT },
);
pass("null volume stays null", noVolume.ok && noVolume.quote.volume === null);

const missingVolume = normalizeCommodityQuote(
  { symbol: "GCUSD", price: 10 },
  { symbol: "GCUSD", currency: null, collectedAt: COLLECTED_AT },
);
pass("absent volume is null, not zero", missingVolume.ok && missingVolume.quote.volume === null);
pass(
  "absent optional fields stay null",
  missingVolume.ok &&
    missingVolume.quote.change === null &&
    missingVolume.quote.day_high === null &&
    missingVolume.quote.observed_at === null,
);
pass(
  "missing provider timestamp does not borrow collected_at",
  missingVolume.ok && missingVolume.quote.observed_at === null,
);

const noPrice = normalizeCommodityQuote(
  { symbol: "GCUSD", price: null },
  { symbol: "GCUSD", currency: "USD", collectedAt: COLLECTED_AT },
);
pass("quote without price is rejected", !noPrice.ok);
if (!noPrice.ok) {
  pass("rejection explains the missing price", noPrice.reason.includes("price"));
}

const wrongSymbol = normalizeCommodityQuote(GOLD_QUOTE, {
  symbol: "SIUSD",
  currency: "USD",
  collectedAt: COLLECTED_AT,
});
pass("symbol mismatch is rejected", !wrongSymbol.ok);
if (!wrongSymbol.ok) {
  pass(
    "mismatch names both symbols",
    wrongSymbol.reason.includes("GCUSD") && wrongSymbol.reason.includes("SIUSD"),
  );
}

const invalidRow = normalizeCommodityQuote(
  { price: 1 },
  {
    symbol: "GCUSD",
    currency: "USD",
    collectedAt: COLLECTED_AT,
  },
);
pass("row without symbol is rejected", !invalidRow.ok);

// WTI famously settled at -37.63 on 2020-04-20. Negative prices must survive.
const negativePrice = normalizeCommodityQuote(
  {
    symbol: "CLUSD",
    name: "Crude Oil",
    price: -37.63,
    volume: 0,
    timestamp: 1587398400,
  },
  { symbol: "CLUSD", currency: "USD", collectedAt: COLLECTED_AT },
);
pass("negative price is preserved", negativePrice.ok && negativePrice.quote.price === -37.63);
pass("zero volume is preserved as zero", negativePrice.ok && negativePrice.quote.volume === 0);

const negativeVolume = normalizeCommodityQuote(
  { ...GOLD_QUOTE, volume: -5 },
  { symbol: "GCUSD", currency: "USD", collectedAt: COLLECTED_AT },
);
pass("negative volume is nulled", negativeVolume.ok && negativeVolume.quote.volume === null);

// --------------------------------------------------
// Historical OHLC
// --------------------------------------------------

const history = normalizeCommodityHistory(GOLD_EOD_ROWS, {
  symbol: "GCUSD",
  fetchedAt: COLLECTED_AT,
  requested: { from: "2026-10-26", to: "2026-10-27" },
});

pass("history keeps rows", history.candles.length === 2);
pass("history sorts oldest first", history.candles[0]?.date === "2026-10-26");
pass("history keeps newest last", history.candles[1]?.date === "2026-10-27");
pass("history sets interval", history.interval === "1d");
pass("history keeps provider", history.provider === "fmp");
pass("history keeps requested range", history.requested.from === "2026-10-26");
pass("history stamps candles", history.candles[1]?.timestamp === "2026-10-27T00:00:00.000Z");
pass(
  "history keeps OHLC",
  history.candles[1]?.open === 4032.8 && history.candles[1]?.close === 4075.1,
);
pass("history keeps volume", history.candles[1]?.volume === 116545);
pass("history keeps vwap", history.candles[1]?.vwap === 4051.87);
pass("history keeps change", history.candles[1]?.change === 42.3);
pass("history has no rejections", history.rejected.length === 0);
pass("history has no duplicates", history.duplicates_removed === 0);

const weekend = normalizeCommodityHistory([], {
  symbol: "GCUSD",
  fetchedAt: COLLECTED_AT,
  requested: { from: "2026-10-24", to: "2026-10-25" },
});
pass(
  "empty history is not an error",
  weekend.candles.length === 0 && weekend.rejected.length === 0,
);

const duplicated = normalizeCommodityHistory([GOLD_EOD_ROWS[0], GOLD_EOD_ROWS[0]], {
  symbol: "GCUSD",
  fetchedAt: COLLECTED_AT,
  requested: { from: "2026-10-27", to: "2026-10-27" },
});
pass("duplicate dates are collapsed", duplicated.candles.length === 1);
pass("duplicate dates are counted", duplicated.duplicates_removed === 1);

const malformed = normalizeCommodityHistory(
  [
    { ...GOLD_EOD_ROWS[0], date: "2026-02-30" },
    { ...GOLD_EOD_ROWS[0], date: "2026-10-27", high: 10, low: 20, open: 15, close: 15 },
    { ...GOLD_EOD_ROWS[0], date: "2026-10-26", open: 9999 },
    { ...GOLD_EOD_ROWS[0], date: "2026-10-25", close: 1, high: 4078.9, low: 4001.6 },
    { ...GOLD_EOD_ROWS[0], symbol: "SIUSD" },
    "junk",
  ],
  { symbol: "GCUSD", fetchedAt: COLLECTED_AT, requested: { from: "2026-10-25", to: "2026-10-27" } },
);
pass("invalid candles are dropped", malformed.candles.length === 0);
pass(
  "every rejection is recorded",
  malformed.rejected.length === 6,
  `${malformed.rejected.length}`,
);
pass(
  "rejection reasons are specific",
  malformed.rejected.some((entry) => entry.reason === "invalid date") &&
    malformed.rejected.some((entry) => entry.reason === "high is below low") &&
    malformed.rejected.some((entry) => entry.reason.includes("open is outside")) &&
    malformed.rejected.some((entry) => entry.reason.includes("close is outside")) &&
    malformed.rejected.some((entry) => entry.reason.includes("belongs to symbol")),
);

const missingVolumeCandle = normalizeCommodityHistory(
  [{ symbol: "GCUSD", date: "2026-10-27", open: 1, high: 2, low: 1, close: 2 }],
  { symbol: "GCUSD", fetchedAt: COLLECTED_AT, requested: { from: null, to: null } },
);
pass("missing candle volume is null, not zero", missingVolumeCandle.candles[0]?.volume === null);

const negativeCandle = normalizeCommodityHistory(
  [
    {
      symbol: "CLUSD",
      date: "2020-04-20",
      open: 1.5,
      high: 2,
      low: -40.32,
      close: -37.63,
      volume: 1000,
    },
  ],
  { symbol: "CLUSD", fetchedAt: COLLECTED_AT, requested: { from: null, to: null } },
);
pass(
  "negative settlement is a valid candle",
  negativeCandle.candles.length === 1 && negativeCandle.candles[0]?.close === -37.63,
);

const nonArrayHistory = normalizeCommodityHistory(
  { message: "nope" },
  {
    symbol: "GCUSD",
    fetchedAt: COLLECTED_AT,
    requested: { from: null, to: null },
  },
);
pass("non-array history is flagged", nonArrayHistory.rejected.length === 1);
pass("non-array history has no candles", nonArrayHistory.candles.length === 0);

const merged = mergeCommodityHistories(
  "GCUSD",
  COLLECTED_AT,
  { from: "2026-10-26", to: "2026-10-27" },
  [
    normalizeCommodityHistory([GOLD_EOD_ROWS[1]], {
      symbol: "GCUSD",
      fetchedAt: COLLECTED_AT,
      requested: { from: "2026-10-26", to: "2026-10-26" },
    }),
    normalizeCommodityHistory([GOLD_EOD_ROWS[0], GOLD_EOD_ROWS[1]], {
      symbol: "GCUSD",
      fetchedAt: COLLECTED_AT,
      requested: { from: "2026-10-26", to: "2026-10-27" },
    }),
  ],
);
pass("merge keeps unique dates", merged.candles.length === 2);
pass("merge counts overlaps", merged.duplicates_removed === 1);
pass("merge keeps ascending order", merged.candles[0]?.date === "2026-10-26");

// --------------------------------------------------
// Asset input
// --------------------------------------------------

const identity: CommodityIdentity = {
  provider: "fmp",
  symbol: "GCUSD",
  provider_name: "Gold Futures",
  exchange: null,
  trade_month: "Dec",
  currency: "USD",
  listed_at: COLLECTED_AT,
};

const assetInput = buildCommodityAssetInput(identity);
pass("asset uses provider symbol", assetInput.symbol === "GCUSD");
pass("asset uses provider name", assetInput.name === "Gold Futures");
pass("asset keeps curated type", assetInput.commodity_type === "precious_metal");
pass("asset keeps curated benchmark", assetInput.benchmark === "COMEX gold");
pass("asset keeps provider currency", assetInput.currency === "USD");
pass("asset keeps provider symbol separately", assetInput.provider_symbol === "GCUSD");

const unknownIdentity: CommodityIdentity = {
  ...identity,
  symbol: "ZZUSD",
  provider_name: null,
  currency: null,
};
const unknownAsset = buildCommodityAssetInput(unknownIdentity);
pass("unknown symbol falls back to symbol as name", unknownAsset.name === "ZZUSD");
pass("unknown symbol has no invented type", unknownAsset.commodity_type === null);
pass("unknown symbol has no invented benchmark", unknownAsset.benchmark === null);

const noProviderName: CommodityIdentity = { ...identity, symbol: "BZUSD", provider_name: null };
pass(
  "missing provider name falls back to curated display name",
  buildCommodityAssetInput(noProviderName).name === "Brent Crude Oil",
);

// --------------------------------------------------
// Reference data
// --------------------------------------------------

pass("WTI symbol is CLUSD", WTI_SYMBOL === "CLUSD");
pass("aluminum uses the listed spelling", findCommodityReference("ALIUSD") !== null);
pass("there is no unlisted ALUUSD reference", findCommodityReference("ALUUSD") === null);
pass(
  "reference lookup is case-insensitive",
  findCommodityReference("gcusd")?.fmp_symbol === "GCUSD",
);
pass("default targets cover seven commodities", DEFAULT_COMMODITY_SYMBOLS.length === 7);
pass(
  "default targets include the task list",
  ["GCUSD", "SIUSD", "CLUSD", "BZUSD", "NGUSD", "HGUSD", "ALIUSD"].every((symbol) =>
    (DEFAULT_COMMODITY_SYMBOLS as readonly string[]).includes(symbol),
  ),
);
pass(
  "index future is classified separately",
  findCommodityReference("ESUSD")?.commodity_type === "equity_index_future",
);

// --------------------------------------------------
// Failure classification
// --------------------------------------------------

pass("200 is success", classifyFmpStatus(200) === null);
pass("402 is restricted", classifyFmpStatus(402) === "restricted");
pass("401 is unauthorized", classifyFmpStatus(401) === "unauthorized");
pass("403 is unauthorized", classifyFmpStatus(403) === "unauthorized");
pass("429 is rate limited", classifyFmpStatus(429) === "rate_limited");
pass("500 is an http error", classifyFmpStatus(500) === "http_error");
pass("404 is an http error", classifyFmpStatus(404) === "http_error");

pass("rate limits are retryable", isRetryableFmpFailure("rate_limited", 429));
pass("timeouts are retryable", isRetryableFmpFailure("timeout", null));
pass("network errors are retryable", isRetryableFmpFailure("network", null));
pass("server errors are retryable", isRetryableFmpFailure("http_error", 503));
pass("restricted is not retryable", !isRetryableFmpFailure("restricted", 402));
pass("client errors are not retryable", !isRetryableFmpFailure("http_error", 400));

pass(
  "plain text error is surfaced",
  readFmpErrorMessage("Premium Query Parameter: 'Special Endpoint : not available'") ===
    "Premium Query Parameter: 'Special Endpoint : not available'",
);
pass(
  "json error is surfaced",
  readFmpErrorMessage('{"Error Message":"Invalid API KEY"}') === "Invalid API KEY",
);
pass("empty error body is null", readFmpErrorMessage("   ") === null);
pass("long error body is truncated", (readFmpErrorMessage("x".repeat(900)) ?? "").length === 500);
pass(
  "whitespace in error is collapsed",
  readFmpErrorMessage("line one\n\nline two") === "line one line two",
);

pass(
  "api key is redacted from urls",
  redactFmpUrl("https://financialmodelingprep.com/stable/quote?symbol=GCUSD&apikey=SECRET") ===
    "https://financialmodelingprep.com/stable/quote?symbol=GCUSD&apikey=%3Credacted%3E",
);
pass(
  "urls without a key are preserved",
  redactFmpUrl("https://financialmodelingprep.com/stable/quote?symbol=GCUSD") ===
    "https://financialmodelingprep.com/stable/quote?symbol=GCUSD",
);
pass("unparseable urls are rejected", redactFmpUrl("not a url") === "(unparseable url)");

pass(
  "zero request rate is rejected",
  throws(() => setFmpRequestsPerMinute(0)),
);
pass(
  "negative request rate is rejected",
  throws(() => setFmpRequestsPerMinute(-1)),
);
pass("valid request rate is accepted", !throws(() => setFmpRequestsPerMinute(120)));
pass(
  "zero budget is rejected",
  throws(() => setFmpRequestBudget(0)),
);
pass(
  "fractional budget is rejected",
  throws(() => setFmpRequestBudget(1.5)),
);
pass("valid budget is accepted", !throws(() => setFmpRequestBudget(100)));

// --------------------------------------------------
// Date windows
// --------------------------------------------------

const exactWindows = buildDateWindows("2026-01-01", "2026-01-10", 5);
pass("windows split evenly", exactWindows.length === 2, `${exactWindows.length}`);
pass("first window starts at from", exactWindows[0]?.from === "2026-01-01");
pass("first window ends before the next", exactWindows[0]?.to === "2026-01-05");
pass("last window ends at to", exactWindows[1]?.to === "2026-01-10");
pass("windows are contiguous", exactWindows[1]?.from === "2026-01-06");

const raggedWindows = buildDateWindows("2026-01-01", "2026-01-07", 3);
pass("ragged range yields three windows", raggedWindows.length === 3);
pass("last ragged window is truncated", raggedWindows[2]?.to === "2026-01-07");

const singleDay = buildDateWindows("2026-10-27", "2026-10-27", 365);
pass("single day yields one window", singleDay.length === 1 && singleDay[0]?.from === "2026-10-27");

pass(
  "inverted window range is rejected",
  throws(() => buildDateWindows("2026-10-28", "2026-10-27", 30)),
);
pass(
  "zero chunk is rejected",
  throws(() => buildDateWindows("2026-01-01", "2026-01-02", 0)),
);
pass(
  "oversized chunk is rejected",
  throws(() => buildDateWindows("2026-01-01", "2026-01-02", 5_000)),
);

// --------------------------------------------------
// Ranges and symbols
// --------------------------------------------------

const defaultRange = resolveDateRange({
  from: null,
  to: null,
  days: 5,
  now: new Date("2026-10-27T12:00:00.000Z"),
});
pass("default range ends today", defaultRange.to === "2026-10-27");
pass("default range spans the requested days", defaultRange.from === "2026-10-23");

const explicitRange = resolveDateRange({
  from: "2024-01-01",
  to: "2024-12-31",
  days: 365,
  now: new Date("2026-10-27T12:00:00.000Z"),
});
pass(
  "explicit range is preserved",
  explicitRange.from === "2024-01-01" && explicitRange.to === "2024-12-31",
);

pass(
  "inverted explicit range is rejected",
  throws(() =>
    resolveDateRange({
      from: "2026-10-28",
      to: "2026-10-27",
      days: 1,
      now: new Date("2026-10-27T12:00:00.000Z"),
    }),
  ),
);
pass(
  "invalid to date is rejected",
  throws(() =>
    resolveDateRange({
      from: null,
      to: "2026-02-30",
      days: 1,
      now: new Date("2026-10-27T12:00:00.000Z"),
    }),
  ),
);
pass(
  "invalid from date is rejected",
  throws(() =>
    resolveDateRange({
      from: "2026-02-30",
      to: "2026-10-27",
      days: 1,
      now: new Date("2026-10-27T12:00:00.000Z"),
    }),
  ),
);

pass(
  "symbols are uppercased and deduplicated",
  JSON.stringify(parseSymbolList("gcusd, GCUSD, sIuSd", DEFAULT_COMMODITY_SYMBOLS)) ===
    JSON.stringify(["GCUSD", "SIUSD"]),
);
pass("symbols default to the curated targets", parseSymbolList(null, ["GCUSD"]).length === 1);
pass(
  "empty symbol list is rejected",
  throws(() => parseSymbolList("  ", [])),
);
pass(
  "junk symbol is rejected",
  throws(() => parseSymbolList("GC USD", [])),
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll FMP commodity normalization tests passed.");
}
