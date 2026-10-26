-- =========================================================
-- 1. SCHEMA
-- =========================================================

CREATE SCHEMA IF NOT EXISTS assets;


-- =========================================================
-- 2. ASSETS
-- Canonical identity shared by every asset type.
-- =========================================================

CREATE TABLE assets.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL
        CHECK (asset_type IN ('stock', 'crypto', 'commodity')),

    description TEXT,
    category TEXT,
    logo_url TEXT,
    website_url TEXT,

    -- External provider identifiers and mappings.
    external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(external_ids) = 'object')
);

CREATE INDEX idx_assets_symbol
    ON assets.assets (LOWER(symbol));

CREATE INDEX idx_assets_name
    ON assets.assets (LOWER(name));

CREATE INDEX idx_assets_type
    ON assets.assets (asset_type);


-- =========================================================
-- 3. STOCKS
-- Company and stock-specific information.
-- One row per stock asset.
-- =========================================================

CREATE TABLE assets.stocks (
    asset_id UUID PRIMARY KEY
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    exchange TEXT,
    sector TEXT,
    industry TEXT,
    business_summary TEXT,

    -- Annual and quarterly income statements,
    -- balance sheets, and cash-flow statements.
    financial_statements JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Valuation, profitability, growth, debt,
    -- dividends, and other financial metrics.
    financial_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(financial_statements) = 'object'),
    CHECK (jsonb_typeof(financial_metrics) = 'object')
);

CREATE INDEX idx_stocks_exchange
    ON assets.stocks (exchange);

CREATE INDEX idx_stocks_sector
    ON assets.stocks (sector);

CREATE INDEX idx_stocks_industry
    ON assets.stocks (industry);


-- =========================================================
-- 4. CRYPTO
-- Token, blockchain, supply, and security information.
-- One row per crypto asset.
-- =========================================================

CREATE TABLE assets.crypto (
    asset_id UUID PRIMARY KEY
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    network TEXT,

    -- Supports assets deployed on multiple networks.
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

    CHECK (
        jsonb_typeof(contract_addresses) = 'array'
    ),
    CHECK (jsonb_typeof(tokenomics) = 'object'),
    CHECK (jsonb_typeof(holder_distribution) = 'object'),
    CHECK (jsonb_typeof(contract_analysis) = 'object'),
    CHECK (jsonb_typeof(socials) = 'object'),
    CHECK (jsonb_typeof(exchanges) = 'array')
);

CREATE INDEX idx_crypto_network
    ON assets.crypto (network);


-- =========================================================
-- 5. COMMODITIES
-- Commodity profile and fundamental information.
-- One row per commodity asset.
-- =========================================================

CREATE TABLE assets.commodities (
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

CREATE INDEX idx_commodities_type
    ON assets.commodities (commodity_type);

CREATE INDEX idx_commodities_benchmark
    ON assets.commodities (benchmark);


-- =========================================================
-- 6. INFORMATION
-- News, events, sentiment, market snapshots,
-- and other financial research information.
-- One row per information record.
-- =========================================================

CREATE TABLE assets.information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nullable so platform-wide macroeconomic information
    -- can exist without being tied to one asset.
    asset_id UUID
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    information_type TEXT NOT NULL
        CHECK (
            information_type IN (
                'news',
                'event',
                'sentiment',
                'market_snapshot',
                'market_analysis',
                'macro_context'
            )
        ),

    -- Structure depends on information_type.
    data JSONB NOT NULL DEFAULT '{}'::jsonb,

    source TEXT,
    source_url TEXT,

    published_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(data) = 'object')
);

CREATE INDEX idx_information_asset_type_time
    ON assets.information (
        asset_id,
        information_type,
        collected_at DESC
    );

CREATE INDEX idx_information_published_at
    ON assets.information (published_at DESC);

CREATE INDEX idx_information_type_time
    ON assets.information (
        information_type,
        collected_at DESC
    );


-- =========================================================
-- 7. ASSET PRICE HISTORY
-- Historical OHLCV candles for charts and analysis.
-- One row per asset, interval, and candle timestamp.
-- =========================================================

CREATE TABLE assets.asset_price_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    asset_id UUID NOT NULL
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    -- Start time of the candle.
    timestamp TIMESTAMPTZ NOT NULL,

    interval TEXT NOT NULL
        CHECK (interval IN ('1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo')),

    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC,

    -- Documents how prices and volumes should be interpreted.
    quote_currency TEXT,
    volume_unit TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (asset_id, interval, timestamp)
);

CREATE INDEX idx_asset_price_history_lookup
    ON assets.asset_price_history (
        asset_id,
        interval,
        timestamp DESC
    );