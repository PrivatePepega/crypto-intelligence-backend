CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.coinmarketcap_general_crypto_metric (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    total_market_cap NUMERIC NOT NULL,
    total_volume_24h NUMERIC NOT NULL,

    altcoin_market_cap NUMERIC NOT NULL,
    altcoin_volume_24h NUMERIC NOT NULL,

    btc_dominance NUMERIC NOT NULL,
    eth_dominance NUMERIC NOT NULL,

    defi_market_cap NUMERIC NOT NULL,
    defi_volume_24h NUMERIC NOT NULL,
    defi_24h_percentage_change NUMERIC NOT NULL,

    stablecoin_market_cap NUMERIC NOT NULL,
    stablecoin_volume_24h NUMERIC NOT NULL,
    stablecoin_24h_percentage_change NUMERIC NOT NULL,

    derivatives_volume_24h NUMERIC NOT NULL,
    derivatives_24h_percentage_change NUMERIC NOT NULL,

    total_market_cap_yesterday NUMERIC NOT NULL,
    total_volume_24h_yesterday NUMERIC NOT NULL,

    total_market_cap_yesterday_percentage_change NUMERIC NOT NULL,
    total_volume_24h_yesterday_percentage_change NUMERIC NOT NULL,

    active_cryptocurrencies INTEGER NOT NULL,
    active_market_pairs INTEGER NOT NULL,
    active_exchanges INTEGER NOT NULL,

    source TEXT NOT NULL,

    CONSTRAINT fk_coinmarketcap_general_crypto_metric_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
