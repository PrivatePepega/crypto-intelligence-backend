import axios from "axios";
import { coinMarketCapAltcoinSeasonHistoricalSchema, coinMarketCapAltcoinSeasonLatestSchema } from "../../types/coinMarketCap/CMC.types.js";



const COINMARKETCAP_API =
  "https://pro-api.coinmarketcap.com/public-api/v1/altcoin-season-index";

type FetchMode = "latest" | "full";

type NormalizedAltcoinSeasonLatest = {
  index: number;
  altcoinMarketCap: number;
  observedAt: string;
  yearlyHigh: number;
  yearlyHighDate: string;
  yearlyLow: number;
  yearlyLowDate: string;
  source: "CoinMarketCap";
};

type NormalizedAltcoinSeasonHistorical = {
  timeframe: string;
  observations: {
    date: string;
    index: number;
    altcoinMarketCap: number;
  }[];
  source: "CoinMarketCap";
};

function parseLatest(data: unknown) {
  return coinMarketCapAltcoinSeasonLatestSchema.parse(data);
}

function parseHistorical(data: unknown) {
  return coinMarketCapAltcoinSeasonHistoricalSchema.parse(data);
}

function normalizeLatest(
  data: ReturnType<typeof parseLatest>
): NormalizedAltcoinSeasonLatest {
  const latest = data.data;

  return {
    index: latest.altcoin_index,
    altcoinMarketCap: latest.altcoin_marketcap,
    observedAt: latest.snapshot_time,
    yearlyHigh: latest.yearly_high,
    yearlyHighDate: latest.yearly_high_date,
    yearlyLow: latest.yearly_low,
    yearlyLowDate: latest.yearly_low_date,
    source: "CoinMarketCap",
  };
}

function normalizeHistorical(
  data: ReturnType<typeof parseHistorical>
): NormalizedAltcoinSeasonHistorical {
  return {
    timeframe: data.data.timeframe,

    observations: data.data.points.map((point) => ({
      date: point.timestamp,
      index: point.altcoin_index,
      altcoinMarketCap: point.altcoin_marketcap,
    })),

    source: "CoinMarketCap",
  };
}

export const fetchAltcoinSeason = async (
  mode: FetchMode
) => {
  try {
    if (mode === "latest") {
      const response = await axios.get(
        `${COINMARKETCAP_API}/latest`
      );

      const parsed = parseLatest(response.data);

      return normalizeLatest(parsed);
    }

    const response = await axios.get(
      `${COINMARKETCAP_API}/historical`,
      {
        params: {
          timeframe: "90d",
        },
      }
    );

    const parsed = parseHistorical(response.data);

    return normalizeHistorical(parsed);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "CoinMarketCap Altcoin Season fetch failed:",
        error.response?.status,
        error.response?.data
      );
    } else {
      console.error(
        "CoinMarketCap Altcoin Season fetch failed:",
        error
      );
    }

    throw error;
  }
};