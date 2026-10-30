import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeCoinTickers } from "../collectors/assets/crypto/coingeckoFetchers.js";
import {
  mapSecExchangeToTradingView,
  normalizeSecCompanyTickers,
} from "../collectors/assets/tickers/stockTicker.js";
import {
  readTickerFile,
  selectTradingViewPair,
  writeTickerFile,
} from "../collectors/assets/tickers/cryptoTicker.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// --------------------------------------------------
// SEC stock tickers
// --------------------------------------------------

const sec = normalizeSecCompanyTickers({
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [320193, "Apple Inc.", "AAPL", "Nasdaq"],
    [1276187, "Energy Transfer LP", "ET", "TXSE"],
    [887028, "Rio Tinto Ltd", "RTNTF", "OTC"],
    [1, "No Exchange Corp", "NEX", null],
    [null, "Broken Cik", "BRK", "NYSE"],
    [2, "Missing Ticker", "", "NYSE"],
  ],
});

pass("SEC normalizer keeps valid rows", Object.keys(sec).length === 4);
pass("SEC normalizer keys rows by position", sec["0"]?.ticker === "AAPL");
pass("SEC normalizer maps Nasdaq", sec["0"]?.tradingViewExchange === "NASDAQ");
pass("SEC normalizer keeps the SEC exchange label", sec["0"]?.exchange === "Nasdaq");
pass("SEC normalizer maps TXSE to null", sec["1"]?.tradingViewExchange === null);
pass("SEC normalizer maps OTC", sec["2"]?.tradingViewExchange === "OTC");
pass("SEC normalizer keeps missing exchange as null", sec["3"]?.exchange === null);
pass(
  "SEC exchange mapper is case-sensitive to SEC labels",
  mapSecExchangeToTradingView("nasdaq") === null,
);

// --------------------------------------------------
// CoinGecko ticker normalization
// --------------------------------------------------

const normalized = normalizeCoinTickers({
  tickers: [
    {
      base: "BTC",
      target: "USDT",
      market: { identifier: "binance", name: "Binance" },
      converted_volume: { usd: 2596861719 },
      trust_score: "green",
      last_traded_at: "2026-10-30T19:31:59+00:00",
      trade_url: "https://www.binance.com/en/trade/BTC_USDT",
      is_anomaly: false,
      is_stale: false,
    },
    { base: "BTC", target: "USD", market: { identifier: "kraken" } },
    { target: "USDT", market: { identifier: "binance" } },
    { base: "BTC", market: { identifier: "binance" } },
    { base: "BTC", target: "USDT" },
  ],
});

pass("ticker normalizer keeps rows with market/base/target", normalized.length === 2);
pass("ticker normalizer reads converted USD volume", normalized[0]?.volumeUsd === 2596861719);
pass("ticker normalizer reads trust score", normalized[0]?.trustScore === "green");
pass(
  "ticker normalizer normalizes last_traded_at",
  normalized[0]?.lastTradedAt === "2026-10-30T19:31:59.000Z",
);
pass("ticker normalizer defaults exchange name to id", normalized[1]?.exchangeName === "kraken");
pass("ticker normalizer keeps missing volume as null", normalized[1]?.volumeUsd === null);

// --------------------------------------------------
// Pair selection
// --------------------------------------------------

const priorityTickers = normalizeCoinTickers({
  tickers: [
    {
      base: "ABC",
      target: "USD",
      market: { identifier: "bitstamp" },
      converted_volume: { usd: 1_000_000 },
    },
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 10 },
    },
    {
      base: "ABC",
      target: "USD",
      market: { identifier: "gdax" },
      converted_volume: { usd: 5 },
    },
  ],
});

pass(
  "pair selection prefers the higher-priority exchange",
  selectTradingViewPair(priorityTickers)?.exchange === "BINANCE",
);

const targetTickers = normalizeCoinTickers({
  tickers: [
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 9_000 },
    },
    {
      base: "ABC",
      target: "USD",
      market: { identifier: "binance" },
      converted_volume: { usd: 1 },
    },
  ],
});

pass(
  "pair selection prefers USD over USDT on the same exchange",
  selectTradingViewPair(targetTickers)?.pair === "ABC/USD",
);

const volumeTickers = normalizeCoinTickers({
  tickers: [
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 100 },
      trade_url: "low-volume",
    },
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 200 },
      trade_url: "high-volume",
    },
  ],
});

pass(
  "pair selection breaks ties by USD volume",
  selectTradingViewPair(volumeTickers)?.tradeUrl === "high-volume",
);

const riskyTickers = normalizeCoinTickers({
  tickers: [
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 10 },
      is_anomaly: true,
    },
    {
      base: "ABC",
      target: "USDT",
      market: { identifier: "binance" },
      converted_volume: { usd: 10 },
      is_stale: true,
    },
  ],
});

pass(
  "pair selection ignores anomalous and stale rows",
  selectTradingViewPair(riskyTickers) === null,
);

const krakenTickers = normalizeCoinTickers({
  tickers: [
    {
      base: "XBT",
      target: "USD",
      market: { identifier: "kraken", name: "Kraken" },
      trade_url: "https://www.kraken.com/xbtusd",
    },
  ],
});

const krakenPair = selectTradingViewPair(krakenTickers);
pass("pair selection normalizes Kraken XBT to BTC", krakenPair?.pair === "BTC/USD");
pass(
  "pair selection builds the TradingView symbol",
  krakenPair?.tradingViewSymbol === "KRAKEN:BTCUSD",
);

const unsupportedTickers = normalizeCoinTickers({
  tickers: [
    { base: "ABC", target: "USDT", market: { identifier: "xt" } },
    { base: "ABC", target: "USDC", market: { identifier: "binance" } },
  ],
});

pass(
  "pair selection returns null without a supported USD/USDT pair",
  selectTradingViewPair(unsupportedTickers) === null,
);

// --------------------------------------------------
// File round trip
// --------------------------------------------------

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "crypto-tickers-test-"));
const filePath = path.join(directory, "crypto-tickers.json");

const written = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    pair: "BTC/USDT",
    exchange: "BINANCE",
    tradingViewSymbol: "BINANCE:BTCUSDT",
    tradeUrl: "https://example.com/btc",
    updatedAt: "2026-10-30T00:00:00.000Z",
  },
  {
    id: "no-pair",
    symbol: "nop",
    name: "No Pair",
    pair: null,
    exchange: null,
    tradingViewSymbol: null,
    tradeUrl: null,
    updatedAt: "2026-10-30T00:00:00.000Z",
  },
  {
    id: "untouched",
    symbol: "unt",
    name: "Untouched",
  },
];

await writeTickerFile(filePath, written);
const readBack = await readTickerFile(filePath);

pass(
  "ticker file round-trips enriched entries",
  readBack[0]?.tradingViewSymbol === "BINANCE:BTCUSDT",
);
pass("ticker file keeps attempted-with-no-pair entries", readBack[1]?.exchange === null);
pass("ticker file keeps untouched entries unenriched", readBack[2]?.pair === undefined);

await fs.rm(directory, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll ticker enrichment assertions passed.");
}
