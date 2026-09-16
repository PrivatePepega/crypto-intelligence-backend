import type { AaiiRawObservation } from "./parseAaiiSentiment.js";

function normalizeAaiiDate(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);

  return date.toISOString().slice(0, 10);
}

function toPercent(value: number): number {
  return Number((value * 100).toFixed(4));
}

export function normalizeAaiiSentiment(
  data: AaiiRawObservation[],
) {
  const observations = data
    .filter(
      (
        observation,
      ): observation is AaiiRawObservation & {
        bullish: number;
        neutral: number;
        bearish: number;
      } =>
        observation.bullish !== null &&
        observation.neutral !== null &&
        observation.bearish !== null,
    )
    .map((observation) => ({
      date: normalizeAaiiDate(observation.date),
      bullish: toPercent(observation.bullish),
      neutral: toPercent(observation.neutral),
      bearish: toPercent(observation.bearish),
      bullBearSpread:
        observation.bullBearSpread !== null
          ? toPercent(observation.bullBearSpread)
          : null,
    }));

  return {
    indicator: "aaii_sentiment",
    frequency: "Weekly",
    aggregation: "none",
    unit: "percent",
    observations,
    historical: observations.at(-1) ?? null,
  };
}