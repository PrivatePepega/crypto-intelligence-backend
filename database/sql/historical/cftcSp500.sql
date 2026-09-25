CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.cftc_sp500 (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    contract TEXT NOT NULL,
    commodity TEXT NOT NULL,
    subgroup TEXT NOT NULL,

    open_interest NUMERIC NOT NULL,

    dealer_long NUMERIC NOT NULL,
    dealer_short NUMERIC NOT NULL,
    dealer_spread NUMERIC NOT NULL,
    dealer_net NUMERIC NOT NULL,

    asset_manager_long NUMERIC NOT NULL,
    asset_manager_short NUMERIC NOT NULL,
    asset_manager_spread NUMERIC NOT NULL,
    asset_manager_net NUMERIC NOT NULL,

    leveraged_money_long NUMERIC NOT NULL,
    leveraged_money_short NUMERIC NOT NULL,
    leveraged_money_spread NUMERIC NOT NULL,
    leveraged_money_net NUMERIC NOT NULL,

    other_reportables_long NUMERIC NOT NULL,
    other_reportables_short NUMERIC NOT NULL,
    other_reportables_spread NUMERIC NOT NULL,
    other_reportables_net NUMERIC NOT NULL,

    non_reportables_long NUMERIC NOT NULL,
    non_reportables_short NUMERIC NOT NULL,
    non_reportables_net NUMERIC NOT NULL,

    CONSTRAINT fk_cftc_sp500_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
