CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.coinmarketcap_general_crypto_metric (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_total_market_cap NUMERIC NOT NULL,
    current_total_volume_24h NUMERIC NOT NULL,

    current_altcoin_market_cap NUMERIC NOT NULL,
    current_altcoin_volume_24h NUMERIC NOT NULL,

    current_btc_dominance NUMERIC NOT NULL,
    current_eth_dominance NUMERIC NOT NULL,

    current_defi_market_cap NUMERIC NOT NULL,
    current_defi_volume_24h NUMERIC NOT NULL,
    current_defi_24h_percentage_change NUMERIC NOT NULL,

    current_stablecoin_market_cap NUMERIC NOT NULL,
    current_stablecoin_volume_24h NUMERIC NOT NULL,
    current_stablecoin_24h_percentage_change NUMERIC NOT NULL,

    current_derivatives_volume_24h NUMERIC NOT NULL,
    current_derivatives_24h_percentage_change NUMERIC NOT NULL,

    current_active_cryptocurrencies INTEGER NOT NULL,
    current_active_market_pairs INTEGER NOT NULL,
    current_active_exchanges INTEGER NOT NULL,

    previous_day_total_market_cap NUMERIC NOT NULL,
    previous_day_total_volume_24h NUMERIC NOT NULL,

    previous_day_altcoin_market_cap NUMERIC,
    previous_day_altcoin_volume_24h NUMERIC,

    previous_day_btc_dominance NUMERIC,
    previous_day_eth_dominance NUMERIC,

    previous_day_defi_market_cap NUMERIC,
    previous_day_defi_volume_24h NUMERIC,
    previous_day_defi_24h_percentage_change NUMERIC,

    previous_day_stablecoin_market_cap NUMERIC,
    previous_day_stablecoin_volume_24h NUMERIC,
    previous_day_stablecoin_24h_percentage_change NUMERIC,

    previous_day_derivatives_volume_24h NUMERIC,
    previous_day_derivatives_24h_percentage_change NUMERIC,

    previous_day_active_cryptocurrencies INTEGER,
    previous_day_active_market_pairs INTEGER,
    previous_day_active_exchanges INTEGER,

    total_market_cap_net_change NUMERIC NOT NULL,
    total_market_cap_percent_change NUMERIC NOT NULL,

    total_volume_24h_net_change NUMERIC NOT NULL,
    total_volume_24h_percent_change NUMERIC NOT NULL,

    altcoin_market_cap_net_change NUMERIC,
    altcoin_market_cap_percent_change NUMERIC,

    altcoin_volume_24h_net_change NUMERIC,
    altcoin_volume_24h_percent_change NUMERIC,

    btc_dominance_net_change NUMERIC,
    btc_dominance_percent_change NUMERIC,

    eth_dominance_net_change NUMERIC,
    eth_dominance_percent_change NUMERIC,

    defi_market_cap_net_change NUMERIC,
    defi_market_cap_percent_change NUMERIC,

    defi_volume_24h_net_change NUMERIC,
    defi_volume_24h_percent_change NUMERIC,

    defi_24h_percentage_change_net_change NUMERIC,
    defi_24h_percentage_change_percent_change NUMERIC,

    stablecoin_market_cap_net_change NUMERIC,
    stablecoin_market_cap_percent_change NUMERIC,

    stablecoin_volume_24h_net_change NUMERIC,
    stablecoin_volume_24h_percent_change NUMERIC,

    stablecoin_24h_percentage_change_net_change NUMERIC,
    stablecoin_24h_percentage_change_percent_change NUMERIC,

    derivatives_volume_24h_net_change NUMERIC,
    derivatives_volume_24h_percent_change NUMERIC,

    derivatives_24h_percentage_change_net_change NUMERIC,
    derivatives_24h_percentage_change_percent_change NUMERIC,

    active_cryptocurrencies_net_change NUMERIC,
    active_cryptocurrencies_percent_change NUMERIC,

    active_market_pairs_net_change NUMERIC,
    active_market_pairs_percent_change NUMERIC,

    active_exchanges_net_change NUMERIC,
    active_exchanges_percent_change NUMERIC,

    moving_average_30d_total_market_cap NUMERIC,
    current_vs_30d_ma_total_market_cap NUMERIC,

    moving_average_30d_total_volume_24h NUMERIC,
    current_vs_30d_ma_total_volume_24h NUMERIC,

    moving_average_30d_altcoin_market_cap NUMERIC,
    current_vs_30d_ma_altcoin_market_cap NUMERIC,

    moving_average_30d_altcoin_volume_24h NUMERIC,
    current_vs_30d_ma_altcoin_volume_24h NUMERIC,

    moving_average_30d_btc_dominance NUMERIC,
    current_vs_30d_ma_btc_dominance NUMERIC,

    moving_average_30d_eth_dominance NUMERIC,
    current_vs_30d_ma_eth_dominance NUMERIC,

    moving_average_30d_defi_market_cap NUMERIC,
    current_vs_30d_ma_defi_market_cap NUMERIC,

    moving_average_30d_defi_volume_24h NUMERIC,
    current_vs_30d_ma_defi_volume_24h NUMERIC,

    moving_average_30d_defi_24h_percentage_change NUMERIC,
    current_vs_30d_ma_defi_24h_percentage_change NUMERIC,

    moving_average_30d_stablecoin_market_cap NUMERIC,
    current_vs_30d_ma_stablecoin_market_cap NUMERIC,

    moving_average_30d_stablecoin_volume_24h NUMERIC,
    current_vs_30d_ma_stablecoin_volume_24h NUMERIC,

    moving_average_30d_stablecoin_24h_percentage_change NUMERIC,
    current_vs_30d_ma_stablecoin_24h_percentage_change NUMERIC,

    moving_average_30d_derivatives_volume_24h NUMERIC,
    current_vs_30d_ma_derivatives_volume_24h NUMERIC,

    moving_average_30d_derivatives_24h_percentage_change NUMERIC,
    current_vs_30d_ma_derivatives_24h_percentage_change NUMERIC,

    moving_average_30d_active_cryptocurrencies NUMERIC,
    current_vs_30d_ma_active_cryptocurrencies NUMERIC,

    moving_average_30d_active_market_pairs NUMERIC,
    current_vs_30d_ma_active_market_pairs NUMERIC,

    moving_average_30d_active_exchanges NUMERIC,
    current_vs_30d_ma_active_exchanges NUMERIC,

    source TEXT NOT NULL,

    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_coinmarketcap_general_crypto_metric_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
