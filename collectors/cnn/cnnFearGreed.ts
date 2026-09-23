import type { Request, Response } from "express";
import { normalizeCnnIndicator } from "../../utils/cnn/normalizeCnnIndicator.js";
import { cnnFearGreedResponseSchema } from "../../types/cnn/fearGreed.types.js";

const CNN_FEAR_GREED_URL =
  "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

  type CnnDataMode = "full" | "latest";

  export async function getCnnFearGreed(mode: CnnDataMode) {
    const response = await fetch(CNN_FEAR_GREED_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
        Referer: "https://www.cnn.com/",
        Origin: "https://www.cnn.com",
      },
    });
  
    if (!response.ok) {
      throw new Error(`CNN request failed: ${response.status}`);
    }
  
    const res = await response.json();
  
    const data = cnnFearGreedResponseSchema.parse(res);


    const cnn_fear_greed = normalizeCnnIndicator(
      "cnn_fear_greed",
      "score",
      data.fear_and_greed_historical,
    );
  
    const cnn_market_momentum_sp125 = normalizeCnnIndicator(
      "cnn_market_momentum_sp125",
      "index",
      data.market_momentum_sp125,
    );
  
    const cnn_stock_price_breadth = normalizeCnnIndicator(
      "cnn_stock_price_breadth",
      "index",
      data.stock_price_breadth,
    );
  
    const cnn_put_call_options = normalizeCnnIndicator(
      "cnn_put_call_options",
      "ratio",
      data.put_call_options,
    );
  
    const cnn_market_volatility_vix_50 = normalizeCnnIndicator(
      "cnn_market_volatility_vix_50",
      "index",
      data.market_volatility_vix_50,
    );
  
    const cnn_safe_haven_demand = normalizeCnnIndicator(
      "cnn_safe_haven_demand",
      "ratio",
      data.safe_haven_demand,
    );
  
    const indicators = {
      cnn_fear_greed,
      cnn_market_momentum_sp125,
      cnn_stock_price_breadth,
      cnn_put_call_options,
      cnn_market_volatility_vix_50,
      cnn_safe_haven_demand,
    };
  
    if (mode === "full") {
      return indicators;
    }
  
    return Object.fromEntries(
      Object.entries(indicators).map(([key, indicator]) => [
        key,
        {
          ...indicator,
          observations: indicator.observations.slice(-3),
        },
      ]),
    );
  }