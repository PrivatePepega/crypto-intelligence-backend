CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.two_year_treasury_yield (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_value NUMERIC NOT NULL,
    previous_week_value NUMERIC NOT NULL,

    net_change NUMERIC NOT NULL,

    moving_average_30d NUMERIC,
    current_vs_30d_ma NUMERIC,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_two_year_treasury_yield_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);