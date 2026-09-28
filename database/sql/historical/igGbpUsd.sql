CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.gbp_usd_ig_sentiment (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    asset TEXT NOT NULL,

    long NUMERIC NOT NULL,
    short NUMERIC NOT NULL,
    net NUMERIC NOT NULL,

    source TEXT NOT NULL,

    CONSTRAINT fk_gbp_usd_ig_sentiment_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);