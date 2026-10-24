import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcJapaneseYen: Indicator = {
  id: "cftc_japanese_yen",
  name: "CFTC Japanese Yen Futures Positioning",
  domain: "Financial Markets",
  category: "Currency Futures Positioning",

  description:
    "A weekly measure of Japanese Yen futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Japanese Yen futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_japanese_yen",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",
  historicalTimeUnit: "o",

  use: "Track changes in Japanese Yen futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Japanese Yen futures and how their exposure to the yen changes over time.",

  significance:
    "CFTC Japanese Yen futures positioning provides a structured view of market-participant exposure to the Japanese yen through regulated currency futures. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting their yen exposure. Yen positioning can provide context for USD/JPY dynamics, Bank of Japan monetary policy, Japanese interest rates, U.S.-Japan interest-rate differentials, Japanese economic conditions, and changes in global risk sentiment.",

  relationTags: [
    "cftc_japanese_yen",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",
    "japanese_yen",
    "yen",
    "jpy",
    "yen_fx",
    "yen_futures",
    "japanese_currency",
    "japanese_currency_futures",
    "currency_futures",
    "fx_futures",
  ],

  status: "active",
  embedding: null,
};
