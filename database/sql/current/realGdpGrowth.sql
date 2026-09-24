CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.real_gdp_growth (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_value NUMERIC NOT NULL,
    previous_quarter_value NUMERIC NOT NULL,

    net_change NUMERIC NOT NULL,

    moving_average_3q NUMERIC,
    current_vs_3q_ma NUMERIC,

    moving_average_6q NUMERIC,
    current_vs_6q_ma NUMERIC,

    moving_average_12q NUMERIC,
    current_vs_12q_ma NUMERIC,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_real_gdp_growth_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);