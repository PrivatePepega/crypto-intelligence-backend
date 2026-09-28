CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.doge_spot_etf (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_net_flow NUMERIC NOT NULL,
    current_value_traded NUMERIC NOT NULL,
    current_net_assets NUMERIC NOT NULL,
    current_cumulative_net_flow NUMERIC NOT NULL,

    previous_day_net_flow NUMERIC,
    previous_day_value_traded NUMERIC,
    previous_day_net_assets NUMERIC,
    previous_day_cumulative_net_flow NUMERIC,

    net_flow_net_change NUMERIC,
    net_flow_percent_change NUMERIC,

    value_traded_net_change NUMERIC,
    value_traded_percent_change NUMERIC,

    net_assets_net_change NUMERIC,
    net_assets_percent_change NUMERIC,

    cumulative_net_flow_net_change NUMERIC,
    cumulative_net_flow_percent_change NUMERIC,

    moving_average_30d_net_flow NUMERIC,
    current_vs_30d_ma_net_flow NUMERIC,

    moving_average_30d_value_traded NUMERIC,
    current_vs_30d_ma_value_traded NUMERIC,

    moving_average_30d_net_assets NUMERIC,
    current_vs_30d_ma_net_assets NUMERIC,

    moving_average_30d_cumulative_net_flow NUMERIC,
    current_vs_30d_ma_cumulative_net_flow NUMERIC,

    asset TEXT NOT NULL,
    country_code TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_doge_spot_etf_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
