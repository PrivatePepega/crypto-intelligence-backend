import pool from "../../../config/database.js";
import type { CftcTffObservation } from "../../../types/cftc/ctfc.types.js";
import { isCftcObservationComplete } from "../cftcObservation.js";

const UST_10Y_NOTE_CONTRACT = "UST 10Y NOTE";

type CftcUst10yNoteData = {
  indicator: string;
  observations: CftcTffObservation[];
};

export const injectCftcUst10yNoteFull = async (data: CftcUst10yNoteData) => {
  console.log("→ CFTC CFTC UST 10Y Note historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // The CFTC response is a flat array covering every tracked market, and
    // every row carries indicator "cftc_tff", so contract is the only field
    // that distinguishes the 10-Year U.S. Treasury Note.
    const observations = data.observations.filter(
      (observation) => observation.contract === UST_10Y_NOTE_CONTRACT,
    );

    // A contract-string mismatch would otherwise commit an empty transaction
    // and still log "complete", so fail loudly instead.
    if (observations.length === 0) {
      throw new Error(
        `No CFTC observations matched contract "${UST_10Y_NOTE_CONTRACT}"`,
      );
    }

    for (const observation of observations) {
      if (!isCftcObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.cftc_ust_10y_note (
            date,
            series_id,
            contract,
            commodity,
            subgroup,
            open_interest,

            dealer_long,
            dealer_short,
            dealer_spread,
            dealer_net,

            asset_manager_long,
            asset_manager_short,
            asset_manager_spread,
            asset_manager_net,

            leveraged_money_long,
            leveraged_money_short,
            leveraged_money_spread,
            leveraged_money_net,

            other_reportables_long,
            other_reportables_short,
            other_reportables_spread,
            other_reportables_net,

            non_reportables_long,
            non_reportables_short,
            non_reportables_net
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22,
            $23, $24, $25
          )
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            contract = EXCLUDED.contract,
            commodity = EXCLUDED.commodity,
            subgroup = EXCLUDED.subgroup,
            open_interest = EXCLUDED.open_interest,

            dealer_long = EXCLUDED.dealer_long,
            dealer_short = EXCLUDED.dealer_short,
            dealer_spread = EXCLUDED.dealer_spread,
            dealer_net = EXCLUDED.dealer_net,

            asset_manager_long = EXCLUDED.asset_manager_long,
            asset_manager_short = EXCLUDED.asset_manager_short,
            asset_manager_spread = EXCLUDED.asset_manager_spread,
            asset_manager_net = EXCLUDED.asset_manager_net,

            leveraged_money_long = EXCLUDED.leveraged_money_long,
            leveraged_money_short = EXCLUDED.leveraged_money_short,
            leveraged_money_spread = EXCLUDED.leveraged_money_spread,
            leveraged_money_net = EXCLUDED.leveraged_money_net,

            other_reportables_long = EXCLUDED.other_reportables_long,
            other_reportables_short = EXCLUDED.other_reportables_short,
            other_reportables_spread = EXCLUDED.other_reportables_spread,
            other_reportables_net = EXCLUDED.other_reportables_net,

            non_reportables_long = EXCLUDED.non_reportables_long,
            non_reportables_short = EXCLUDED.non_reportables_short,
            non_reportables_net = EXCLUDED.non_reportables_net
        `,
        [
          observation.date,
          "cftc_ust_10y",
          observation.contract,
          observation.commodity,
          observation.subgroup,
          observation.openInterest,

          observation.dealer.long,
          observation.dealer.short,
          observation.dealer.spread,
          observation.dealer.net,

          observation.assetManager.long,
          observation.assetManager.short,
          observation.assetManager.spread,
          observation.assetManager.net,

          observation.leveragedMoney.long,
          observation.leveragedMoney.short,
          observation.leveragedMoney.spread,
          observation.leveragedMoney.net,

          observation.otherReportables.long,
          observation.otherReportables.short,
          observation.otherReportables.spread,
          observation.otherReportables.net,

          observation.nonReportables.long,
          observation.nonReportables.short,
          observation.nonReportables.net,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ CFTC CFTC UST 10Y Note historical injection complete — ${observations.length} observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
