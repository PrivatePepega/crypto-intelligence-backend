CREATE TABLE IF NOT EXISTS assets.asset_price_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    asset_id UUID NOT NULL
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL,

    interval TEXT NOT NULL
        CHECK (
            interval IN (
                '1m', '5m', '15m', '1h',
                '4h', '1d', '1w', '1mo'
            )
        ),

    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC,

    quote_currency TEXT,
    volume_unit TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (asset_id, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_asset_price_history_lookup
    ON assets.asset_price_history (
        asset_id,
        interval,
        timestamp DESC
    );