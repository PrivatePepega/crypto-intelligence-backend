CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.cnn_market_volatility_vix_50 (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    value NUMERIC NOT NULL,
    rating TEXT NOT NULL,

    CONSTRAINT fk_cnn_market_volatility_vix_50_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
