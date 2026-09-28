import pool from "../../../config/database.js";
import {
  SPOT_ETF_COUNTRY_CODE,
  isSpotEtfObservationComplete,
  type SpotEtfMarket,
  type SpotEtfObservation,
} from "./spotEtf.js";

export const injectSpotEtfHistorical = async (
  market: SpotEtfMarket,
  observations: SpotEtfObservation[],
) => {
  console.log(`→ ${market.label} historical injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (observations.length === 0) {
      throw new Error(`No ${market.label} observations found`);
    }

    let inserted = 0;

    for (const observation of observations) {
      // Every metric column is NOT NULL, so skip a malformed day rather than
      // abort the whole transaction.
      if (!isSpotEtfObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.${market.table} (
            date,
            series_id,
            asset,
            country_code,
            net_flow,
            value_traded,
            net_assets,
            cumulative_net_flow
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            asset = EXCLUDED.asset,
            country_code = EXCLUDED.country_code,
            net_flow = EXCLUDED.net_flow,
            value_traded = EXCLUDED.value_traded,
            net_assets = EXCLUDED.net_assets,
            cumulative_net_flow = EXCLUDED.cumulative_net_flow
        `,
        [
          observation.date,
          market.seriesId,
          market.symbol,
          SPOT_ETF_COUNTRY_CODE,
          observation.netFlow,
          observation.valueTraded,
          observation.netAssets,
          observation.cumulativeNetFlow,
        ],
      );

      inserted += 1;
    }

    if (inserted === 0) {
      throw new Error(
        `No complete ${market.label} rows to insert; every observation had a non-numeric value`,
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ ${market.label} historical injection complete — ${inserted} of ${observations.length} days`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
