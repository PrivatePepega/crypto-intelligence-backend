import type {
    FxResponses,
  } from "../../types/alphaVantage/alphaVantage.types.js";
  
  export function normalizeFxData(data: FxResponses) {
    return data.flatMap((fx) => {
      const meta = fx["Meta Data"];
      const timeSeries = fx["Time Series FX (Daily)"];
  
      const pair = `${meta["2. From Symbol"]}/${meta["3. To Symbol"]}`;
  
      return Object.entries(timeSeries).map(([date, values]) => ({
        pair,
        date,
        open: Number(values["1. open"]),
        high: Number(values["2. high"]),
        low: Number(values["3. low"]),
        close: Number(values["4. close"]),
      }));
    });
  }