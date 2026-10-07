CREATE SCHEMA IF NOT EXISTS intelligence_sets;

CREATE TABLE IF NOT EXISTS intelligence_sets.daily_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_date DATE NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);