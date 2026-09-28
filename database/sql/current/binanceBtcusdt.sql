CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.btcusdt_binance_trader_positioning (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_global_long_account NUMERIC NOT NULL,
    current_global_long_short_ratio NUMERIC NOT NULL,
    current_global_short_account NUMERIC NOT NULL,

    current_top_account_long_account NUMERIC NOT NULL,
    current_top_account_long_short_ratio NUMERIC NOT NULL,
    current_top_account_short_account NUMERIC NOT NULL,

    current_top_position_long_account NUMERIC NOT NULL,
    current_top_position_long_short_ratio NUMERIC NOT NULL,
    current_top_position_short_account NUMERIC NOT NULL,

    current_sum_open_interest NUMERIC NOT NULL,
    current_sum_open_interest_value NUMERIC NOT NULL,
    current_cmc_circulating_supply NUMERIC NOT NULL,

    current_funding_rate NUMERIC NOT NULL,
    current_mark_price NUMERIC NOT NULL,

    current_taker_buy_sell_ratio NUMERIC NOT NULL,
    current_taker_sell_volume NUMERIC NOT NULL,
    current_taker_buy_volume NUMERIC NOT NULL,

    previous_day_global_long_account NUMERIC,
    previous_day_global_long_short_ratio NUMERIC,
    previous_day_global_short_account NUMERIC,

    previous_day_top_account_long_account NUMERIC,
    previous_day_top_account_long_short_ratio NUMERIC,
    previous_day_top_account_short_account NUMERIC,

    previous_day_top_position_long_account NUMERIC,
    previous_day_top_position_long_short_ratio NUMERIC,
    previous_day_top_position_short_account NUMERIC,

    previous_day_sum_open_interest NUMERIC,
    previous_day_sum_open_interest_value NUMERIC,
    previous_day_cmc_circulating_supply NUMERIC,

    previous_day_funding_rate NUMERIC,
    previous_day_mark_price NUMERIC,

    previous_day_taker_buy_sell_ratio NUMERIC,
    previous_day_taker_sell_volume NUMERIC,
    previous_day_taker_buy_volume NUMERIC,

    global_long_account_net_change NUMERIC,
    global_long_account_percent_change NUMERIC,

    global_long_short_ratio_net_change NUMERIC,
    global_long_short_ratio_percent_change NUMERIC,

    global_short_account_net_change NUMERIC,
    global_short_account_percent_change NUMERIC,

    top_account_long_account_net_change NUMERIC,
    top_account_long_account_percent_change NUMERIC,

    top_account_long_short_ratio_net_change NUMERIC,
    top_account_long_short_ratio_percent_change NUMERIC,

    top_account_short_account_net_change NUMERIC,
    top_account_short_account_percent_change NUMERIC,

    top_position_long_account_net_change NUMERIC,
    top_position_long_account_percent_change NUMERIC,

    top_position_long_short_ratio_net_change NUMERIC,
    top_position_long_short_ratio_percent_change NUMERIC,

    top_position_short_account_net_change NUMERIC,
    top_position_short_account_percent_change NUMERIC,

    sum_open_interest_net_change NUMERIC,
    sum_open_interest_percent_change NUMERIC,

    sum_open_interest_value_net_change NUMERIC,
    sum_open_interest_value_percent_change NUMERIC,

    cmc_circulating_supply_net_change NUMERIC,
    cmc_circulating_supply_percent_change NUMERIC,

    funding_rate_net_change NUMERIC,
    funding_rate_percent_change NUMERIC,

    mark_price_net_change NUMERIC,
    mark_price_percent_change NUMERIC,

    taker_buy_sell_ratio_net_change NUMERIC,
    taker_buy_sell_ratio_percent_change NUMERIC,

    taker_sell_volume_net_change NUMERIC,
    taker_sell_volume_percent_change NUMERIC,

    taker_buy_volume_net_change NUMERIC,
    taker_buy_volume_percent_change NUMERIC,

    moving_average_30d_global_long_account NUMERIC,
    current_vs_30d_ma_global_long_account NUMERIC,

    moving_average_30d_global_long_short_ratio NUMERIC,
    current_vs_30d_ma_global_long_short_ratio NUMERIC,

    moving_average_30d_global_short_account NUMERIC,
    current_vs_30d_ma_global_short_account NUMERIC,

    moving_average_30d_top_account_long_account NUMERIC,
    current_vs_30d_ma_top_account_long_account NUMERIC,

    moving_average_30d_top_account_long_short_ratio NUMERIC,
    current_vs_30d_ma_top_account_long_short_ratio NUMERIC,

    moving_average_30d_top_account_short_account NUMERIC,
    current_vs_30d_ma_top_account_short_account NUMERIC,

    moving_average_30d_top_position_long_account NUMERIC,
    current_vs_30d_ma_top_position_long_account NUMERIC,

    moving_average_30d_top_position_long_short_ratio NUMERIC,
    current_vs_30d_ma_top_position_long_short_ratio NUMERIC,

    moving_average_30d_top_position_short_account NUMERIC,
    current_vs_30d_ma_top_position_short_account NUMERIC,

    moving_average_30d_sum_open_interest NUMERIC,
    current_vs_30d_ma_sum_open_interest NUMERIC,

    moving_average_30d_sum_open_interest_value NUMERIC,
    current_vs_30d_ma_sum_open_interest_value NUMERIC,

    moving_average_30d_cmc_circulating_supply NUMERIC,
    current_vs_30d_ma_cmc_circulating_supply NUMERIC,

    moving_average_30d_funding_rate NUMERIC,
    current_vs_30d_ma_funding_rate NUMERIC,

    moving_average_30d_mark_price NUMERIC,
    current_vs_30d_ma_mark_price NUMERIC,

    moving_average_30d_taker_buy_sell_ratio NUMERIC,
    current_vs_30d_ma_taker_buy_sell_ratio NUMERIC,

    moving_average_30d_taker_sell_volume NUMERIC,
    current_vs_30d_ma_taker_sell_volume NUMERIC,

    moving_average_30d_taker_buy_volume NUMERIC,
    current_vs_30d_ma_taker_buy_volume NUMERIC,

    symbol TEXT NOT NULL,

    global_date DATE NOT NULL,
    top_account_date DATE NOT NULL,
    top_position_date DATE NOT NULL,
    open_interest_date DATE NOT NULL,
    funding_date DATE NOT NULL,
    taker_date DATE NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_btcusdt_binance_trader_positioning_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
