import axios from "axios";
import { coinMarketCapGlobalMetricsSchema } from "../../types/coinMarketCap/CMC.types.js";


const COINMARKETCAP_API =
  "https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest";

const CMC_FETCH_DELAY_MS = 10_000;

export type NormalizedCoinMarketCapGlobalMetrics = {
  totalMarketCap: number;
  totalVolume24h: number;
  altcoinMarketCap: number;
  altcoinVolume24h: number;

  btcDominance: number;
  ethDominance: number;

  defiMarketCap: number;
  defiVolume24h: number;
  defi24hPercentageChange: number;

  stablecoinMarketCap: number;
  stablecoinVolume24h: number;
  stablecoin24hPercentageChange: number;

  derivativesVolume24h: number;
  derivatives24hPercentageChange: number;

  totalMarketCapYesterday: number;
  totalVolume24hYesterday: number;
  totalMarketCapYesterdayPercentageChange: number;
  totalVolume24hYesterdayPercentageChange: number;

  activeCryptocurrencies: number;
  activeMarketPairs: number;
  activeExchanges: number;

  observedAt: string;

  source: "CoinMarketCap";
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeGlobalMetrics(
  data: ReturnType<typeof coinMarketCapGlobalMetricsSchema.parse>
): NormalizedCoinMarketCapGlobalMetrics {
  const metrics = data.data;
  const usd = metrics.quote.USD;

  return {
    totalMarketCap: usd.total_market_cap,
    totalVolume24h: usd.total_volume_24h,
    altcoinMarketCap: usd.altcoin_market_cap,
    altcoinVolume24h: usd.altcoin_volume_24h,

    btcDominance: metrics.btc_dominance,
    ethDominance: metrics.eth_dominance,

    defiMarketCap: metrics.defi_market_cap,
    defiVolume24h: metrics.defi_volume_24h,
    defi24hPercentageChange: metrics.defi_24h_percentage_change,

    stablecoinMarketCap: metrics.stablecoin_market_cap,
    stablecoinVolume24h: metrics.stablecoin_volume_24h,
    stablecoin24hPercentageChange:
      metrics.stablecoin_24h_percentage_change,

    derivativesVolume24h: metrics.derivatives_volume_24h,
    derivatives24hPercentageChange:
      metrics.derivatives_24h_percentage_change,

    totalMarketCapYesterday: usd.total_market_cap_yesterday,
    totalVolume24hYesterday: usd.total_volume_24h_yesterday,
    totalMarketCapYesterdayPercentageChange:
      usd.total_market_cap_yesterday_percentage_change,
    totalVolume24hYesterdayPercentageChange:
      usd.total_volume_24h_yesterday_percentage_change,

    activeCryptocurrencies: metrics.active_cryptocurrencies,
    activeMarketPairs: metrics.active_market_pairs,
    activeExchanges: metrics.active_exchanges,

    observedAt: metrics.last_updated,

    source: "CoinMarketCap",
  };
}

export const fetchCoinMarketCapGlobalMetrics =
  async (): Promise<NormalizedCoinMarketCapGlobalMetrics> => {
    try {
      await delay(CMC_FETCH_DELAY_MS);

      const response = await axios.get(COINMARKETCAP_API);

      const parsed = coinMarketCapGlobalMetricsSchema.parse(
        response.data
      );

      return normalizeGlobalMetrics(parsed);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "CoinMarketCap Global Metrics fetch failed:",
          error.response?.status,
          error.response?.data
        );
      } else {
        console.error(
          "CoinMarketCap Global Metrics fetch failed:",
          error
        );
      }

      throw error;
    }
  };