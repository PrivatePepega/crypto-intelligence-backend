// Shared types and helpers for the IG retail-positioning injectors.
//
// The IG payload is one flat array covering every tracked asset, and each row
// carries its own asset name, so per-market injectors narrow it by asset the
// same way the CFTC injectors narrow by contract.

export type IgSentimentObservation = {
  asset: string;
  long: number;
  short: number;
  net: number;
  source: string;
  date: string;
};

export type IgSentimentData = {
  data: IgSentimentObservation[];
};

// Every column is NOT NULL, and upstream parsers can yield NaN from blank
// source cells, so historical injectors skip incomplete rows rather than
// aborting the whole transaction.
export const isIgObservationComplete = (
  observation: IgSentimentObservation,
) =>
  Number.isFinite(observation.long) &&
  Number.isFinite(observation.short) &&
  Number.isFinite(observation.net);

// The collector's sort order is not something the injection layer should
// depend on, so pick the newest observation for an asset by date explicitly
// instead of taking the first array match.
export const selectLatestIgObservation = (
  data: IgSentimentData,
  asset: string,
): IgSentimentObservation | undefined => {
  const matches = data.data.filter((item) => item.asset === asset);

  if (matches.length === 0) {
    return undefined;
  }

  return matches.reduce((latest, item) =>
    item.date > latest.date ? item : latest,
  );
};
