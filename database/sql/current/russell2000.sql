CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.russell_2000 (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_open NUMERIC NOT NULL,
    current_close NUMERIC NOT NULL,
    current_change NUMERIC NOT NULL,
    current_change_percent NUMERIC NOT NULL,

    previous_day_close NUMERIC NOT NULL,

    close_net_change NUMERIC NOT NULL,
    close_percent_change NUMERIC NOT NULL,

    moving_average_30d NUMERIC,
    current_vs_30d_ma NUMERIC,

    moving_average_6month NUMERIC,
    current_vs_6month_ma NUMERIC,

    moving_average_12month NUMERIC,
    current_vs_12month_ma NUMERIC,

    symbol TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_russell_2000_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
