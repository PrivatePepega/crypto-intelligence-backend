CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.average_hourly_earnings (
    date DATE PRIMARY KEY,
    value NUMERIC NOT NULL,
    series_id TEXT NOT NULL,

    CONSTRAINT fk_average_hourly_earnings_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);