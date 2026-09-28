CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.btc_spot_etf (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    asset TEXT NOT NULL,
    country_code TEXT NOT NULL,

    net_flow NUMERIC NOT NULL,
    value_traded NUMERIC NOT NULL,
    net_assets NUMERIC NOT NULL,
    cumulative_net_flow NUMERIC NOT NULL,

    CONSTRAINT fk_btc_spot_etf_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
