CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.nzd_usd (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_open NUMERIC NOT NULL,
    current_high NUMERIC NOT NULL,
    current_low NUMERIC NOT NULL,
    current_close NUMERIC NOT NULL,

    previous_close NUMERIC NOT NULL,
    net_change NUMERIC NOT NULL,
    percent_change NUMERIC NOT NULL,

    daily_range NUMERIC NOT NULL,

    moving_average_30d NUMERIC,
    current_vs_30d_ma NUMERIC,

    moving_average_6month NUMERIC,
    current_vs_6month_ma NUMERIC,

    moving_average_12month NUMERIC,
    current_vs_12month_ma NUMERIC,

    pair TEXT NOT NULL,
    interval TEXT NOT NULL,
    timing TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_nzd_usd_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
