import axios from "axios";

import {
  binanceGlobalLongShortAccountRatioSchema,
  binanceTopLongShortAccountRatioSchema,
  binanceTopLongShortPositionRatioSchema,
  binanceOpenInterestHistSchema,
  binanceFundingRateSchema,
  binanceTakerLongShortRatioSchema,
} from "../../types/binance/binance.types.js";

const BINANCE_API = "https://fapi.binance.com";

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "LINKUSDT",
  "AAVEUSDT",
] as const;

type FetchMode = "full" | "latest";

const getLatestByTimestamp = <T>(
  data: T[],
  getTimestamp: (item: T) => number
): T | undefined => {
  return data.reduce<T | undefined>((latest, current) => {
    if (!latest) return current;

    return getTimestamp(current) > getTimestamp(latest)
      ? current
      : latest;
  }, undefined);
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toISOString().split("T")[0]!;
};

const formatGlobalLongShort = (
  item: ReturnType<
    typeof binanceGlobalLongShortAccountRatioSchema.parse
  >[number]
) => {
  const { timestamp, ...data } = item;

  return {
    ...data,
    date: formatDate(timestamp),
  };
};

const formatTopAccount = (
  item: ReturnType<
    typeof binanceTopLongShortAccountRatioSchema.parse
  >[number]
) => {
  const { timestamp, ...data } = item;

  return {
    ...data,
    date: formatDate(timestamp),
  };
};

const formatTopPosition = (
  item: ReturnType<
    typeof binanceTopLongShortPositionRatioSchema.parse
  >[number]
) => {
  const { timestamp, ...data } = item;

  return {
    ...data,
    date: formatDate(timestamp),
  };
};

const formatOpenInterest = (
  item: ReturnType<
    typeof binanceOpenInterestHistSchema.parse
  >[number]
) => {
  const { timestamp, ...data } = item;

  return {
    ...data,
    date: formatDate(timestamp),
  };
};

const formatFunding = (
  item: ReturnType<typeof binanceFundingRateSchema.parse>[number]
) => {
  const { fundingTime, ...data } = item;

  return {
    ...data,
    date: formatDate(fundingTime),
  };
};

const formatTaker = (
  item: ReturnType<
    typeof binanceTakerLongShortRatioSchema.parse
  >[number]
) => {
  const { timestamp, ...data } = item;

  return {
    ...data,
    date: formatDate(timestamp),
  };
};

export const fetchBinancePositioning = async (
  mode: FetchMode
) => {
  try {
    const results = [];

    for (const symbol of SYMBOLS) {
      const [
        globalLongShortResponse,
        topAccountResponse,
        topPositionResponse,
        openInterestResponse,
        fundingResponse,
        takerResponse,
      ] = await Promise.all([
        axios.get(
          `${BINANCE_API}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1d`
        ),

        axios.get(
          `${BINANCE_API}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1d`
        ),

        axios.get(
          `${BINANCE_API}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1d`
        ),

        axios.get(
          `${BINANCE_API}/futures/data/openInterestHist?symbol=${symbol}&period=1d`
        ),

        axios.get(
          `${BINANCE_API}/fapi/v1/fundingRate?symbol=${symbol}&limit=10`
        ),

        axios.get(
          `${BINANCE_API}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1d`
        ),
      ]);

      const globalLongShort =
        binanceGlobalLongShortAccountRatioSchema.parse(
          globalLongShortResponse.data
        );

      const topAccount =
        binanceTopLongShortAccountRatioSchema.parse(
          topAccountResponse.data
        );

      const topPosition =
        binanceTopLongShortPositionRatioSchema.parse(
          topPositionResponse.data
        );

      const openInterest =
        binanceOpenInterestHistSchema.parse(
          openInterestResponse.data
        );

      const funding =
        binanceFundingRateSchema.parse(
          fundingResponse.data
        );

      const taker =
        binanceTakerLongShortRatioSchema.parse(
          takerResponse.data
        );

      if (mode === "full") {
        results.push({
          symbol,

          globalLongShort: globalLongShort.map(
            formatGlobalLongShort
          ),

          topAccount: topAccount.map(formatTopAccount),

          topPosition: topPosition.map(formatTopPosition),

          openInterest: openInterest.map(formatOpenInterest),

          funding: funding.map(formatFunding),

          taker: taker.map(formatTaker),
        });

        continue;
      }

      const latestGlobalLongShort = getLatestByTimestamp(
        globalLongShort,
        (item) => item.timestamp
      );

      const latestTopAccount = getLatestByTimestamp(
        topAccount,
        (item) => item.timestamp
      );

      const latestTopPosition = getLatestByTimestamp(
        topPosition,
        (item) => item.timestamp
      );

      const latestOpenInterest = getLatestByTimestamp(
        openInterest,
        (item) => item.timestamp
      );

      const latestFunding = getLatestByTimestamp(
        funding,
        (item) => item.fundingTime
      );

      const latestTaker = getLatestByTimestamp(
        taker,
        (item) => item.timestamp
      );

      results.push({
        symbol,

        globalLongShort: latestGlobalLongShort
          ? formatGlobalLongShort(latestGlobalLongShort)
          : undefined,

        topAccount: latestTopAccount
          ? formatTopAccount(latestTopAccount)
          : undefined,

        topPosition: latestTopPosition
          ? formatTopPosition(latestTopPosition)
          : undefined,

        openInterest: latestOpenInterest
          ? formatOpenInterest(latestOpenInterest)
          : undefined,

        funding: latestFunding
          ? formatFunding(latestFunding)
          : undefined,

        taker: latestTaker
          ? formatTaker(latestTaker)
          : undefined,
      });
    }

    return results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Binance positioning fetch failed:",
        error.response?.status,
        error.response?.data
      );
    } else {
      console.error("Binance positioning fetch failed:", error);
    }

    throw error;
  }
};