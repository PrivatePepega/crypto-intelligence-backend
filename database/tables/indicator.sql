CREATE SCHEMA IF NOT EXISTS deterministic;

CREATE TABLE IF NOT EXISTS deterministic.indicator (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,

    source TEXT NOT NULL,
    series_id TEXT NOT NULL,

    native_time_unit TEXT NOT NULL,
    native_frequency TEXT NOT NULL,
    native_aggregation TEXT NOT NULL,
    unit TEXT NOT NULL,

    use TEXT NOT NULL,
    purpose TEXT NOT NULL,
    significance TEXT NOT NULL,

    relation_tags TEXT[] NOT NULL DEFAULT '{}',

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive'))
);