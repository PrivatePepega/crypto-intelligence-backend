import { alphaVantageFetch } from "../alphaVantage.fetch.js";
import {
  commodityPriceResponseSchema,
  commodityValueResponseSchema,
} from "../../../types/alphaVantage/alphaVantage.types.js";
import { normalizeCommodityData } from "../../../utils/alphaVantage/normalizerCommodities.js";

const COMMODITIES = [
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
      unit: "unknown to test",
    },
  ];

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function getCommodityData() {
  const results = [];

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
    );

    results.push(...normalizedData);

    await delay(1100);
  }

  return results;
}