-- =========================================================
-- 8. SERIES OBSERVATIONS
-- Scalar time-series observations from external providers.
--
-- This is deliberately NOT assets.asset_price_history:
-- that table requires genuine OHLC candles. A single
-- provider-reported value (a spot price, an inventory
-- level, a storage measurement) is a scalar observation,
-- not an open/high/low/close record.
--
-- One row per provider, series, frequency and period.
-- =========================================================

CREATE TABLE IF NOT EXISTS assets.series_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Reporting provider, e.g. 'eia'.
    provider TEXT NOT NULL,

    -- Provider-native series identifier, e.g. 'RWTC'.
    series_id TEXT NOT NULL,

    -- Native observation cadence. Kept explicit so daily,
    -- weekly and monthly observations can never be mixed
    -- into one series silently.
    frequency TEXT NOT NULL,

    -- Provider period exactly as reported:
    --   annual    -> YYYY
    --   quarterly -> YYYY-Qn
    --   monthly   -> YYYY-MM
    --   weekly    -> YYYY-MM-DD
    --   daily     -> YYYY-MM-DD
    -- Stored as TEXT rather than DATE so a monthly period is
    -- never given an invented day of month.
    period TEXT NOT NULL,

    -- Provider value. NULL means the provider reported no
    -- usable value; it is never coerced to zero.
    value NUMERIC,

    -- Provider-reported unit token, e.g. '$/BBL', 'MBBL/D'.
    unit TEXT,

    -- Provider-reported series description.
    series_name TEXT,

    -- Provenance.
    source TEXT NOT NULL,
    source_url TEXT,

    -- NULL: these series report a period, not an instant.
    observed_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT series_observations_frequency_check
        CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),

    CONSTRAINT series_observations_period_format_check
        CHECK (
            (frequency IN ('daily', 'weekly') AND period ~ '^\d{4}-\d{2}-\d{2}$')
            OR (frequency = 'monthly' AND period ~ '^\d{4}-\d{2}$')
            OR (frequency = 'quarterly' AND period ~ '^\d{4}-Q[1-4]$')
            OR (frequency = 'annual' AND period ~ '^\d{4}$')
        ),

    -- Idempotency key. Re-collecting the same period updates
    -- in place instead of appending a duplicate.
    CONSTRAINT series_observations_unique
        UNIQUE (provider, series_id, frequency, period)
);

CREATE INDEX IF NOT EXISTS idx_series_observations_lookup
    ON assets.series_observations (
        provider,
        series_id,
        frequency,
        period DESC
    );
