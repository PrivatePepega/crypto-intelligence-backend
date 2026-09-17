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