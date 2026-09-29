CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.cnn_stock_price_breadth (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_value NUMERIC NOT NULL,
    current_rating TEXT NOT NULL,

    previous_day_value NUMERIC NOT NULL,
    previous_day_rating TEXT NOT NULL,

    net_change NUMERIC NOT NULL,
    percent_change NUMERIC NOT NULL,

    moving_average_30d NUMERIC,
    current_vs_30d_ma NUMERIC,

    moving_average_6month NUMERIC,
    current_vs_6month_ma NUMERIC,

    moving_average_12month NUMERIC,
    current_vs_12month_ma NUMERIC,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cnn_stock_price_breadth_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
