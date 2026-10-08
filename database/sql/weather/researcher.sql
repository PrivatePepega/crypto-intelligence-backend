CREATE TABLE IF NOT EXISTS weather.research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    intelligence_set_id UUID NOT NULL
        REFERENCES intelligence_sets.daily_sets(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    observation_id UUID NOT NULL
        REFERENCES weather.observations(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    date DATE NOT NULL,

    market_domain TEXT NOT NULL,

    type TEXT NOT NULL,

    observation TEXT NOT NULL,

    research TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_research_intelligence_set
    ON weather.research(intelligence_set_id);

CREATE INDEX IF NOT EXISTS idx_weather_research_observation
    ON weather.research(observation_id);

CREATE INDEX IF NOT EXISTS idx_weather_research_date
    ON weather.research(date);

CREATE INDEX IF NOT EXISTS idx_weather_research_market_domain
    ON weather.research(market_domain);