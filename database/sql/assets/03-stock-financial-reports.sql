CREATE TABLE IF NOT EXISTS assets.stock_financial_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    asset_id UUID NOT NULL
        REFERENCES assets.assets(id) ON DELETE CASCADE,

    form TEXT NOT NULL
        CHECK (form IN ('10-Q', '10-K')),

    fiscal_year INTEGER NOT NULL,

    fiscal_period TEXT NOT NULL
        CHECK (fiscal_period IN ('Q1', 'Q2', 'Q3', 'Q4', 'FY')),

    period_start DATE,
    period_end DATE NOT NULL,
    filing_date DATE NOT NULL,

    accession_number TEXT,

    currency TEXT NOT NULL DEFAULT 'USD',

    revenue NUMERIC,
    gross_profit NUMERIC,
    operating_income NUMERIC,
    net_income NUMERIC,

    total_assets NUMERIC,
    total_liabilities NUMERIC,
    cash_and_cash_equivalents NUMERIC,

    operating_cash_flow NUMERIC,
    capital_expenditures NUMERIC,
    free_cash_flow NUMERIC,

    source TEXT NOT NULL DEFAULT 'sec_companyfacts',
    source_url TEXT,

    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (jsonb_typeof(report_data) = 'object'),

    CHECK (
        (form = '10-Q' AND fiscal_period IN ('Q1', 'Q2', 'Q3', 'Q4'))
        OR
        (form = '10-K' AND fiscal_period = 'FY')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_stock_financial_reports_accession
ON assets.stock_financial_reports (
    asset_id,
    accession_number
)
WHERE accession_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_stock_financial_reports_no_accession
ON assets.stock_financial_reports (
    asset_id,
    form,
    fiscal_year,
    fiscal_period,
    period_end
)
WHERE accession_number IS NULL;

CREATE INDEX IF NOT EXISTS
    idx_stock_financial_reports_latest
ON assets.stock_financial_reports (
    asset_id,
    form,
    period_end DESC,
    filing_date DESC
);

CREATE INDEX IF NOT EXISTS
    idx_stock_financial_reports_filing_date
ON assets.stock_financial_reports (
    asset_id,
    filing_date DESC
);