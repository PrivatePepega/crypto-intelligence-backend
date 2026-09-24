CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.nonfarm_payrolls (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_value NUMERIC NOT NULL,
    previous_month_value NUMERIC NOT NULL,

    net_change NUMERIC NOT NULL,

    moving_average_3m NUMERIC,
    current_vs_3m_ma NUMERIC,

    moving_average_6m NUMERIC,
    current_vs_6m_ma NUMERIC,

    moving_average_12m NUMERIC,
    current_vs_12m_ma NUMERIC,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_nonfarm_payrolls_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);