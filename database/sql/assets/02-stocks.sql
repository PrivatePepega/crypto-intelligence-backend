CREATE TABLE IF NOT EXISTS assets.stocks (
    asset_id UUID PRIMARY KEY
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    exchange TEXT,
    sector TEXT,
    industry TEXT,
    business_summary TEXT,

    currency TEXT,
    country TEXT,

    financial_statements JSONB NOT NULL DEFAULT '{}'::jsonb,
    financial_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(financial_statements) = 'object'),
    CHECK (jsonb_typeof(financial_metrics) = 'object')
);

ALTER TABLE assets.stocks
    ADD COLUMN IF NOT EXISTS currency TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_stocks_exchange
    ON assets.stocks (exchange);

CREATE INDEX IF NOT EXISTS idx_stocks_sector
    ON assets.stocks (sector);

CREATE INDEX IF NOT EXISTS idx_stocks_industry
    ON assets.stocks (industry);