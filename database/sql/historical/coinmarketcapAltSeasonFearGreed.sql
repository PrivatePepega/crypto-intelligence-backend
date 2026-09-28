CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.coinmarketcap_alt_season_fear_greed (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    index_value NUMERIC NOT NULL,
    altcoin_market_cap NUMERIC NOT NULL,

    source TEXT NOT NULL,

    CONSTRAINT fk_coinmarketcap_alt_season_fear_greed_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
