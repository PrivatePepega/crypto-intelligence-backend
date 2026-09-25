CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.cftc_ust_2y_note (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_open_interest NUMERIC NOT NULL,

    current_dealer_net NUMERIC NOT NULL,
    current_asset_manager_net NUMERIC NOT NULL,
    current_leveraged_money_net NUMERIC NOT NULL,
    current_other_reportables_net NUMERIC NOT NULL,
    current_non_reportables_net NUMERIC NOT NULL,

    previous_week_open_interest NUMERIC NOT NULL,

    previous_week_dealer_net NUMERIC NOT NULL,
    previous_week_asset_manager_net NUMERIC NOT NULL,
    previous_week_leveraged_money_net NUMERIC NOT NULL,
    previous_week_other_reportables_net NUMERIC NOT NULL,
    previous_week_non_reportables_net NUMERIC NOT NULL,

    open_interest_net_change NUMERIC NOT NULL,
    dealer_net_change NUMERIC NOT NULL,
    asset_manager_net_change NUMERIC NOT NULL,
    leveraged_money_net_change NUMERIC NOT NULL,
    other_reportables_net_change NUMERIC NOT NULL,
    non_reportables_net_change NUMERIC NOT NULL,

    open_interest_percent_change NUMERIC NOT NULL,
    dealer_net_percent_change NUMERIC NOT NULL,
    asset_manager_net_percent_change NUMERIC NOT NULL,
    leveraged_money_net_percent_change NUMERIC NOT NULL,
    other_reportables_net_percent_change NUMERIC NOT NULL,
    non_reportables_net_percent_change NUMERIC NOT NULL,

    moving_average_3w_open_interest NUMERIC,
    current_vs_3w_ma_open_interest NUMERIC,

    moving_average_6w_open_interest NUMERIC,
    current_vs_6w_ma_open_interest NUMERIC,

    moving_average_12w_open_interest NUMERIC,
    current_vs_12w_ma_open_interest NUMERIC,

    moving_average_3w_dealer_net NUMERIC,
    current_vs_3w_ma_dealer_net NUMERIC,

    moving_average_6w_dealer_net NUMERIC,
    current_vs_6w_ma_dealer_net NUMERIC,

    moving_average_12w_dealer_net NUMERIC,
    current_vs_12w_ma_dealer_net NUMERIC,

    moving_average_3w_asset_manager_net NUMERIC,
    current_vs_3w_ma_asset_manager_net NUMERIC,

    moving_average_6w_asset_manager_net NUMERIC,
    current_vs_6w_ma_asset_manager_net NUMERIC,

    moving_average_12w_asset_manager_net NUMERIC,
    current_vs_12w_ma_asset_manager_net NUMERIC,

    moving_average_3w_leveraged_money_net NUMERIC,
    current_vs_3w_ma_leveraged_money_net NUMERIC,

    moving_average_6w_leveraged_money_net NUMERIC,
    current_vs_6w_ma_leveraged_money_net NUMERIC,

    moving_average_12w_leveraged_money_net NUMERIC,
    current_vs_12w_ma_leveraged_money_net NUMERIC,

    moving_average_3w_other_reportables_net NUMERIC,
    current_vs_3w_ma_other_reportables_net NUMERIC,

    moving_average_6w_other_reportables_net NUMERIC,
    current_vs_6w_ma_other_reportables_net NUMERIC,

    moving_average_12w_other_reportables_net NUMERIC,
    current_vs_12w_ma_other_reportables_net NUMERIC,

    moving_average_3w_non_reportables_net NUMERIC,
    current_vs_3w_ma_non_reportables_net NUMERIC,

    moving_average_6w_non_reportables_net NUMERIC,
    current_vs_6w_ma_non_reportables_net NUMERIC,

    moving_average_12w_non_reportables_net NUMERIC,
    current_vs_12w_ma_non_reportables_net NUMERIC,

    contract TEXT NOT NULL,
    commodity TEXT NOT NULL,
    subgroup TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cftc_ust_2y_note_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
