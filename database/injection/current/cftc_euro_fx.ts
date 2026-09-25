import pool from "../../../config/database.js";
import type { CftcTffObservation } from "../../../types/cftc/ctfc.types.js";

const EURO_FX_CONTRACT = "EURO FX";

type CftcEuroFxData = {
  indicator: string;
  observations: CftcTffObservation[];
};

export const injectCftcEuroFxLatest = async (data: CftcEuroFxData) => {
  console.log("→ CFTC CFTC Euro FX current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // CFTC requests are ordered by report_date desc, so the first EURO FX
    // match is the most recent week. This is the opposite of the ascending
    // AAII/CNN payloads.
    const currentObservation = data.observations.find(
      (observation) => observation.contract === EURO_FX_CONTRACT,
    );

    if (!currentObservation) {
      throw new Error("No CFTC CFTC Euro FX observation found");
    }

    const previousResult = await client.query<{
      date: string;
      open_interest: string;
      dealer_net: string;
      asset_manager_net: string;
      leveraged_money_net: string;
      other_reportables_net: string;
      non_reportables_net: string;
    }>(
      `
        SELECT
          date,
          open_interest,
          dealer_net,
          asset_manager_net,
          leveraged_money_net,
          other_reportables_net,
          non_reportables_net
        FROM historical.cftc_euro_fx
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previous = previousResult.rows[0];

    if (!previous) {
      throw new Error("No previous CFTC CFTC Euro FX observation found");
    }

    const currentOpenInterest = currentObservation.openInterest;
    const currentDealerNet = currentObservation.dealer.net;
    const currentAssetManagerNet = currentObservation.assetManager.net;
    const currentLeveragedMoneyNet = currentObservation.leveragedMoney.net;
    const currentOtherReportablesNet =
      currentObservation.otherReportables.net;
    const currentNonReportablesNet = currentObservation.nonReportables.net;

    const previousWeekOpenInterest = Number(previous.open_interest);
    const previousWeekDealerNet = Number(previous.dealer_net);
    const previousWeekAssetManagerNet = Number(previous.asset_manager_net);
    const previousWeekLeveragedMoneyNet = Number(
      previous.leveraged_money_net,
    );
    const previousWeekOtherReportablesNet = Number(
      previous.other_reportables_net,
    );
    const previousWeekNonReportablesNet = Number(
      previous.non_reportables_net,
    );

    if (
      !Number.isFinite(previousWeekOpenInterest) ||
      !Number.isFinite(previousWeekDealerNet) ||
      !Number.isFinite(previousWeekAssetManagerNet) ||
      !Number.isFinite(previousWeekLeveragedMoneyNet) ||
      !Number.isFinite(previousWeekOtherReportablesNet) ||
      !Number.isFinite(previousWeekNonReportablesNet)
    ) {
      throw new Error("Previous CFTC CFTC Euro FX values are invalid");
    }

    const openInterestNetChange =
      currentOpenInterest - previousWeekOpenInterest;
    const dealerNetChange = currentDealerNet - previousWeekDealerNet;
    const assetManagerNetChange =
      currentAssetManagerNet - previousWeekAssetManagerNet;
    const leveragedMoneyNetChange =
      currentLeveragedMoneyNet - previousWeekLeveragedMoneyNet;
    const otherReportablesNetChange =
      currentOtherReportablesNet - previousWeekOtherReportablesNet;
    const nonReportablesNetChange =
      currentNonReportablesNet - previousWeekNonReportablesNet;

    const openInterestPercentChange =
      previousWeekOpenInterest === 0
        ? 0
        : (openInterestNetChange / previousWeekOpenInterest) * 100;
    const dealerNetPercentChange =
      previousWeekDealerNet === 0
        ? 0
        : (dealerNetChange / previousWeekDealerNet) * 100;
    const assetManagerNetPercentChange =
      previousWeekAssetManagerNet === 0
        ? 0
        : (assetManagerNetChange / previousWeekAssetManagerNet) * 100;
    const leveragedMoneyNetPercentChange =
      previousWeekLeveragedMoneyNet === 0
        ? 0
        : (leveragedMoneyNetChange / previousWeekLeveragedMoneyNet) * 100;
    const otherReportablesNetPercentChange =
      previousWeekOtherReportablesNet === 0
        ? 0
        : (otherReportablesNetChange / previousWeekOtherReportablesNet) * 100;
    const nonReportablesNetPercentChange =
      previousWeekNonReportablesNet === 0
        ? 0
        : (nonReportablesNetChange / previousWeekNonReportablesNet) * 100;

    const movingAverageResult = await client.query<{
      moving_average_3w_open_interest: string | null;
      moving_average_6w_open_interest: string | null;
      moving_average_12w_open_interest: string | null;
      moving_average_3w_dealer_net: string | null;
      moving_average_6w_dealer_net: string | null;
      moving_average_12w_dealer_net: string | null;
      moving_average_3w_asset_manager_net: string | null;
      moving_average_6w_asset_manager_net: string | null;
      moving_average_12w_asset_manager_net: string | null;
      moving_average_3w_leveraged_money_net: string | null;
      moving_average_6w_leveraged_money_net: string | null;
      moving_average_12w_leveraged_money_net: string | null;
      moving_average_3w_other_reportables_net: string | null;
      moving_average_6w_other_reportables_net: string | null;
      moving_average_12w_other_reportables_net: string | null;
      moving_average_3w_non_reportables_net: string | null;
      moving_average_6w_non_reportables_net: string | null;
      moving_average_12w_non_reportables_net: string | null;
    }>(
      `
        SELECT
          AVG(open_interest) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_open_interest,

          AVG(open_interest) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_open_interest,

          AVG(open_interest) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_open_interest,

          AVG(dealer_net) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_dealer_net,

          AVG(dealer_net) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_dealer_net,

          AVG(dealer_net) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_dealer_net,

          AVG(asset_manager_net) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_asset_manager_net,

          AVG(asset_manager_net) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_asset_manager_net,

          AVG(asset_manager_net) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_asset_manager_net,

          AVG(leveraged_money_net) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_leveraged_money_net,

          AVG(leveraged_money_net) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_leveraged_money_net,

          AVG(leveraged_money_net) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_leveraged_money_net,

          AVG(other_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_other_reportables_net,

          AVG(other_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_other_reportables_net,

          AVG(other_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_other_reportables_net,

          AVG(non_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_non_reportables_net,

          AVG(non_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_non_reportables_net,

          AVG(non_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_non_reportables_net

        FROM historical.cftc_euro_fx
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No CFTC CFTC Euro FX moving-average data found");
    }

    const toNumber = (value: string | null) =>
      value === null ? null : Number(value);

    const movingAverage3wOpenInterest = toNumber(
      row.moving_average_3w_open_interest,
    );
    const movingAverage6wOpenInterest = toNumber(
      row.moving_average_6w_open_interest,
    );
    const movingAverage12wOpenInterest = toNumber(
      row.moving_average_12w_open_interest,
    );

    const movingAverage3wDealerNet = toNumber(
      row.moving_average_3w_dealer_net,
    );
    const movingAverage6wDealerNet = toNumber(
      row.moving_average_6w_dealer_net,
    );
    const movingAverage12wDealerNet = toNumber(
      row.moving_average_12w_dealer_net,
    );

    const movingAverage3wAssetManagerNet = toNumber(
      row.moving_average_3w_asset_manager_net,
    );
    const movingAverage6wAssetManagerNet = toNumber(
      row.moving_average_6w_asset_manager_net,
    );
    const movingAverage12wAssetManagerNet = toNumber(
      row.moving_average_12w_asset_manager_net,
    );

    const movingAverage3wLeveragedMoneyNet = toNumber(
      row.moving_average_3w_leveraged_money_net,
    );
    const movingAverage6wLeveragedMoneyNet = toNumber(
      row.moving_average_6w_leveraged_money_net,
    );
    const movingAverage12wLeveragedMoneyNet = toNumber(
      row.moving_average_12w_leveraged_money_net,
    );

    const movingAverage3wOtherReportablesNet = toNumber(
      row.moving_average_3w_other_reportables_net,
    );
    const movingAverage6wOtherReportablesNet = toNumber(
      row.moving_average_6w_other_reportables_net,
    );
    const movingAverage12wOtherReportablesNet = toNumber(
      row.moving_average_12w_other_reportables_net,
    );

    const movingAverage3wNonReportablesNet = toNumber(
      row.moving_average_3w_non_reportables_net,
    );
    const movingAverage6wNonReportablesNet = toNumber(
      row.moving_average_6w_non_reportables_net,
    );
    const movingAverage12wNonReportablesNet = toNumber(
      row.moving_average_12w_non_reportables_net,
    );

    const currentVs3wMaOpenInterest =
      movingAverage3wOpenInterest === null
        ? null
        : currentOpenInterest - movingAverage3wOpenInterest;
    const currentVs6wMaOpenInterest =
      movingAverage6wOpenInterest === null
        ? null
        : currentOpenInterest - movingAverage6wOpenInterest;
    const currentVs12wMaOpenInterest =
      movingAverage12wOpenInterest === null
        ? null
        : currentOpenInterest - movingAverage12wOpenInterest;

    const currentVs3wMaDealerNet =
      movingAverage3wDealerNet === null
        ? null
        : currentDealerNet - movingAverage3wDealerNet;
    const currentVs6wMaDealerNet =
      movingAverage6wDealerNet === null
        ? null
        : currentDealerNet - movingAverage6wDealerNet;
    const currentVs12wMaDealerNet =
      movingAverage12wDealerNet === null
        ? null
        : currentDealerNet - movingAverage12wDealerNet;

    const currentVs3wMaAssetManagerNet =
      movingAverage3wAssetManagerNet === null
        ? null
        : currentAssetManagerNet - movingAverage3wAssetManagerNet;
    const currentVs6wMaAssetManagerNet =
      movingAverage6wAssetManagerNet === null
        ? null
        : currentAssetManagerNet - movingAverage6wAssetManagerNet;
    const currentVs12wMaAssetManagerNet =
      movingAverage12wAssetManagerNet === null
        ? null
        : currentAssetManagerNet - movingAverage12wAssetManagerNet;

    const currentVs3wMaLeveragedMoneyNet =
      movingAverage3wLeveragedMoneyNet === null
        ? null
        : currentLeveragedMoneyNet - movingAverage3wLeveragedMoneyNet;
    const currentVs6wMaLeveragedMoneyNet =
      movingAverage6wLeveragedMoneyNet === null
        ? null
        : currentLeveragedMoneyNet - movingAverage6wLeveragedMoneyNet;
    const currentVs12wMaLeveragedMoneyNet =
      movingAverage12wLeveragedMoneyNet === null
        ? null
        : currentLeveragedMoneyNet - movingAverage12wLeveragedMoneyNet;

    const currentVs3wMaOtherReportablesNet =
      movingAverage3wOtherReportablesNet === null
        ? null
        : currentOtherReportablesNet - movingAverage3wOtherReportablesNet;
    const currentVs6wMaOtherReportablesNet =
      movingAverage6wOtherReportablesNet === null
        ? null
        : currentOtherReportablesNet - movingAverage6wOtherReportablesNet;
    const currentVs12wMaOtherReportablesNet =
      movingAverage12wOtherReportablesNet === null
        ? null
        : currentOtherReportablesNet - movingAverage12wOtherReportablesNet;

    const currentVs3wMaNonReportablesNet =
      movingAverage3wNonReportablesNet === null
        ? null
        : currentNonReportablesNet - movingAverage3wNonReportablesNet;
    const currentVs6wMaNonReportablesNet =
      movingAverage6wNonReportablesNet === null
        ? null
        : currentNonReportablesNet - movingAverage6wNonReportablesNet;
    const currentVs12wMaNonReportablesNet =
      movingAverage12wNonReportablesNet === null
        ? null
        : currentNonReportablesNet - movingAverage12wNonReportablesNet;

    await client.query(
      `
        INSERT INTO current.cftc_euro_fx (
          indicator,
          series_id,

          current_open_interest,

          current_dealer_net,
          current_asset_manager_net,
          current_leveraged_money_net,
          current_other_reportables_net,
          current_non_reportables_net,

          previous_week_open_interest,

          previous_week_dealer_net,
          previous_week_asset_manager_net,
          previous_week_leveraged_money_net,
          previous_week_other_reportables_net,
          previous_week_non_reportables_net,

          open_interest_net_change,
          dealer_net_change,
          asset_manager_net_change,
          leveraged_money_net_change,
          other_reportables_net_change,
          non_reportables_net_change,

          open_interest_percent_change,
          dealer_net_percent_change,
          asset_manager_net_percent_change,
          leveraged_money_net_percent_change,
          other_reportables_net_percent_change,
          non_reportables_net_percent_change,

          moving_average_3w_open_interest,
          current_vs_3w_ma_open_interest,
          moving_average_6w_open_interest,
          current_vs_6w_ma_open_interest,
          moving_average_12w_open_interest,
          current_vs_12w_ma_open_interest,

          moving_average_3w_dealer_net,
          current_vs_3w_ma_dealer_net,
          moving_average_6w_dealer_net,
          current_vs_6w_ma_dealer_net,
          moving_average_12w_dealer_net,
          current_vs_12w_ma_dealer_net,

          moving_average_3w_asset_manager_net,
          current_vs_3w_ma_asset_manager_net,
          moving_average_6w_asset_manager_net,
          current_vs_6w_ma_asset_manager_net,
          moving_average_12w_asset_manager_net,
          current_vs_12w_ma_asset_manager_net,

          moving_average_3w_leveraged_money_net,
          current_vs_3w_ma_leveraged_money_net,
          moving_average_6w_leveraged_money_net,
          current_vs_6w_ma_leveraged_money_net,
          moving_average_12w_leveraged_money_net,
          current_vs_12w_ma_leveraged_money_net,

          moving_average_3w_other_reportables_net,
          current_vs_3w_ma_other_reportables_net,
          moving_average_6w_other_reportables_net,
          current_vs_6w_ma_other_reportables_net,
          moving_average_12w_other_reportables_net,
          current_vs_12w_ma_other_reportables_net,

          moving_average_3w_non_reportables_net,
          current_vs_3w_ma_non_reportables_net,
          moving_average_6w_non_reportables_net,
          current_vs_6w_ma_non_reportables_net,
          moving_average_12w_non_reportables_net,
          current_vs_12w_ma_non_reportables_net,

          contract,
          commodity,
          subgroup,

          observed_at
        )
        VALUES (
          $1, $2,

          $3,

          $4, $5, $6, $7, $8,

          $9,

          $10, $11, $12, $13, $14,

          $15, $16, $17, $18, $19, $20,

          $21, $22, $23, $24, $25, $26,

          $27, $28,
          $29, $30,
          $31, $32,

          $33, $34,
          $35, $36,
          $37, $38,

          $39, $40,
          $41, $42,
          $43, $44,

          $45, $46,
          $47, $48,
          $49, $50,

          $51, $52,
          $53, $54,
          $55, $56,

          $57, $58,
          $59, $60,
          $61, $62,

          $63, $64,
          $65, $66
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_open_interest = EXCLUDED.current_open_interest,

          current_dealer_net = EXCLUDED.current_dealer_net,
          current_asset_manager_net = EXCLUDED.current_asset_manager_net,
          current_leveraged_money_net = EXCLUDED.current_leveraged_money_net,
          current_other_reportables_net = EXCLUDED.current_other_reportables_net,
          current_non_reportables_net = EXCLUDED.current_non_reportables_net,

          previous_week_open_interest = EXCLUDED.previous_week_open_interest,

          previous_week_dealer_net = EXCLUDED.previous_week_dealer_net,
          previous_week_asset_manager_net = EXCLUDED.previous_week_asset_manager_net,
          previous_week_leveraged_money_net = EXCLUDED.previous_week_leveraged_money_net,
          previous_week_other_reportables_net = EXCLUDED.previous_week_other_reportables_net,
          previous_week_non_reportables_net = EXCLUDED.previous_week_non_reportables_net,

          open_interest_net_change = EXCLUDED.open_interest_net_change,
          dealer_net_change = EXCLUDED.dealer_net_change,
          asset_manager_net_change = EXCLUDED.asset_manager_net_change,
          leveraged_money_net_change = EXCLUDED.leveraged_money_net_change,
          other_reportables_net_change = EXCLUDED.other_reportables_net_change,
          non_reportables_net_change = EXCLUDED.non_reportables_net_change,

          open_interest_percent_change = EXCLUDED.open_interest_percent_change,
          dealer_net_percent_change = EXCLUDED.dealer_net_percent_change,
          asset_manager_net_percent_change = EXCLUDED.asset_manager_net_percent_change,
          leveraged_money_net_percent_change = EXCLUDED.leveraged_money_net_percent_change,
          other_reportables_net_percent_change = EXCLUDED.other_reportables_net_percent_change,
          non_reportables_net_percent_change = EXCLUDED.non_reportables_net_percent_change,

          moving_average_3w_open_interest = EXCLUDED.moving_average_3w_open_interest,
          current_vs_3w_ma_open_interest = EXCLUDED.current_vs_3w_ma_open_interest,
          moving_average_6w_open_interest = EXCLUDED.moving_average_6w_open_interest,
          current_vs_6w_ma_open_interest = EXCLUDED.current_vs_6w_ma_open_interest,
          moving_average_12w_open_interest = EXCLUDED.moving_average_12w_open_interest,
          current_vs_12w_ma_open_interest = EXCLUDED.current_vs_12w_ma_open_interest,

          moving_average_3w_dealer_net = EXCLUDED.moving_average_3w_dealer_net,
          current_vs_3w_ma_dealer_net = EXCLUDED.current_vs_3w_ma_dealer_net,
          moving_average_6w_dealer_net = EXCLUDED.moving_average_6w_dealer_net,
          current_vs_6w_ma_dealer_net = EXCLUDED.current_vs_6w_ma_dealer_net,
          moving_average_12w_dealer_net = EXCLUDED.moving_average_12w_dealer_net,
          current_vs_12w_ma_dealer_net = EXCLUDED.current_vs_12w_ma_dealer_net,

          moving_average_3w_asset_manager_net = EXCLUDED.moving_average_3w_asset_manager_net,
          current_vs_3w_ma_asset_manager_net = EXCLUDED.current_vs_3w_ma_asset_manager_net,
          moving_average_6w_asset_manager_net = EXCLUDED.moving_average_6w_asset_manager_net,
          current_vs_6w_ma_asset_manager_net = EXCLUDED.current_vs_6w_ma_asset_manager_net,
          moving_average_12w_asset_manager_net = EXCLUDED.moving_average_12w_asset_manager_net,
          current_vs_12w_ma_asset_manager_net = EXCLUDED.current_vs_12w_ma_asset_manager_net,

          moving_average_3w_leveraged_money_net = EXCLUDED.moving_average_3w_leveraged_money_net,
          current_vs_3w_ma_leveraged_money_net = EXCLUDED.current_vs_3w_ma_leveraged_money_net,
          moving_average_6w_leveraged_money_net = EXCLUDED.moving_average_6w_leveraged_money_net,
          current_vs_6w_ma_leveraged_money_net = EXCLUDED.current_vs_6w_ma_leveraged_money_net,
          moving_average_12w_leveraged_money_net = EXCLUDED.moving_average_12w_leveraged_money_net,
          current_vs_12w_ma_leveraged_money_net = EXCLUDED.current_vs_12w_ma_leveraged_money_net,

          moving_average_3w_other_reportables_net = EXCLUDED.moving_average_3w_other_reportables_net,
          current_vs_3w_ma_other_reportables_net = EXCLUDED.current_vs_3w_ma_other_reportables_net,
          moving_average_6w_other_reportables_net = EXCLUDED.moving_average_6w_other_reportables_net,
          current_vs_6w_ma_other_reportables_net = EXCLUDED.current_vs_6w_ma_other_reportables_net,
          moving_average_12w_other_reportables_net = EXCLUDED.moving_average_12w_other_reportables_net,
          current_vs_12w_ma_other_reportables_net = EXCLUDED.current_vs_12w_ma_other_reportables_net,

          moving_average_3w_non_reportables_net = EXCLUDED.moving_average_3w_non_reportables_net,
          current_vs_3w_ma_non_reportables_net = EXCLUDED.current_vs_3w_ma_non_reportables_net,
          moving_average_6w_non_reportables_net = EXCLUDED.moving_average_6w_non_reportables_net,
          current_vs_6w_ma_non_reportables_net = EXCLUDED.current_vs_6w_ma_non_reportables_net,
          moving_average_12w_non_reportables_net = EXCLUDED.moving_average_12w_non_reportables_net,
          current_vs_12w_ma_non_reportables_net = EXCLUDED.current_vs_12w_ma_non_reportables_net,

          contract = EXCLUDED.contract,
          commodity = EXCLUDED.commodity,
          subgroup = EXCLUDED.subgroup,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        "cftc_euro_fx",
        "cftc_euro_fx",

        currentOpenInterest,

        currentDealerNet,
        currentAssetManagerNet,
        currentLeveragedMoneyNet,
        currentOtherReportablesNet,
        currentNonReportablesNet,

        previousWeekOpenInterest,

        previousWeekDealerNet,
        previousWeekAssetManagerNet,
        previousWeekLeveragedMoneyNet,
        previousWeekOtherReportablesNet,
        previousWeekNonReportablesNet,

        openInterestNetChange,
        dealerNetChange,
        assetManagerNetChange,
        leveragedMoneyNetChange,
        otherReportablesNetChange,
        nonReportablesNetChange,

        openInterestPercentChange,
        dealerNetPercentChange,
        assetManagerNetPercentChange,
        leveragedMoneyNetPercentChange,
        otherReportablesNetPercentChange,
        nonReportablesNetPercentChange,

        movingAverage3wOpenInterest,
        currentVs3wMaOpenInterest,
        movingAverage6wOpenInterest,
        currentVs6wMaOpenInterest,
        movingAverage12wOpenInterest,
        currentVs12wMaOpenInterest,

        movingAverage3wDealerNet,
        currentVs3wMaDealerNet,
        movingAverage6wDealerNet,
        currentVs6wMaDealerNet,
        movingAverage12wDealerNet,
        currentVs12wMaDealerNet,

        movingAverage3wAssetManagerNet,
        currentVs3wMaAssetManagerNet,
        movingAverage6wAssetManagerNet,
        currentVs6wMaAssetManagerNet,
        movingAverage12wAssetManagerNet,
        currentVs12wMaAssetManagerNet,

        movingAverage3wLeveragedMoneyNet,
        currentVs3wMaLeveragedMoneyNet,
        movingAverage6wLeveragedMoneyNet,
        currentVs6wMaLeveragedMoneyNet,
        movingAverage12wLeveragedMoneyNet,
        currentVs12wMaLeveragedMoneyNet,

        movingAverage3wOtherReportablesNet,
        currentVs3wMaOtherReportablesNet,
        movingAverage6wOtherReportablesNet,
        currentVs6wMaOtherReportablesNet,
        movingAverage12wOtherReportablesNet,
        currentVs12wMaOtherReportablesNet,

        movingAverage3wNonReportablesNet,
        currentVs3wMaNonReportablesNet,
        movingAverage6wNonReportablesNet,
        currentVs6wMaNonReportablesNet,
        movingAverage12wNonReportablesNet,
        currentVs12wMaNonReportablesNet,

        currentObservation.contract,
        currentObservation.commodity,
        currentObservation.subgroup,

        currentObservation.date,
      ],
    );

    await client.query("COMMIT");

    console.log("✓ CFTC CFTC Euro FX current injection complete");

    return {
      indicator: "cftc_euro_fx",
      seriesId: "cftc_euro_fx",

      currentOpenInterest,
      currentDealerNet,
      currentAssetManagerNet,
      currentLeveragedMoneyNet,
      currentOtherReportablesNet,
      currentNonReportablesNet,

      previousWeekOpenInterest,
      previousWeekDealerNet,
      previousWeekAssetManagerNet,
      previousWeekLeveragedMoneyNet,
      previousWeekOtherReportablesNet,
      previousWeekNonReportablesNet,

      openInterestNetChange,
      dealerNetChange,
      assetManagerNetChange,
      leveragedMoneyNetChange,
      otherReportablesNetChange,
      nonReportablesNetChange,

      openInterestPercentChange,
      dealerNetPercentChange,
      assetManagerNetPercentChange,
      leveragedMoneyNetPercentChange,
      otherReportablesNetPercentChange,
      nonReportablesNetPercentChange,

      movingAverage3wOpenInterest,
      currentVs3wMaOpenInterest,
      movingAverage6wOpenInterest,
      currentVs6wMaOpenInterest,
      movingAverage12wOpenInterest,
      currentVs12wMaOpenInterest,

      movingAverage3wDealerNet,
      currentVs3wMaDealerNet,
      movingAverage6wDealerNet,
      currentVs6wMaDealerNet,
      movingAverage12wDealerNet,
      currentVs12wMaDealerNet,

      movingAverage3wAssetManagerNet,
      currentVs3wMaAssetManagerNet,
      movingAverage6wAssetManagerNet,
      currentVs6wMaAssetManagerNet,
      movingAverage12wAssetManagerNet,
      currentVs12wMaAssetManagerNet,

      movingAverage3wLeveragedMoneyNet,
      currentVs3wMaLeveragedMoneyNet,
      movingAverage6wLeveragedMoneyNet,
      currentVs6wMaLeveragedMoneyNet,
      movingAverage12wLeveragedMoneyNet,
      currentVs12wMaLeveragedMoneyNet,

      movingAverage3wOtherReportablesNet,
      currentVs3wMaOtherReportablesNet,
      movingAverage6wOtherReportablesNet,
      currentVs6wMaOtherReportablesNet,
      movingAverage12wOtherReportablesNet,
      currentVs12wMaOtherReportablesNet,

      movingAverage3wNonReportablesNet,
      currentVs3wMaNonReportablesNet,
      movingAverage6wNonReportablesNet,
      currentVs6wMaNonReportablesNet,
      movingAverage12wNonReportablesNet,
      currentVs12wMaNonReportablesNet,

      observedAt: currentObservation.date,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
