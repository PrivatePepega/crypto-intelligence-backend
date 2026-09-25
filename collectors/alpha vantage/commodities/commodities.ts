import { alphaVantageFetch } from "../alphaVantage.fetch.js";
import {
  commodityPriceResponseSchema,
  commodityValueResponseSchema,
} from "../../../types/alphaVantage/alphaVantage.types.js";
import { normalizeCommodityData } from "../../../utils/alphaVantage/normalizerCommodities.js";


type Commodity = {
  name: string;
  function: string;
  interval: "daily" | "monthly";
  type: "price" | "value";
  unit: string;
  symbol?: string;
};

const COMMODITIES: Commodity[] = [
    {
      name: "gold",
      function: "GOLD_SILVER_HISTORY",
      symbol: "GOLD",
      interval: "daily",
      type: "price",
      unit: "dollars per troy ounce",
    },
    {
      name: "silver",
      function: "GOLD_SILVER_HISTORY",
      symbol: "SILVER",
      interval: "daily",
      type: "price",
      unit: "dollars per troy ounce",
    },
    {
      name: "wti",
      function: "WTI",
      interval: "daily",
      type: "value",
      unit: "dollars per barrel",
    },
    {
      name: "brent",
      function: "BRENT",
      interval: "daily",
      type: "value",
      unit: "dollars per barrel",
    },
    {
      name: "natural_gas",
      function: "NATURAL_GAS",
      interval: "daily",
      type: "value",
      unit: "dollars per million BTU",
    },
    {
      name: "copper",
      function: "COPPER",
      interval: "monthly",
      type: "value",
      unit: "dollar per metric ton",
    },
    {
      name: "aluminum",
      function: "ALUMINUM",
      interval: "monthly",
      type: "value",
      unit: "dollar per metric ton",
    },
  ];

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type CommodityDataMode = "latest" | "full";

export async function getCommodityData() {
  const full = [];
  const latest = [];

  for (const commodity of COMMODITIES) {
    const result = await alphaVantageFetch({
      function: commodity.function,
      ...(commodity.symbol && {
        symbol: commodity.symbol,
      }),
      ...(commodity.interval && {
        interval: commodity.interval,
      }),
    });

    const parsedData =
      commodity.type === "price"
        ? commodityPriceResponseSchema.parse(result)
        : commodityValueResponseSchema.parse(result);

    const normalizedData = normalizeCommodityData(
      parsedData,
      commodity.name,
      commodity.interval,
    );

    full.push(...normalizedData);
    latest.push(...normalizedData.slice(0, 3));

    await delay(1100);
  }

  return {
    full,
    latest,
  };
}