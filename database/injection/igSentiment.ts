// Shared types and configuration for the IG retail-positioning injectors.
//
// The IG collector makes one session plus 12 market calls and returns a single
// flat array covering every asset, so all 12 markets are injected from that one
// payload and each per-market injector narrows it by asset.

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

export type IgMarketConfig = {
  // Value written to the series_id column; must match the FK target in
  // database/injection/indicators/.
  seriesId: string;
  // Table name without a schema prefix. Interpolated into SQL below, so this
  // is an internal constant only and must never come from user input.
  table: string;
  // Must match the asset string the collector emits for this market.
  asset: string;
  // Human-readable name used in log output and error messages.
  label: string;
};

// Single source of truth for the 12 IG markets. The asset strings must match
// collectors/IG/sentimentFetcher.ts IG_MARKETS exactly.
export const IG_SENTIMENT_MARKETS = {
  sp500: {
    seriesId: "ig_sp500",
    table: "sp500_ig_sentiment",
    asset: "S&P 500",
    label: "IG S&P 500",
  },
  gold: {
    seriesId: "ig_gold",
    table: "gold_ig_sentiment",
    asset: "Gold",
    label: "IG Gold",
  },
  nasdaq: {
    seriesId: "ig_nasdaq",
    table: "nasdaq_ig_sentiment",
    asset: "Nasdaq 100",
    label: "IG Nasdaq 100",
  },
  dowJones: {
    seriesId: "ig_dow_jones",
    table: "dow_jones_ig_sentiment",
    asset: "Dow Jones",
    label: "IG Dow Jones",
  },
  silver: {
    seriesId: "ig_silver",
    table: "silver_ig_sentiment",
    asset: "Silver",
    label: "IG Silver",
  },
  wti: {
    seriesId: "ig_wti_crude_oil",
    table: "wti_ig_sentiment",
    asset: "WTI Crude Oil",
    label: "IG WTI Crude Oil",
  },
  brent: {
    seriesId: "ig_brent_crude_oil",
    table: "brent_ig_sentiment",
    asset: "Brent Crude Oil",
    label: "IG Brent Crude Oil",
  },
  eurUsd: {
    seriesId: "ig_euro_usd",
    table: "eur_usd_ig_sentiment",
    asset: "EUR/USD",
    label: "IG EUR/USD",
  },
  gbpUsd: {
    seriesId: "ig_gbp_usd",
    table: "gbp_usd_ig_sentiment",
    asset: "GBP/USD",
    label: "IG GBP/USD",
  },
  usdJpy: {
    seriesId: "ig_usd_jpy",
    table: "usd_jpy_ig_sentiment",
    asset: "USD/JPY",
    label: "IG USD/JPY",
  },
  audUsd: {
    seriesId: "ig_aud_usd",
    table: "aud_usd_ig_sentiment",
    asset: "AUD/USD",
    label: "IG AUD/USD",
  },
  usdCad: {
    seriesId: "ig_usd_cad",
    table: "usd_cad_ig_sentiment",
    asset: "USD/CAD",
    label: "IG USD/CAD",
  },
} as const satisfies Record<string, IgMarketConfig>;

export type IgSentimentMarket = keyof typeof IG_SENTIMENT_MARKETS;

// Every column is NOT NULL upstream in the sense that a malformed row would
// poison the numbers, and parsers can yield NaN from blank source cells, so
// historical injectors skip incomplete rows rather than aborting the
// transaction.
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
