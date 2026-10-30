/**
 * Simplified Stock Intelligence API Response Contract
 *
 * This is a reduced, frontend-friendly contract containing only:
 * - ticker
 * - company (name, exchange, currency, cik, sector, industry, description, website, country, logoUrl)
 * - market (price, previousClose, change, changePercent, marketCap, volume, averageVolume, dayHigh, dayLow, yearHigh, yearLow, priceUpdatedAt, movingAverages)
 * - financialReports (quarterly[], annual[])
 * - dataUpdatedAt
 *
 * This deliberately excludes: history, financial metrics, SEC event arrays,
 * coverage diagnostics, internal identity/provider objects.
 */

export interface SimpleCompany {
  name: string;
  exchange: string | null;
  currency: string;
  cik: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  country: string;
  logoUrl: string | null;
}

export interface SimpleMovingAverages {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

export interface SimpleMarket {
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  volume: number | null;
  averageVolume: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  priceUpdatedAt: string | null;
  movingAverages: SimpleMovingAverages;
}

export interface SimpleFinancialReport {
  form: "10-Q" | "10-K";
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  periodEnd: string | null;
  filingDate: string | null;
  accessionNumber: string | null;
  currency: "USD";
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  cashAndCashEquivalents: number | null;
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;
  sourceUrl: string | null;
}

export interface SimpleFinancialReports {
  quarterly: SimpleFinancialReport[];
  annual: SimpleFinancialReport[];
}

export interface SimpleStockIntelligenceResponse {
  ticker: string;
  company: SimpleCompany;
  market: SimpleMarket;
  financialReports: SimpleFinancialReports;
  dataUpdatedAt: string | null;
}

/**
 * Creates an empty/null financial report with the correct structure.
 */
export function createEmptyFinancialReport(form: "10-Q" | "10-K"): SimpleFinancialReport {
  return {
    form,
    fiscalYear: null,
    fiscalPeriod: null,
    periodEnd: null,
    filingDate: null,
    accessionNumber: null,
    currency: "USD",
    revenue: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    totalAssets: null,
    totalLiabilities: null,
    cashAndCashEquivalents: null,
    operatingCashFlow: null,
    capitalExpenditures: null,
    freeCashFlow: null,
    sourceUrl: null,
  };
}

/**
 * Creates a complete empty response for a ticker.
 */
export function createEmptyResponse(ticker: string): SimpleStockIntelligenceResponse {
  return {
    ticker,
    company: {
      name: ticker,
      exchange: null,
      currency: "USD",
      cik: "",
      sector: null,
      industry: null,
      description: null,
      website: null,
      country: "US",
      logoUrl: null,
    },
    market: {
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      marketCap: null,
      volume: null,
      averageVolume: null,
      dayHigh: null,
      dayLow: null,
      yearHigh: null,
      yearLow: null,
      priceUpdatedAt: null,
      movingAverages: { sma20: null, sma50: null, sma200: null },
    },
    financialReports: {
      quarterly: [],
      annual: [],
    },
    dataUpdatedAt: null,
  };
}