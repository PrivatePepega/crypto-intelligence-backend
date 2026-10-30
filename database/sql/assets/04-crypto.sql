CREATE TABLE IF NOT EXISTS assets.crypto (
    asset_id UUID PRIMARY KEY
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    network TEXT,

    contract_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,

    circulating_supply NUMERIC,
    total_supply NUMERIC,
    max_supply NUMERIC,

    tokenomics JSONB NOT NULL DEFAULT '{}'::jsonb,
    holder_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
    contract_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    socials JSONB NOT NULL DEFAULT '{}'::jsonb,
    exchanges JSONB NOT NULL DEFAULT '[]'::jsonb,

    security_summary TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(contract_addresses) = 'array'),
    CHECK (jsonb_typeof(tokenomics) = 'object'),
    CHECK (jsonb_typeof(holder_distribution) = 'object'),
    CHECK (jsonb_typeof(contract_analysis) = 'object'),
    CHECK (jsonb_typeof(socials) = 'object'),
    CHECK (jsonb_typeof(exchanges) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_crypto_network
    ON assets.crypto (network);