CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.gbp_usd (
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

    moving_average_3d NUMERIC,
    current_vs_3d_ma NUMERIC,

    moving_average_6d NUMERIC,
    current_vs_6d_ma NUMERIC,

    moving_average_12d NUMERIC,
    current_vs_12d_ma NUMERIC,

    pair TEXT NOT NULL,
    interval TEXT NOT NULL,
    timing TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_gbp_usd_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
