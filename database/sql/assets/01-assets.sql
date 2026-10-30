CREATE SCHEMA IF NOT EXISTS assets;

CREATE TABLE IF NOT EXISTS assets.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL
        CHECK (asset_type IN ('stock', 'crypto', 'commodity')),

    description TEXT,
    category TEXT,
    logo_url TEXT,
    website_url TEXT,

    external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(external_ids) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_assets_symbol
    ON assets.assets (LOWER(symbol));

CREATE INDEX IF NOT EXISTS idx_assets_name
    ON assets.assets (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_assets_type
    ON assets.assets (asset_type);