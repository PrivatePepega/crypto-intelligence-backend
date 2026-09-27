CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.russell_2000 (
    date DATE PRIMARY KEY,
    series_id TEXT NOT NULL,

    symbol TEXT NOT NULL,

    open NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    change NUMERIC NOT NULL,
    change_percent NUMERIC NOT NULL,

    CONSTRAINT fk_russell_2000_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
