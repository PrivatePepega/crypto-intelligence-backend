import type { CommodityPriceResponse, CommodityValueResponse } from "../../types/alphaVantage/alphaVantage.types.js";

export function normalizeCommodityData(
  data: CommodityPriceResponse | CommodityValueResponse,
  commodity: string,
  interval: "daily" | "monthly",
  unit?: string,
) {
  if ("nominal" in data) {
    return data.data.map((item) => ({
      commodity,
      date: item.date,
      value: item.price === "." ? null : Number(item.price),
      unit,
      interval,
    }));
  }

  return data.data.map((item) => ({
    commodity,
    date: item.date,
    value: item.value === "." ? null : Number(item.value),
    unit: data.unit,
    interval,
  }));
}