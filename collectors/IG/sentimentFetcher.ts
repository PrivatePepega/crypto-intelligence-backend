import axios from "axios";

import "dotenv/config";
import { igClientSentimentSchema } from "../../types/IG/sentiment.types.js";


const IG_API = "https://demo-api.ig.com/gateway/deal";

const IG_MARKETS = {
  sp500: {
    marketId: "US500",
    asset: "S&P 500",
  },
  gold: {
    marketId: "GC",
    asset: "Gold",
  },
  nasdaq100: {
    marketId: "USTECH",
    asset: "Nasdaq 100",
  },
  dowJones: {
    marketId: "WALL",
    asset: "Dow Jones",
  },
  silver: {
    marketId: "SI",
    asset: "Silver",
  },
  wtiCrude: {
    marketId: "CL",
    asset: "WTI Crude Oil",
  },
  brentCrude: {
    marketId: "LCO",
    asset: "Brent Crude Oil",
  },
  eurUsd: {
    marketId: "EURUSD",
    asset: "EUR/USD",
  },
  gbpUsd: {
    marketId: "GBPUSD",
    asset: "GBP/USD",
  },
  usdJpy: {
    marketId: "USDJPY",
    asset: "USD/JPY",
  },
  audUsd: {
    marketId: "AUDUSD",
    asset: "AUD/USD",
  },
  usdCad: {
    marketId: "USDCAD",
    asset: "USD/CAD",
  },
} as const;

type IGMarket = (typeof IG_MARKETS)[keyof typeof IG_MARKETS];

type IGSession = {
  cst: string;
  securityToken: string;
};

export type NormalizedIGSentiment = {
  asset: string;
  long: number;
  short: number;
  net: number;
  source: "IG";
  date: string;
};

async function authenticateIG(): Promise<IGSession> {
  const apiKey = process.env.IG_API_KEY;
  const identifier = process.env.IG_IDENTIFIER;
  const password = process.env.IG_PASSWORD;

  if (!apiKey || !identifier || !password) {
    throw new Error("Missing IG API credentials");
  }

  const session = await axios.post(
    `${IG_API}/session`,
    {
      identifier,
      password,
    },
    {
      headers: {
        "X-IG-API-KEY": apiKey,
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json; charset=UTF-8",
        Version: "2",
      },
    }
  );

  const cst = session.headers["cst"];
  const securityToken = session.headers["x-security-token"];

  console.log({
    sessionStatus: session.status,
    hasCst: !!cst,
    hasSecurityToken: !!securityToken,
    accountType: session.data.accountType,
    currentAccountId: session.data.currentAccountId,
  });

  if (!cst || !securityToken) {
    throw new Error("IG session tokens were not returned");
  }

  return {
    cst,
    securityToken,
  };
}

async function fetchClientSentiment(
  marketId: IGMarket["marketId"],
  session: IGSession
) {
  const apiKey = process.env.IG_API_KEY;

  if (!apiKey) {
    throw new Error("Missing IG_API_KEY");
  }

  const response = await axios.get(
    `${IG_API}/clientsentiment/${marketId}`,
    {
      headers: {
        "X-IG-API-KEY": apiKey,
        CST: session.cst,
        "X-SECURITY-TOKEN": session.securityToken,
        Accept: "application/json; charset=UTF-8",
        Version: "1",
      },
    }
  );

  return igClientSentimentSchema.parse(response.data);
}

function normalizeIGSentiment(
  data: ReturnType<typeof igClientSentimentSchema.parse>,
  asset: string
): NormalizedIGSentiment {
  const long = data.longPositionPercentage;
  const short = data.shortPositionPercentage;

  return {
    asset,
    long,
    short,
    net: long - short,
    source: "IG",
    date: new Date().toISOString().split("T")[0]!,
  };
}

export const fetchIGSentiment = async (): Promise<
  NormalizedIGSentiment[]
> => {
  const session = await authenticateIG();

  const results: NormalizedIGSentiment[] = [];

  for (const market of Object.values(IG_MARKETS)) {
    try {
      const rawData = await fetchClientSentiment(
        market.marketId,
        session
      );

      // The response marketId is validated by the schema but was never
      // compared to the requested one, so a mismatch would silently file the
      // numbers under the wrong asset.
      if (rawData.marketId !== market.marketId) {
        console.warn(
          `IG returned marketId "${rawData.marketId}" for requested "${market.marketId}"`,
        );
      }

      const normalizedData = normalizeIGSentiment(
        rawData,
        market.asset
      );

      results.push(normalizedData);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `IG sentiment failed for ${market.asset}:`,
          error.response?.status,
          error.response?.data
        );
      } else {
        console.error(
          `IG sentiment failed for ${market.asset}:`,
          error
        );
      }
    }
  }

  return results;
};