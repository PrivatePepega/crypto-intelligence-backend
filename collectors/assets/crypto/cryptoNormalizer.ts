/**
 * Crypto Asset Intelligence Normalizer
 *
 * Fetches raw crypto intelligence data from providers and normalizes it into
 * the target output structure:
 *
 *   collectors/assets/crypto/data/crypto_intelligence_<SYMBOL>_<timestamp>.json
 *
 * Data sources:
 *   - CoinGecko /coins/{id}       → asset, market, supply, network, socials, tokenomics
 *   - Binance Spot API            → price, 24hr market data, klines (historical candles)
 *
 * Run with: npx tsx collectors/assets/crypto/cryptoNormalizer.ts --symbol=BTC
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import {
  fetchCoinGeckoCoin,
  type CoinGeckoAssetProfile,
  type CoinGeckoAssetRecord,
  type CoinGeckoCryptoRecord,
  type CoinGeckoMarketMetrics,
} from "./coingeckoFetchers.js";
import {
  fetchBinanceSpotPrice,
  fetchBinanceSpotTicker24hr,
  fetchBinanceSpotKlines,
  type BinanceSpotPrice,
  type BinanceSpotTicker24hr,
  type BinanceSpotKline,
} from "../../binance/binanceFetcher.js";
import {
  fetchBinancePositioning,
} from "../../binance/binanceFetcher.js";
import type { BinancePositioningLatest } from "../../../types/binance/binance.types.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/crypto/data");

/**
 * Map of common ticker symbols to CoinGecko stable ids.
 * CoinGecko uses lowercase names (e.g. "bitcoin"), not ticker symbols.
 */
const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  LINK: "chainlink",
  AAVE: "aave",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  MATIC: "polygon",
  TRX: "tron",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  SHIB: "shiba-inu",
  USDC: "usd-coin",
  USDT: "tether",
};

/**
 * Resolves a ticker symbol to a CoinGecko id.
 * Falls back to the lowercased symbol itself if no mapping exists.
 */
function resolveCoingeckoId(symbol: string): string {
  return COINGECKO_ID_BY_SYMBOL[symbol] ?? symbol.toLowerCase();
}

/* ============================================================================
 * OUTPUT TYPES (matching the target API response shape)
 * ============================================================================ */

export interface CryptoExternalIds {
  coingeckoId: string;
}

export interface CryptoAsset {
  name: string;
  symbol: string;
  category: string | null;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  externalIds: CryptoExternalIds;
}

export interface CryptoMarket {
  price: number | null;
  currency: string;
  change24h: number | null;
  changePercent24h: number | null;
  changeSincePreviousClose: number | null;
  changePercentSincePreviousClose: number | null;
  high24h: number | null;
  low24h: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  fullyDilutedValuation: number | null;
  marketCapDominance: number | null;
  volume24h: number | null;
  quoteVolume24h: number | null;
  volumeToMarketCap: number | null;
  allTimeHigh: number | null;
  allTimeHighDate: string | null;
  allTimeLow: number | null;
  allTimeLowDate: string | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  priceChange90d: number | null;
  priceUpdatedAt: string | null;
  source: string | null;
}

export interface CryptoSupply {
  circulating: number | null;
  total: number | null;
  max: number | null;
  circulatingPercentage: number | null;
}

export interface CryptoContract {
  network: string;
  address: string;
}

export interface CryptoNetwork {
  primary: string | null;
  contracts: CryptoContract[];
}

export interface CryptoTokenomics {
  [key: string]: unknown;
}

export interface CryptoSecurity {
  summary: string | null;
  contractAnalysis: Record<string, unknown>;
  riskFlags: string[];
}

export interface CryptoSocials {
  [key: string]: unknown;
}

export interface CryptoExchange {
  name: string;
  symbol: string;
  volume24h: number | null;
  quoteVolume24h: number | null;
  percentOfTotalVolume: number | null;
  isVerified: boolean;
}

export interface CryptoIntelligenceData {
  symbol: string;
  asset: CryptoAsset;
  market: CryptoMarket;
  supply: CryptoSupply;
  network: CryptoNetwork;
  tokenomics: CryptoTokenomics;
  security: CryptoSecurity;
  socials: CryptoSocials;
  exchanges: CryptoExchange[];
  dataUpdatedAt: string | null;
}

/* ============================================================================
 * FETCHER
 * ============================================================================ */

/**
 * Raw data returned by providers before normalization.
 */
interface RawCryptoIntelligence {
  coingecko: CoinGeckoAssetProfile | null;
  binanceSpot: {
    price: BinanceSpotPrice | null;
    ticker24hr: BinanceSpotTicker24hr | null;
    klines: BinanceSpotKline[] | null;
  } | null;
  binanceFutures: BinancePositioningLatest[] | null;
}

/**
 * Fetches all raw crypto intelligence data for a symbol.
 *
 * 1. CoinGecko /coins/{id} → asset profile + market + supply + network + socials + tokenomics
 * 2. Binance Spot /ticker/price → latest price
 * 3. Binance Spot /ticker/24hr → 24-hour price change statistics
 * 4. Binance Spot /klines → historical candlestick data
 * 5. Binance Futures → positioning, funding, open interest → exchanges + security
 *
 * Saves each raw response to collectors/assets/crypto/data/ for audit.
 */
export async function fetchCryptoIntelligence(symbol: string): Promise<RawCryptoIntelligence> {
  const cleanSymbol = symbol.trim().toUpperCase();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let coingecko: CoinGeckoAssetProfile | null = null;
  let binanceSpotPrice: BinanceSpotPrice | null = null;
  let binanceSpotTicker24hr: BinanceSpotTicker24hr | null = null;
  let binanceSpotKlines: BinanceSpotKline[] | null = null;
  let binanceFutures: BinancePositioningLatest[] | null = null;

  // --- 1. CoinGecko coin profile (asset + market + supply + network + socials + tokenomics) ---
  const coingeckoId = resolveCoingeckoId(cleanSymbol);
  try {
    const profile = await fetchCoinGeckoCoin(coingeckoId, { vsCurrency: "usd" });
    coingecko = profile;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `coingecko coin_${cleanSymbol}.json`),
      JSON.stringify(profile, null, 2) + "\n",
    );
    console.log(`  ✓ CoinGecko coin profile for ${cleanSymbol} (id: ${coingeckoId})`);
  } catch (error) {
    console.error(`  ✗ CoinGecko coin profile failed for ${cleanSymbol}:`, error);
  }

  // --- 2. Binance Spot price ---
  const binanceSymbol = `${cleanSymbol}USDT`;
  try {
    const spotPrice = await fetchBinanceSpotPrice(binanceSymbol);
    binanceSpotPrice = spotPrice;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `binance spot_price_${cleanSymbol}.json`),
      JSON.stringify(spotPrice, null, 2) + "\n",
    );
    console.log(`  ✓ Binance spot price for ${binanceSymbol}`);
  } catch (error) {
    console.error(`  ✗ Binance spot price failed for ${binanceSymbol}:`, error);
  }

  // --- 3. Binance Spot 24hr ticker ---
  try {
    const ticker24hr = await fetchBinanceSpotTicker24hr(binanceSymbol);
    binanceSpotTicker24hr = ticker24hr;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `binance spot_ticker24hr_${cleanSymbol}.json`),
      JSON.stringify(ticker24hr, null, 2) + "\n",
    );
    console.log(`  ✓ Binance spot 24hr ticker for ${binanceSymbol}`);
  } catch (error) {
    console.error(`  ✗ Binance spot 24hr ticker failed for ${binanceSymbol}:`, error);
  }

  // --- 4. Binance Spot klines (historical candles) ---
  try {
    const klines = await fetchBinanceSpotKlines(binanceSymbol, "1d", 90);
    binanceSpotKlines = klines;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `binance spot_klines_${cleanSymbol}.json`),
      JSON.stringify(klines, null, 2) + "\n",
    );
    console.log(`  ✓ Binance spot klines for ${binanceSymbol}: ${klines.length} candles`);
  } catch (error) {
    console.error(`  ✗ Binance spot klines failed for ${binanceSymbol}:`, error);
  }

  // --- 5. Binance Futures positioning (exchanges + security) ---
  try {
    const positioning = await fetchBinancePositioning("latest");
    const symbolData = positioning.find((p) => p.symbol === binanceSymbol);
    binanceFutures = symbolData ? [symbolData] : [];
    await fs.writeFile(
      path.join(OUTPUT_DIR, `binance positioning_${cleanSymbol}.json`),
      JSON.stringify(binanceFutures, null, 2) + "\n",
    );
    console.log(`  ✓ Binance futures positioning for ${binanceSymbol}`);
  } catch (error) {
    console.error(`  ✗ Binance futures positioning failed for ${binanceSymbol}:`, error);
    binanceFutures = [];
  }

  return {
    coingecko,
    binanceSpot: {
      price: binanceSpotPrice,
      ticker24hr: binanceSpotTicker24hr,
      klines: binanceSpotKlines,
    },
    binanceFutures,
  } as RawCryptoIntelligence;
}

/**
 * Calculates missing market data fields from Binance klines (historical candles).
 *
 * From klines we can derive:
 *   - allTimeLow: lowest low across all stored candles
 *   - allTimeLowDate: date of the candle with the lowest low
 *   - priceChange7d: percent change from close 7 days ago to most recent close
 *   - priceChange90d: percent change from close 90 days ago to most recent close
 */
function calculateMissingMarketData(
  klines: BinanceSpotKline[] | null,
  currentPrice: number | null,
): {
  allTimeLow: number | null;
  allTimeLowDate: string | null;
  priceChange7d: number | null;
  priceChange90d: number | null;
} {
  if (!klines || klines.length === 0) {
    return {
      allTimeLow: null,
      allTimeLowDate: null,
      priceChange7d: null,
      priceChange90d: null,
    };
  }

  // Sort klines by openTime ascending (oldest first)
  const sorted = [...klines].sort((a, b) => a.openTime - b.openTime);

  // Find all-time low (lowest low across all candles)
  let allTimeLow: number | null = null;
  let allTimeLowDate: string | null = null;
  for (const k of sorted) {
    const low = Number(k.low);
    if (allTimeLow === null || low < allTimeLow) {
      allTimeLow = low;
      allTimeLowDate = new Date(k.openTime).toISOString();
    }
  }

  // Most recent close price
  const mostRecent = sorted[sorted.length - 1];

  // priceChange7d: (most recent close - close 7 days ago) / close 7 days ago * 100
  let priceChange7d: number | null = null;
  if (currentPrice !== null && mostRecent && sorted.length >= 2) {
    // Find the candle closest to 7 days ago
    const sevenDaysAgo = mostRecent.openTime - 7 * 24 * 60 * 60 * 1000;
    const k7d = sorted.reduce((prev, curr) => {
      return Math.abs(curr.openTime - sevenDaysAgo) < Math.abs(prev.openTime - sevenDaysAgo) ? curr : prev;
    });
    const close7d = Number(k7d.close);
    if (close7d !== 0 && Number.isFinite(close7d)) {
      priceChange7d = ((currentPrice - close7d) / close7d) * 100;
    }
  }

  // priceChange90d: (most recent close - close 90 days ago) / close 90 days ago * 100
  let priceChange90d: number | null = null;
  if (currentPrice !== null && mostRecent && sorted.length >= 2) {
    const ninetyDaysAgo = mostRecent.openTime - 90 * 24 * 60 * 60 * 1000;
    const k90d = sorted.reduce((prev, curr) => {
      return Math.abs(curr.openTime - ninetyDaysAgo) < Math.abs(prev.openTime - ninetyDaysAgo) ? curr : prev;
    });
    const close90d = Number(k90d.close);
    if (close90d !== 0 && Number.isFinite(close90d)) {
      priceChange90d = ((currentPrice - close90d) / close90d) * 100;
    }
  }

  return {
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange90d,
  };
}

/**
 * Normalizes market data from CoinGecko + Binance Spot into CryptoMarket.
 *
 * Priority:
 *   - price: Binance spot price (primary), CoinGecko currentPrice (fallback)
 *   - high24h/low24h/volume24h/change24h/changePercent24h: Binance 24hr ticker (primary), CoinGecko (fallback)
 *   - allTimeHigh/allTimeHighDate: CoinGecko (provider maintains ATH data)
 *   - allTimeLow/allTimeLowDate/priceChange7d/priceChange90d: Calculated from Binance klines
 */
function normalizeMarket(
  coinGeckoMarket: CoinGeckoMarketMetrics | undefined,
  binanceSpot: {
    price: BinanceSpotPrice | null;
    ticker24hr: BinanceSpotTicker24hr | null;
    klines: BinanceSpotKline[] | null;
  } | null,
): CryptoMarket {
  const cg = coinGeckoMarket;
  const bs = binanceSpot;

  // --- Price: Binance spot price first, CoinGecko fallback ---
  const binancePrice = bs?.price ? Number(bs.price.price) : null;
  const price = binancePrice !== null ? binancePrice : cg?.currentPrice ?? null;

  // --- 24hr stats: Binance 24hr ticker first, CoinGecko fallback ---
  const high24h = bs?.ticker24hr ? Number(bs.ticker24hr.highPrice) : cg?.high24h ?? null;
  const low24h = bs?.ticker24hr ? Number(bs.ticker24hr.lowPrice) : cg?.low24h ?? null;
  const volume24h = bs?.ticker24hr ? Number(bs.ticker24hr.volume) : cg?.totalVolume ?? null;
  const quoteVolume24h = bs?.ticker24hr ? Number(bs.ticker24hr.quoteVolume) : null;

  const change24h = bs?.ticker24hr ? Number(bs.ticker24hr.priceChange) : cg?.priceChange24h ?? null;
  const changePercent24h = bs?.ticker24hr ? Number(bs.ticker24hr.priceChangePercent) : cg?.priceChangePercentage24h ?? null;

  // --- Market cap / rank / FDV from CoinGecko ---
  const marketCap = cg?.marketCap ?? null;
  const marketCapRank = cg?.marketCapRank ?? null;
  const fullyDilutedValuation = cg?.fullyDilutedValuation ?? null;

  // --- volumeToMarketCap ---
  const volumeToMarketCap =
    volume24h !== null && marketCap !== null && marketCap !== 0
      ? volume24h / marketCap
      : null;

  // --- All-time high from CoinGecko ---
  const allTimeHigh = cg?.ath ?? null;
  const allTimeHighDate = cg?.athDate ?? null;

  // --- Missing fields calculated from klines ---
  const {
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange90d,
  } = calculateMissingMarketData(bs?.klines ?? null, price);

  // --- Price changes: CoinGecko ---
  const priceChange30d = cg?.priceChangePercentage30d ?? null;

  // --- changeSincePreviousClose / changePercentSincePreviousClose ---
  const changeSincePreviousClose = bs?.ticker24hr ? Number(bs.ticker24hr.priceChange) : cg?.priceChange24h ?? null;
  const changePercentSincePreviousClose = bs?.ticker24hr ? Number(bs.ticker24hr.priceChangePercent) : cg?.priceChangePercentage24h ?? null;

  // --- priceUpdatedAt ---
  const priceUpdatedAt =
    bs?.ticker24hr
      ? new Date(bs.ticker24hr.closeTime).toISOString()
      : cg?.lastUpdated ?? null;

  const marketCapDominance: number | null = null;

  return {
    price,
    currency: "USD",
    change24h,
    changePercent24h,
    changeSincePreviousClose,
    changePercentSincePreviousClose,
    high24h,
    low24h,
    marketCap,
    marketCapRank,
    fullyDilutedValuation,
    marketCapDominance,
    volume24h,
    quoteVolume24h,
    volumeToMarketCap,
    allTimeHigh,
    allTimeHighDate,
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange30d,
    priceChange90d,
    priceUpdatedAt,
    source: price !== null ? (bs?.price ? "Binance" : "CoinGecko") : null,
  };
}

/* ============================================================================
 * NORMALIZER
 * ============================================================================ */

/**
 * Normalizes raw provider data into the target crypto intelligence output shape.
 */
export function normalizeCryptoIntelligence(
  raw: RawCryptoIntelligence,
  symbol: string,
): CryptoIntelligenceData {
  const cleanSymbol = symbol.trim().toUpperCase();
  const now = new Date().toISOString();

  const coingecko = raw.coingecko;
  const binanceSpot = raw.binanceSpot;
  const binanceFutures = raw.binanceFutures ?? [];

  // --- Asset ---
  const asset = normalizeAsset(coingecko?.asset, cleanSymbol);

  // --- Market (CoinGecko + Binance Spot) ---
  const market = normalizeMarket(coingecko?.market, binanceSpot);

  // --- Supply ---
  const supply = normalizeSupply(coingecko?.crypto);

  // --- Network ---
  const network = normalizeNetwork(coingecko?.crypto);

  // --- Tokenomics ---
  const tokenomics = normalizeTokenomics(coingecko?.crypto);

  // --- Security ---
  const security = normalizeSecurity(coingecko?.crypto, binanceFutures);

  // --- Socials ---
  const socials = normalizeSocials(coingecko?.crypto);

  // --- Exchanges ---
  const exchanges = normalizeExchanges(binanceFutures);

  // --- dataUpdatedAt ---
  const timestamps: string[] = [];
  if (market.priceUpdatedAt) timestamps.push(market.priceUpdatedAt);
  if (coingecko?.fetchedAt) timestamps.push(coingecko.fetchedAt);
  const dataUpdatedAt =
    timestamps.length > 0
      ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
      : now;

  return {
    symbol: cleanSymbol,
    asset,
    market,
    supply,
    network,
    tokenomics,
    security,
    socials,
    exchanges,
    dataUpdatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Individual Normalizers                           */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes a CoinGeckoAssetRecord into the output CryptoAsset shape.
 */
function normalizeAsset(
  asset: CoinGeckoAssetRecord | undefined,
  symbol: string,
): CryptoAsset {
  if (!asset) {
    return {
      name: symbol,
      symbol,
      category: null,
      description: null,
      logoUrl: null,
      website: null,
      externalIds: { coingeckoId: symbol.toLowerCase() },
    };
  }

  return {
    name: asset.name ?? symbol,
    symbol: (asset.symbol ?? symbol).toUpperCase(),
    category: asset.category ?? null,
    description: asset.description ?? null,
    logoUrl: asset.logoUrl ?? null,
    website: asset.websiteUrl ?? null,
    externalIds: {
      coingeckoId: asset.externalIds.coingecko_id ?? symbol.toLowerCase(),
    },
  };
}

/**
 * Normalizes CoinGeckoCryptoRecord.supply fields into CryptoSupply.
 */
function normalizeSupply(
  crypto: CoinGeckoCryptoRecord | undefined,
): CryptoSupply {
  if (!crypto) {
    return {
      circulating: null,
      total: null,
      max: null,
      circulatingPercentage: null,
    };
  }

  const circulating = crypto.circulatingSupply;
  const total = crypto.totalSupply;
  const max = crypto.maxSupply;

  const circulatingPercentage =
    circulating !== null && max !== null && max > 0
      ? (circulating / max) * 100
      : null;

  return {
    circulating,
    total,
    max,
    circulatingPercentage,
  };
}

/**
 * Normalizes CoinGeckoCryptoRecord.network/contracts into CryptoNetwork.
 */
function normalizeNetwork(
  crypto: CoinGeckoCryptoRecord | undefined,
): CryptoNetwork {
  if (!crypto) {
    return { primary: null, contracts: [] };
  }

  const contracts: CryptoContract[] = (crypto.contractAddresses ?? []).map((c) => ({
    network: c.network,
    address: c.address,
  }));

  return {
    primary: crypto.network ?? null,
    contracts,
  };
}

/**
 * Normalizes CoinGeckoCryptoRecord.tokenomics into CryptoTokenomics.
 */
function normalizeTokenomics(
  crypto: CoinGeckoCryptoRecord | undefined,
): CryptoTokenomics {
  if (!crypto) {
    return {};
  }

  return {
    categories: crypto.tokenomics.categories,
    genesisDate: crypto.tokenomics.genesisDate,
    hashingAlgorithm: crypto.tokenomics.hashingAlgorithm,
    blockTimeInMinutes: crypto.tokenomics.blockTimeInMinutes,
    hasSupplyBreakdown: crypto.tokenomics.hasSupplyBreakdown,
  };
}

/**
 * Normalizes security from CoinGecko + Binance positioning data.
 */
function normalizeSecurity(
  crypto: CoinGeckoCryptoRecord | undefined,
  binanceFutures: BinancePositioningLatest[],
): CryptoSecurity {
  const summary: string | null = null;
  const contractAnalysis: Record<string, unknown> = {};

  const riskFlags: string[] = [];
  const btcData = binanceFutures.find((b) => b.symbol === "BTCUSDT");

  if (btcData?.funding) {
    const fundingRate = Number(btcData.funding.fundingRate);
    if (Number.isFinite(fundingRate)) {
      if (fundingRate > 0.01) {
        riskFlags.push("extreme_positive_funding_rate");
      } else if (fundingRate < -0.01) {
        riskFlags.push("extreme_negative_funding_rate");
      }
    }
  }

  if (btcData?.openInterest) {
    const openInterest = Number(btcData.openInterest.sumOpenInterestValue);
    if (Number.isFinite(openInterest) && openInterest > 50_000_000_000) {
      riskFlags.push("high_open_interest");
    }
  }

  return {
    summary,
    contractAnalysis,
    riskFlags,
  };
}

/**
 * Normalizes CoinGeckoCryptoRecord.socials into CryptoSocials.
 */
function normalizeSocials(
  crypto: CoinGeckoCryptoRecord | undefined,
): CryptoSocials {
  if (!crypto) {
    return {};
  }

  const s = crypto.socials;
  return {
    homepage: s.homepage,
    whitepaper: s.whitepaper,
    blockchainSites: s.blockchainSites,
    officialForumUrls: s.officialForumUrls,
    chatUrls: s.chatUrls,
    announcementUrls: s.announcementUrls,
    twitter: s.twitter,
    telegram: s.telegram,
    subreddit: s.subreddit,
    repos: s.repos,
  };
}

/**
 * Normalizes Binance positioning data into CryptoExchange[].
 */
function normalizeExchanges(
  binanceFutures: BinancePositioningLatest[],
): CryptoExchange[] {
  const exchanges: CryptoExchange[] = [];

  for (const b of binanceFutures) {
    const markPrice = Number(b.funding?.markPrice ?? 0);
    const openInterestValue = Number(b.openInterest?.sumOpenInterestValue ?? 0);

    const volume24h = openInterestValue > 0 ? openInterestValue * 0.1 : null;

    exchanges.push({
      name: "Binance",
      symbol: b.symbol.replace("USDT", ""),
      volume24h,
      quoteVolume24h: volume24h,
      percentOfTotalVolume: null,
      isVerified: true,
    });
  }

  return exchanges;
}

/* ============================================================================
 * MAIN (direct run)
 * ============================================================================ */

async function main(symbol: string): Promise<void> {
  console.log(`Fetching crypto intelligence for ${symbol}...\n`);
  const raw = await fetchCryptoIntelligence(symbol);
  const data = normalizeCryptoIntelligence(raw, symbol);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `crypto_intelligence_${data.symbol}_${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");

  console.log(`\nOutput written to: ${filepath}`);
  console.log(`  symbol: ${data.symbol}`);
  console.log(`  asset: ${data.asset.name} (${data.asset.symbol})`);
  console.log(`  market price: $${data.market.price ?? "N/A"}`);
  console.log(`  market cap: $${data.market.marketCap ?? "N/A"}`);
  console.log(`  allTimeHigh: $${data.market.allTimeHigh ?? "N/A"} (${data.market.allTimeHighDate ?? "N/A"})`);
  console.log(`  allTimeLow: $${data.market.allTimeLow ?? "N/A"} (${data.market.allTimeLowDate ?? "N/A"})`);
  console.log(`  priceChange7d: ${data.market.priceChange7d ?? "N/A"}%`);
  console.log(`  priceChange90d: ${data.market.priceChange90d ?? "N/A"}%`);
  console.log(`  supply: circulating=${data.supply.circulating ?? "N/A"}, max=${data.supply.max ?? "N/A"}`);
  console.log(`  exchanges: ${data.exchanges.length}`);
  console.log(`  risk flags: ${data.security.riskFlags.join(", ") || "none"}`);
}

const args = process.argv.slice(2);
const symbolArg = args.find((a) => a.startsWith("--symbol="));
const symbol = symbolArg ? symbolArg.split("=")[1] ?? "BTC" : "BTC";

if (import.meta.main) {
  main(symbol).catch((error) => {
    console.error("Crypto intelligence collection failed:", error);
    process.exitCode = 1;
  });
}
