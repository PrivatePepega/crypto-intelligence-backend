CREATE SCHEMA IF NOT EXISTS weather;

CREATE TABLE IF NOT EXISTS weather.observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intelligence_set_id UUID NOT NULL
        REFERENCES intelligence_sets.daily_sets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    date DATE NOT NULL,
    market_domain TEXT NOT NULL,
    type TEXT NOT NULL,
    observation TEXT NOT NULL,
    research_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_observations_intelligence_set
    ON weather.observations(intelligence_set_id);

CREATE INDEX IF NOT EXISTS idx_weather_observations_research_enabled
    ON weather.observations(research_enabled);

CREATE INDEX IF NOT EXISTS idx_weather_observations_date
    ON weather.observations(date);