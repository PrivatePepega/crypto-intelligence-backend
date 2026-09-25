CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.gold (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    value NUMERIC NOT NULL,

    commodity TEXT NOT NULL,
    interval TEXT NOT NULL,

    CONSTRAINT fk_gold_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
