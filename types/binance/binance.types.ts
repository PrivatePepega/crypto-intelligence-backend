import { z } from "zod";

export const binanceGlobalLongShortAccountRatioSchema = z.array(
  z.object({
    symbol: z.string(),
    longAccount: z.string(),
    longShortRatio: z.string(),
    shortAccount: z.string(),
    timestamp: z.number(),
  })
);

export const binanceTopLongShortAccountRatioSchema = z.array(
  z.object({
    symbol: z.string(),
    longAccount: z.string(),
    longShortRatio: z.string(),
    shortAccount: z.string(),
    timestamp: z.number(),
  })
);

export const binanceTopLongShortPositionRatioSchema = z.array(
  z.object({
    symbol: z.string(),
    longAccount: z.string(),
    longShortRatio: z.string(),
    shortAccount: z.string(),
    timestamp: z.number(),
  })
);

export const binanceOpenInterestHistSchema = z.array(
  z.object({
    symbol: z.string(),
    sumOpenInterest: z.string(),
    sumOpenInterestValue: z.string(),
    CMCCirculatingSupply: z.string(),
    timestamp: z.number(),
  })
);

export const binanceFundingRateSchema = z.array(
  z.object({
    symbol: z.string(),
    fundingTime: z.number(),
    fundingRate: z.string(),
    markPrice: z.string(),
    rateType: z.string(),
  })
);

export const binanceTakerLongShortRatioSchema = z.array(
  z.object({
    buySellRatio: z.string(),
    sellVol: z.string(),
    buyVol: z.string(),
    timestamp: z.number(),
  })
);

// Normalized shapes produced by collectors/binance/binanceFetcher.ts. Numeric
// values stay strings here because that is how the upstream payloads arrive;
// conversion to number happens at the injection boundary.

export type BinanceLongShortPoint = {
  symbol: string;
  longAccount: string;
  longShortRatio: string;
  shortAccount: string;
  date: string;
};

export type BinanceOpenInterestPoint = {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  CMCCirculatingSupply: string;
  date: string;
};

export type BinanceFundingPoint = {
  symbol: string;
  fundingRate: string;
  markPrice: string;
  rateType: string;
  date: string;
};

export type BinanceTakerPoint = {
  buySellRatio: string;
  sellVol: string;
  buyVol: string;
  date: string;
};

// "full" mode: one entry per symbol, each sub-source is its whole history.
export type BinancePositioningHistory = {
  symbol: string;
  globalLongShort: BinanceLongShortPoint[];
  topAccount: BinanceLongShortPoint[];
  topPosition: BinanceLongShortPoint[];
  openInterest: BinanceOpenInterestPoint[];
  funding: BinanceFundingPoint[];
  taker: BinanceTakerPoint[];
};

// "latest" mode: one entry per symbol, each sub-source is a single reading or
// undefined when that sub-source had no data.
export type BinancePositioningLatest = {
  symbol: string;
  globalLongShort: BinanceLongShortPoint | undefined;
  topAccount: BinanceLongShortPoint | undefined;
  topPosition: BinanceLongShortPoint | undefined;
  openInterest: BinanceOpenInterestPoint | undefined;
  funding: BinanceFundingPoint | undefined;
  taker: BinanceTakerPoint | undefined;
};