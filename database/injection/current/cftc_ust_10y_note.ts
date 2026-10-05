import pool from "../../../config/database.js";
import type { CftcTffObservation } from "../../../types/cftc/ctfc.types.js";

const UST_10Y_NOTE_CONTRACT = "UST 10Y NOTE";

type CftcUst10yNoteData = {
  indicator: string;
  observations: CftcTffObservation[];
};

export const injectCftcUst10yNoteLatest = async (data: CftcUst10yNoteData) => {
  console.log("→ CFTC CFTC UST 10Y Note current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // CFTC requests are ordered by report_date desc, so the first UST 10Y NOTE
    // match is the most recent week. This is the opposite of the ascending
    // AAII/CNN payloads.
    const currentObservation = data.observations.find(
      (observation) => observation.contract === UST_10Y_NOTE_CONTRACT,
    );

    if (!currentObservation) {
      throw new Error("No CFTC CFTC UST 10Y Note observation found");
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
        FROM historical.cftc_ust_10y_note
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previous = previousResult.rows[0];

    if (!previous) {
      throw new Error("No previous CFTC CFTC UST 10Y Note observation found");
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
      throw new Error("Previous CFTC CFTC UST 10Y Note values are invalid");
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
      moving_average_30d_open_interest: string | null;
      moving_average_30d_dealer_net: string | null;
      moving_average_30d_asset_manager_net: string | null;
      moving_average_30d_leveraged_money_net: string | null;
      moving_average_30d_other_reportables_net: string | null;
      moving_average_30d_non_reportables_net: string | null;
    }>(
      `
        SELECT
          AVG(open_interest) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_open_interest,

          AVG(dealer_net) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_dealer_net,

          AVG(asset_manager_net) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_asset_manager_net,

          AVG(leveraged_money_net) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_leveraged_money_net,

          AVG(other_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_other_reportables_net,

          AVG(non_reportables_net) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_non_reportables_net

        FROM historical.cftc_ust_10y_note
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No CFTC CFTC UST 10Y Note moving-average data found");
    }

    const toNumber = (value: string | null) =>
      value === null ? null : Number(value);

    const movingAverage30dOpenInterest = toNumber(
      row.moving_average_30d_open_interest,
    );

    const movingAverage30dDealerNet = toNumber(
      row.moving_average_30d_dealer_net,
    );

    const movingAverage30dAssetManagerNet = toNumber(
      row.moving_average_30d_asset_manager_net,
    );

    const movingAverage30dLeveragedMoneyNet = toNumber(
      row.moving_average_30d_leveraged_money_net,
    );

    const movingAverage30dOtherReportablesNet = toNumber(
      row.moving_average_30d_other_reportables_net,
    );

    const movingAverage30dNonReportablesNet = toNumber(
      row.moving_average_30d_non_reportables_net,
    );

    const currentVs30dMaOpenInterest =
      movingAverage30dOpenInterest === null
        ? null
        : currentOpenInterest - movingAverage30dOpenInterest;

    const currentVs30dMaDealerNet =
      movingAverage30dDealerNet === null
        ? null
        : currentDealerNet - movingAverage30dDealerNet;

    const currentVs30dMaAssetManagerNet =
      movingAverage30dAssetManagerNet === null
        ? null
        : currentAssetManagerNet - movingAverage30dAssetManagerNet;

    const currentVs30dMaLeveragedMoneyNet =
      movingAverage30dLeveragedMoneyNet === null
        ? null
        : currentLeveragedMoneyNet - movingAverage30dLeveragedMoneyNet;

    const currentVs30dMaOtherReportablesNet =
      movingAverage30dOtherReportablesNet === null
        ? null
        : currentOtherReportablesNet - movingAverage30dOtherReportablesNet;

    const currentVs30dMaNonReportablesNet =
      movingAverage30dNonReportablesNet === null
        ? null
        : currentNonReportablesNet - movingAverage30dNonReportablesNet;

    await client.query(
      `
        INSERT INTO current.cftc_ust_10y_note (
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
          moving_average_30d_open_interest,
          current_vs_30d_ma_open_interest,
          moving_average_30d_dealer_net,
          current_vs_30d_ma_dealer_net,
          moving_average_30d_asset_manager_net,
          current_vs_30d_ma_asset_manager_net,
          moving_average_30d_leveraged_money_net,
          current_vs_30d_ma_leveraged_money_net,
          moving_average_30d_other_reportables_net,
          current_vs_30d_ma_other_reportables_net,
          moving_average_30d_non_reportables_net,
          current_vs_30d_ma_non_reportables_net,
          contract,
          commodity,
          subgroup,
          observed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29,
          $30,
          $31,
          $32,
          $33,
          $34,
          $35,
          $36,
          $37,
          $38,
          $39,
          $40,
          $41,
          $42
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

          moving_average_30d_open_interest = EXCLUDED.moving_average_30d_open_interest,
          current_vs_30d_ma_open_interest = EXCLUDED.current_vs_30d_ma_open_interest,

          moving_average_30d_dealer_net = EXCLUDED.moving_average_30d_dealer_net,
          current_vs_30d_ma_dealer_net = EXCLUDED.current_vs_30d_ma_dealer_net,

          moving_average_30d_asset_manager_net = EXCLUDED.moving_average_30d_asset_manager_net,
          current_vs_30d_ma_asset_manager_net = EXCLUDED.current_vs_30d_ma_asset_manager_net,

          moving_average_30d_leveraged_money_net = EXCLUDED.moving_average_30d_leveraged_money_net,
          current_vs_30d_ma_leveraged_money_net = EXCLUDED.current_vs_30d_ma_leveraged_money_net,

          moving_average_30d_other_reportables_net = EXCLUDED.moving_average_30d_other_reportables_net,
          current_vs_30d_ma_other_reportables_net = EXCLUDED.current_vs_30d_ma_other_reportables_net,

          moving_average_30d_non_reportables_net = EXCLUDED.moving_average_30d_non_reportables_net,
          current_vs_30d_ma_non_reportables_net = EXCLUDED.current_vs_30d_ma_non_reportables_net,

          contract = EXCLUDED.contract,
          commodity = EXCLUDED.commodity,
          subgroup = EXCLUDED.subgroup,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        "cftc_ust_10y",
        "cftc_ust_10y",

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

        movingAverage30dOpenInterest,
        currentVs30dMaOpenInterest,

        movingAverage30dDealerNet,
        currentVs30dMaDealerNet,

        movingAverage30dAssetManagerNet,
        currentVs30dMaAssetManagerNet,

        movingAverage30dLeveragedMoneyNet,
        currentVs30dMaLeveragedMoneyNet,

        movingAverage30dOtherReportablesNet,
        currentVs30dMaOtherReportablesNet,

        movingAverage30dNonReportablesNet,
        currentVs30dMaNonReportablesNet,

        currentObservation.contract,
        currentObservation.commodity,
        currentObservation.subgroup,

        currentObservation.date,
      ],
    );

    await client.query("COMMIT");

    console.log("✓ CFTC CFTC UST 10Y Note current injection complete");

    return {
      indicator: "cftc_ust_10y",
      seriesId: "cftc_ust_10y",

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

      movingAverage30dOpenInterest,
      currentVs30dMaOpenInterest,

      movingAverage30dDealerNet,
      currentVs30dMaDealerNet,

      movingAverage30dAssetManagerNet,
      currentVs30dMaAssetManagerNet,

      movingAverage30dLeveragedMoneyNet,
      currentVs30dMaLeveragedMoneyNet,

      movingAverage30dOtherReportablesNet,
      currentVs30dMaOtherReportablesNet,

      movingAverage30dNonReportablesNet,
      currentVs30dMaNonReportablesNet,

      observedAt: currentObservation.date,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
