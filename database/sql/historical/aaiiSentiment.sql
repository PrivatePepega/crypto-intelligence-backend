CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.aaii_sentiment (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    bullish NUMERIC NOT NULL,
    neutral NUMERIC NOT NULL,
    bearish NUMERIC NOT NULL,
    bull_bear_spread NUMERIC NOT NULL,

    CONSTRAINT fk_aaii_sentiment_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
