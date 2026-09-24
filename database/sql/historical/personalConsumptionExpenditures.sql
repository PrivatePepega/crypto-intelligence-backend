CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.personal_consumption_expenditures (
    date DATE PRIMARY KEY,
    value NUMERIC NOT NULL,
    series_id TEXT NOT NULL,

    CONSTRAINT fk_personal_consumption_expenditures_indicator
        FOREIGN KEY (series_id)
        REFERENCES indicator.indicators(series_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);