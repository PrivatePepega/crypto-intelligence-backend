CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.five_year_inflation_expectations (
    date DATE PRIMARY KEY,
    value NUMERIC NOT NULL,
    series_id TEXT NOT NULL,

    CONSTRAINT fk_five_year_inflation_expectations_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);