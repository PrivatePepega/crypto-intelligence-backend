CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.ethusdt_binance_trader_positioning (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    symbol TEXT NOT NULL,

    global_long_account NUMERIC NOT NULL,
    global_long_short_ratio NUMERIC NOT NULL,
    global_short_account NUMERIC NOT NULL,
    global_date DATE NOT NULL,

    top_account_long_account NUMERIC NOT NULL,
    top_account_long_short_ratio NUMERIC NOT NULL,
    top_account_short_account NUMERIC NOT NULL,
    top_account_date DATE NOT NULL,

    top_position_long_account NUMERIC NOT NULL,
    top_position_long_short_ratio NUMERIC NOT NULL,
    top_position_short_account NUMERIC NOT NULL,
    top_position_date DATE NOT NULL,

    sum_open_interest NUMERIC NOT NULL,
    sum_open_interest_value NUMERIC NOT NULL,
    cmc_circulating_supply NUMERIC NOT NULL,
    open_interest_date DATE NOT NULL,

    funding_rate NUMERIC NOT NULL,
    mark_price NUMERIC NOT NULL,
    funding_rate_type TEXT NOT NULL,
    funding_date DATE NOT NULL,

    taker_buy_sell_ratio NUMERIC NOT NULL,
    taker_sell_volume NUMERIC NOT NULL,
    taker_buy_volume NUMERIC NOT NULL,
    taker_date DATE NOT NULL,

    CONSTRAINT fk_ethusdt_binance_trader_positioning_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
