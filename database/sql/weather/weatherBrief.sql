CREATE TABLE IF NOT EXISTS weather.daily_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    intelligence_set_id UUID NOT NULL
        REFERENCES intelligence_sets.daily_sets(id)
        ON DELETE CASCADE,

    brief_date DATE NOT NULL UNIQUE,

    raw_analyst_output JSONB NOT NULL,
    ai_context_brief JSONB NOT NULL,
    human_brief JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);