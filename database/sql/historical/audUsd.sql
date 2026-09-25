CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.aud_usd (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,

    pair TEXT NOT NULL,
    interval TEXT NOT NULL,
    timing TEXT NOT NULL,

    CONSTRAINT fk_aud_usd_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
