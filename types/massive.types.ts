export type MassiveResponse<T> = {
    status: string;
    request_id: string;
    results: T[];
    next_url?: string;
  };
  
  export type TreasuryYield = {
    date: string;
    yield_1_month?: number;
    yield_3_month?: number;
    yield_1_year?: number;
    yield_2_year?: number;
    yield_5_year?: number;
    yield_10_year?: number;
    yield_30_year?: number;
  };
  
  export type Inflation = {
    date: string;
    cpi?: number;
    cpi_core?: number;
    cpi_year_over_year?: number;
    pce?: number;
    pce_core?: number;
    pce_spending?: number;
  };
  
  export type InflationExpectation = {
    date: string;
    market_5_year?: number;
    market_10_year?: number;
    forward_years_5_to_10?: number;
    model_1_year?: number;
    model_5_year?: number;
    model_10_year?: number;
    model_30_year?: number;
  };
  
  export type LaborMarket = {
    date: string;
    unemployment_rate?: number;
    labor_force_participation_rate?: number;
    avg_hourly_earnings?: number;
    job_openings?: number;
  };
  
  export type FundingCondition = {
    date: string;
    interest_on_reserve_balances?: number;
    fed_funds_target_upper?: number;
    fed_funds_target_lower?: number;
    secured_overnight_financing_rate?: number;
    sofr_volume?: number;
    sofr_25th_percentile?: number;
    sofr_75th_percentile?: number;
    overnight_bank_funding_rate?: number;
    obfr_volume?: number;
    obfr_25th_percentile?: number;
    obfr_75th_percentile?: number;
    effective_fed_funds_volume?: number;
    tri_party_general_collateral_rate?: number;
    tri_party_general_collateral_volume?: number;
    tgcr_25th_percentile?: number;
    tgcr_75th_percentile?: number;
    fed_overnight_reverse_repo_treasury_amount?: number;
    fed_overnight_repo_treasury_amount?: number;
  };