CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.gold (
    date DATE PRIMARY KEY,

    value NUMERIC NOT NULL,

    commodity TEXT NOT NULL,
    interval TEXT NOT NULL
);
