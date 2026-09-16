import type { CftcTffObservation, CftcTffRawObservation } from "../../types/cftc/ctfc.types.js";

  
  export function parseCftcTff(
    data: CftcTffRawObservation[],
  ): CftcTffObservation[] {
    return data.map((observation) => ({
      indicator: "cftc_tff",
  
      contract: observation.contract_market_name,
      commodity: observation.commodity_name,
      subgroup: observation.commodity_subgroup_name,
  
      date: observation.report_date_as_yyyy_mm_dd.slice(0, 10),
  
      openInterest: Number(observation.open_interest_all),
  
      dealer: {
        long: Number(observation.dealer_positions_long_all),
        short: Number(observation.dealer_positions_short_all),
        spread: Number(observation.dealer_positions_spread_all),
        net:
          Number(observation.dealer_positions_long_all) -
          Number(observation.dealer_positions_short_all),
      },
  
      assetManager: {
        long: Number(observation.asset_mgr_positions_long),
        short: Number(observation.asset_mgr_positions_short),
        spread: Number(observation.asset_mgr_positions_spread),
        net:
          Number(observation.asset_mgr_positions_long) -
          Number(observation.asset_mgr_positions_short),
      },
  
      leveragedMoney: {
        long: Number(observation.lev_money_positions_long),
        short: Number(observation.lev_money_positions_short),
        spread: Number(observation.lev_money_positions_spread),
        net:
          Number(observation.lev_money_positions_long) -
          Number(observation.lev_money_positions_short),
      },
  
      otherReportables: {
        long: Number(observation.other_rept_positions_long),
        short: Number(observation.other_rept_positions_short),
        spread: Number(observation.other_rept_positions_spread),
        net:
          Number(observation.other_rept_positions_long) -
          Number(observation.other_rept_positions_short),
      },
  
      nonReportables: {
        long: Number(observation.nonrept_positions_long_all),
        short: Number(observation.nonrept_positions_short_all),
        net:
          Number(observation.nonrept_positions_long_all) -
          Number(observation.nonrept_positions_short_all),
      },
    }));
  }