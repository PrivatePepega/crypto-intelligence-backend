import pool from "../../config/database.js";
import {
  isBinanceDailyComplete,
  mergeBinanceDailyPositioning,
  selectBinancePositioningPayload,
  type BinancePositioningHistory,
  type BinancePositioningMarket,
} from "./binancePositioning.js";

export const injectBinancePositioningFull = async (
  market: BinancePositioningMarket,
  data: BinancePositioningHistory[],
) => {
  console.log(`→ ${market.label} historical injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // The collector returns one entry per trading symbol, so this market's
    // entry is selected by symbol and its six sub-source histories are merged
    // by date into one row per calendar day.
    const payload = selectBinancePositioningPayload(data, market.symbol);

    if (!payload) {
      throw new Error(`No Binance payload matched symbol "${market.symbol}"`);
    }

    const rows = mergeBinanceDailyPositioning(payload);

    if (rows.length === 0) {
      throw new Error(
        `No complete Binance ${market.symbol} days found; the six sub-sources may not overlap`,
      );
    }

    let inserted = 0;

    for (const row of rows) {
      if (!isBinanceDailyComplete(row)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.${market.table} (
            date,
            series_id,

            symbol,

            global_long_account,
            global_long_short_ratio,
            global_short_account,
            global_date,

            top_account_long_account,
            top_account_long_short_ratio,
            top_account_short_account,
            top_account_date,

            top_position_long_account,
            top_position_long_short_ratio,
            top_position_short_account,
            top_position_date,

            sum_open_interest,
            sum_open_interest_value,
            cmc_circulating_supply,
            open_interest_date,

            funding_rate,
            mark_price,
            funding_rate_type,
            funding_date,

            taker_buy_sell_ratio,
            taker_sell_volume,
            taker_buy_volume,
            taker_date
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
            $27
          )
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,

            symbol = EXCLUDED.symbol,

            global_long_account = EXCLUDED.global_long_account,
            global_long_short_ratio = EXCLUDED.global_long_short_ratio,
            global_short_account = EXCLUDED.global_short_account,
            global_date = EXCLUDED.global_date,

            top_account_long_account = EXCLUDED.top_account_long_account,
            top_account_long_short_ratio = EXCLUDED.top_account_long_short_ratio,
            top_account_short_account = EXCLUDED.top_account_short_account,
            top_account_date = EXCLUDED.top_account_date,

            top_position_long_account = EXCLUDED.top_position_long_account,
            top_position_long_short_ratio = EXCLUDED.top_position_long_short_ratio,
            top_position_short_account = EXCLUDED.top_position_short_account,
            top_position_date = EXCLUDED.top_position_date,

            sum_open_interest = EXCLUDED.sum_open_interest,
            sum_open_interest_value = EXCLUDED.sum_open_interest_value,
            cmc_circulating_supply = EXCLUDED.cmc_circulating_supply,
            open_interest_date = EXCLUDED.open_interest_date,

            funding_rate = EXCLUDED.funding_rate,
            mark_price = EXCLUDED.mark_price,
            funding_rate_type = EXCLUDED.funding_rate_type,
            funding_date = EXCLUDED.funding_date,

            taker_buy_sell_ratio = EXCLUDED.taker_buy_sell_ratio,
            taker_sell_volume = EXCLUDED.taker_sell_volume,
            taker_buy_volume = EXCLUDED.taker_buy_volume,
            taker_date = EXCLUDED.taker_date
        `,
        [
          row.date,
          market.seriesId,
          row.symbol,

          row.globalLongAccount,
          row.globalLongShortRatio,
          row.globalShortAccount,
          row.globalDate,

          row.topAccountLongAccount,
          row.topAccountLongShortRatio,
          row.topAccountShortAccount,
          row.topAccountDate,

          row.topPositionLongAccount,
          row.topPositionLongShortRatio,
          row.topPositionShortAccount,
          row.topPositionDate,

          row.sumOpenInterest,
          row.sumOpenInterestValue,
          row.cmcCirculatingSupply,
          row.openInterestDate,

          row.fundingRate,
          row.markPrice,
          row.fundingRateType,
          row.fundingDate,

          row.takerBuySellRatio,
          row.takerSellVolume,
          row.takerBuyVolume,
          row.takerDate,
        ],
      );

      inserted += 1;
    }

    if (inserted === 0) {
      throw new Error(
        `No complete Binance ${market.symbol} rows to insert; every merged day had a non-numeric value`,
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ ${market.label} historical injection complete — ${inserted} of ${rows.length} days`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
