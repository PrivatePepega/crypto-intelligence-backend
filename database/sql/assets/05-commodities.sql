CREATE TABLE IF NOT EXISTS assets.commodities (
    asset_id UUID PRIMARY KEY
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    commodity_type TEXT,
    benchmark TEXT,
    currency TEXT,
    unit_of_measure TEXT,

    uses JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_drivers JSONB NOT NULL DEFAULT '{}'::jsonb,
    supply_demand JSONB NOT NULL DEFAULT '{}'::jsonb,
    inflation_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(uses) = 'array'),
    CHECK (jsonb_typeof(value_drivers) = 'object'),
    CHECK (jsonb_typeof(supply_demand) = 'object'),
    CHECK (jsonb_typeof(inflation_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_commodities_type
    ON assets.commodities (commodity_type);

CREATE INDEX IF NOT EXISTS idx_commodities_benchmark
    ON assets.commodities (benchmark);