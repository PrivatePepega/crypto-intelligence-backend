import { z } from "zod";


  export interface CftcTffObservation {
    indicator: "cftc_tff";
    contract: string;
    commodity: string;
    subgroup: string;
    date: string;
    openInterest: number;
  
    dealer: {
      long: number;
      short: number;
      spread: number;
      net: number;
    };
  
    assetManager: {
      long: number;
      short: number;
      spread: number;
      net: number;
    };
  
    leveragedMoney: {
      long: number;
      short: number;
      spread: number;
      net: number;
    };
  
    otherReportables: {
      long: number;
      short: number;
      spread: number;
      net: number;
    };
  
    nonReportables: {
      long: number;
      short: number;
      net: number;
    };
  }


export const cftcTffRawObservationSchema = z.object({
  contract_market_name: z.string(),
  commodity_name: z.string(),
  commodity_subgroup_name: z.string(),
  report_date_as_yyyy_mm_dd: z.string(),

  open_interest_all: z.string(),

  dealer_positions_long_all: z.string(),
  dealer_positions_short_all: z.string(),
  dealer_positions_spread_all: z.string(),

  asset_mgr_positions_long: z.string(),
  asset_mgr_positions_short: z.string(),
  asset_mgr_positions_spread: z.string(),

  lev_money_positions_long: z.string(),
  lev_money_positions_short: z.string(),
  lev_money_positions_spread: z.string(),

  other_rept_positions_long: z.string(),
  other_rept_positions_short: z.string(),
  other_rept_positions_spread: z.string(),

  nonrept_positions_long_all: z.string(),
  nonrept_positions_short_all: z.string(),
});

export const cftcTffResponseSchema = z.array(
  cftcTffRawObservationSchema,
);

export type CftcTffRawObservation = z.infer<
  typeof cftcTffRawObservationSchema
>;