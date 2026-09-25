CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.cnn_fear_greed (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    value NUMERIC NOT NULL,
    rating TEXT NOT NULL,

    CONSTRAINT fk_cnn_fear_greed_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
