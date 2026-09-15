import { alphaVantageFetch } from "../alphaVantage.fetch.js";
import { fxResponsesSchema } from "../../../types/alphaVantage/alphaVantage.types.js";
import { normalizeFxData } from "../../../utils/alphaVantage/normalizeFx.js";

const FX_PAIRS = [
  { from: "EUR", to: "USD" },
  // { from: "GBP", to: "USD" },
  // { from: "USD", to: "JPY" },
  // { from: "USD", to: "CHF" },
  // { from: "AUD", to: "USD" },
  // { from: "USD", to: "CAD" },
  // { from: "NZD", to: "USD" },
];

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function getFxData(mode: "full" | "latest") {
  const results = [];

  for (const { from, to } of FX_PAIRS) {
    const result = await alphaVantageFetch({
      function: "FX_DAILY",
      from_symbol: from,
      to_symbol: to,
      outputsize: mode === "full" ? "full" : "compact",
    });

    results.push(result);

    await delay(1100);
  }

  const validatedData = fxResponsesSchema.parse(results);

  const normalizedData = normalizeFxData(validatedData);

  if (mode === "latest") {
    return FX_PAIRS.map(({ from, to }) => {
      const pair = `${from}/${to}`;

      return normalizedData.find((data) => data.pair === pair);
    });
  }

  return normalizedData;
}