CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.alternative_fear_greed (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_value NUMERIC NOT NULL,
    current_classification TEXT NOT NULL,

    previous_day_value NUMERIC,
    previous_day_classification TEXT,

    net_change NUMERIC,
    percent_change NUMERIC,

    moving_average_30d NUMERIC,
    current_vs_30d_ma NUMERIC,

    moving_average_6month NUMERIC,
    current_vs_6month_ma NUMERIC,

    moving_average_12month NUMERIC,
    current_vs_12month_ma NUMERIC,

    source TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_alternative_fear_greed_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
