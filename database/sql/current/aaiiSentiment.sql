CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.aaii_sentiment (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_bullish NUMERIC NOT NULL,
    current_neutral NUMERIC NOT NULL,
    current_bearish NUMERIC NOT NULL,
    current_bull_bear_spread NUMERIC NOT NULL,

    previous_week_bullish NUMERIC NOT NULL,
    previous_week_neutral NUMERIC NOT NULL,
    previous_week_bearish NUMERIC NOT NULL,
    previous_week_bull_bear_spread NUMERIC NOT NULL,

    bullish_net_change NUMERIC NOT NULL,
    neutral_net_change NUMERIC NOT NULL,
    bearish_net_change NUMERIC NOT NULL,
    bull_bear_spread_net_change NUMERIC NOT NULL,

    bullish_percent_change NUMERIC NOT NULL,
    neutral_percent_change NUMERIC NOT NULL,
    bearish_percent_change NUMERIC NOT NULL,
    bull_bear_spread_percent_change NUMERIC NOT NULL,

    moving_average_30d_bullish NUMERIC,
    current_vs_30d_ma_bullish NUMERIC,

    moving_average_30d_neutral NUMERIC,
    current_vs_30d_ma_neutral NUMERIC,

    moving_average_30d_bearish NUMERIC,
    current_vs_30d_ma_bearish NUMERIC,

    moving_average_30d_bull_bear_spread NUMERIC,
    current_vs_30d_ma_bull_bear_spread NUMERIC,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_aaii_sentiment_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
