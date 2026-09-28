CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.coinmarketcap_alt_season_fear_greed (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_index NUMERIC NOT NULL,
    current_altcoin_market_cap NUMERIC NOT NULL,

    previous_day_index NUMERIC,
    previous_day_altcoin_market_cap NUMERIC,

    index_net_change NUMERIC,
    index_percent_change NUMERIC,

    altcoin_market_cap_net_change NUMERIC,
    altcoin_market_cap_percent_change NUMERIC,

    moving_average_30d_index NUMERIC,
    current_vs_30d_ma_index NUMERIC,

    moving_average_60d_index NUMERIC,
    current_vs_60d_ma_index NUMERIC,

    yearly_high_index NUMERIC,
    yearly_high_date DATE,

    yearly_low_index NUMERIC,
    yearly_low_date DATE,

    source TEXT NOT NULL,

    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_coinmarketcap_alt_season_fear_greed_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
