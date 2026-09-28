CREATE SCHEMA IF NOT EXISTS current;

CREATE TABLE IF NOT EXISTS current.wti_ig_sentiment (
    indicator TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,

    current_long NUMERIC NOT NULL,
    current_short NUMERIC NOT NULL,
    current_net NUMERIC NOT NULL,

    previous_day_long NUMERIC,
    previous_day_short NUMERIC,
    previous_day_net NUMERIC,

    long_net_change NUMERIC,
    short_net_change NUMERIC,
    net_net_change NUMERIC,

    long_percent_change NUMERIC,
    short_percent_change NUMERIC,
    net_percent_change NUMERIC,

    moving_average_3d_long NUMERIC,
    current_vs_3d_ma_long NUMERIC,

    moving_average_6d_long NUMERIC,
    current_vs_6d_ma_long NUMERIC,

    moving_average_12d_long NUMERIC,
    current_vs_12d_ma_long NUMERIC,

    moving_average_3d_short NUMERIC,
    current_vs_3d_ma_short NUMERIC,

    moving_average_6d_short NUMERIC,
    current_vs_6d_ma_short NUMERIC,

    moving_average_12d_short NUMERIC,
    current_vs_12d_ma_short NUMERIC,

    moving_average_3d_net NUMERIC,
    current_vs_3d_ma_net NUMERIC,

    moving_average_6d_net NUMERIC,
    current_vs_6d_ma_net NUMERIC,

    moving_average_12d_net NUMERIC,
    current_vs_12d_ma_net NUMERIC,

    asset TEXT NOT NULL,
    source TEXT NOT NULL,

    observed_at DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_wti_ig_sentiment_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);