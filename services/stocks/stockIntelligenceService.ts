import "dotenv/config";

import pool from "../../config/database.js";
import { fmpGet, setFmpRequestsPerMinute, setFmpRequestBudget, resetFmpRequestUsage } from "../../collectors/assets/commodities/fmpClient.js";
import { resolveStock, type StockIdentity, type StockResolutionResult } from "./stockResolver.js";
import { getStockCoverage, needsRefresh, type StockCoverageReport } from "./stockCoverage.js";
import { createIngestionPlan, type IngestionPlan } from "./freshnessPolicy.js";
import {
  normalizeStockProfile,
  normalizeStockQuote,
  normalizeStockHistory,
  mergeStockHistories,
  buildQuoteSnapshotData,
  buildQuoteSnapshotKey,
  type NormalizedProfileResult,
  type NormalizedQuoteResult,
  type StockHistory,
  type StockQuote,
  type StockProfile,
} from "./fmpStockNormalizer.js";
import {
  upsertStockAsset,
  upsertStockProfile,
  upsertFinancialStatements,
  upsertFinancialMetrics,
  upsertDailyCandles,
  insertQuoteSnapshot,
  insertSecEvent,
  readStockState,
  withTransaction,
  type StockAssetUpsertResult,
  type CandleUpsertResult,
  type SnapshotInsertResult,
  type SecEventInsertResult,
} from "./stockRepository.js";
import {
  collectInsiderTransactions,
  collectInstitutionalHoldings,
  collectBeneficialOwnershipFilings,
  collectCorporateActionFilings,
  collectFundamentals,
  type InsiderCollectionResult,
  type InstitutionalHoldingsResult,
  type BeneficialOwnershipResult,
  type CorporateActionsResult,
  type FundamentalsResult,
} from "./secAdapters.js";
import type {
  StockIntelligenceResult,
  GetOrIngestStockOptions,
  DatasetName,
  StockHistory,
  StockProfile,
  StockQuote,
  FinancialStatements,
  FinancialMetrics,
  InsiderTransaction,
  ThirteenFPeriod,
  BeneficialOwnershipFiling,
  CorporateActionFiling,
  StockCoverageReport,
  IngestionPlan,
  StockIdentity,
} from "../../types/stocks/stock.types.js";
import { PROFILE_ENDPOINT, QUOTE_ENDPOINT, HISTORY_ENDPOINT } from "./stockResolver.js";

/* -------------------------------------------------------------------------- */
/*                              FMP Fetch Helpers                             */
/* -------------------------------------------------------------------------- */

async function fetchFmpProfile(symbol: string): Promise<NormalizedProfileResult> {
  try {
    const result = await fmpGet(PROFILE_ENDPOINT, { symbol }, `profile ${symbol}`);
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return { ok: false, reason: "Provider returned empty profile array" };
    }
    return normalizeStockProfile(result.data[0], { assetId: "", ticker: symbol, companyName: symbol, exchange: null, cik: null, providerIds: {} }, {
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    return { ok: false, reason: `FMP profile fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function fetchFmpQuote(symbol: string, currency: string | null): Promise<NormalizedQuoteResult> {
  try {
    const result = await fmpGet(QUOTE_ENDPOINT, { symbol }, `quote ${symbol}`);
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return { ok: false, reason: "Provider returned empty quote array" };
    }
    return normalizeStockQuote(result.data[0], {
      symbol,
      currency,
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    return { ok: false, reason: `FMP quote fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function fetchFmpHistory(
  symbol: string,
  from: string,
  to: string,
  chunkDays = 365,
): Promise<StockHistory> {
  const { buildDateWindows } = await import("../../collectors/assets/commodities/fmpCommodityFetchers.js");
  const windows = buildDateWindows(from, to, chunkDays);

  const histories: StockHistory[] = [];
  const fetchedAt = new Date().toISOString();

  for (const window of windows) {
    const result = await fmpGet(HISTORY_ENDPOINT, { symbol, from: window.from, to: window.to }, `history ${symbol} ${window.from}..${window.to}`);
    const history = normalizeStockHistory(result.data, {
      symbol,
      fetchedAt,
      requested: { from: window.from, to: window.to },
    });
    histories.push(history);
  }

  return mergeStockHistories(symbol, fetchedAt, { from, to }, histories);
}

/* -------------------------------------------------------------------------- */
/*                           Persistence Helpers                              */
/* -------------------------------------------------------------------------- */

async function persistProfile(
  identity: StockIdentity,
  profileResult: NormalizedProfileResult,
): Promise<{ assetId: string; profile: StockProfile | null }> {
  if (!profileResult.ok) {
    return { assetId: identity.assetId, profile: null };
  }

  const profile = profileResult.profile;

  // Update identity with profile data if needed
  const updatedIdentity: StockIdentity = {
    ...identity,
    ticker: profile.ticker,
    companyName: profile.companyName,
    exchange: profile.exchange ?? identity.exchange,
    cik: profile.cik ?? identity.cik,
  };

  const assetResult = await withTransaction(async (client) => {
    return upsertStockAsset(client, updatedIdentity, profile);
  });

  const assetId = assetResult.asset_id;

  if (assetResult.created || profile) {
    await withTransaction(async (client) => {
      await upsertStockProfile(client, assetId, profile);
    });
  }

  return { assetId, profile };
}

async function persistQuote(
  assetId: string,
  quoteResult: NormalizedQuoteResult,
  sourceUrl: string,
): Promise<{ quote: StockQuote | null; snapshot: SnapshotInsertResult | null }> {
  if (!quoteResult.ok) {
    return { quote: null, snapshot: null };
  }

  const quote = quoteResult.quote;
  const snapshot = await withTransaction(async (client) => {
    return insertQuoteSnapshot(client, assetId, quote, sourceUrl);
  });

  return { quote, snapshot };
}

async function persistHistory(
  assetId: string,
  history: StockHistory,
  quoteCurrency: string | null,
): Promise<CandleUpsertResult> {
  if (history.candles.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  return withTransaction(async (client) => {
    return upsertDailyCandles(client, assetId, history.candles, { quoteCurrency });
  });
}

async function persistFundamentals(
  assetId: string,
  fundamentals: FundamentalsResult,
): Promise<{ statements: boolean; metrics: boolean }> {
  let statementsSaved = false;
  let metricsSaved = false;

  if (fundamentals.statements) {
    await withTransaction(async (client) => {
      await upsertFinancialStatements(client, assetId, fundamentals.statements!);
    });
    statementsSaved = true;
  }

  if (fundamentals.metrics) {
    await withTransaction(async (client) => {
      await upsertFinancialMetrics(client, assetId, fundamentals.metrics!);
    });
    metricsSaved = true;
  }

  return { statements: statementsSaved, metrics: metricsSaved };
}

async function persistInsiderTransactions(
  assetId: string,
  result: InsiderCollectionResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = result.collectedAt;

  for (const tx of result.transactions) {
    const dedupeKey = `insider:${tx.accessionNumber}:${tx.lineNumber}:${tx.table}`;
    const eventData = {
      ...tx,
      // Ensure the dedupe key is in the data for idempotency
      dedupe_key: dedupeKey,
    };

    const eventResult = await withTransaction(async (client) => {
      return insertSecEvent(client, {
        assetId,
        informationType: "event",
        source: "sec_insider",
        data: eventData,
        sourceUrl: tx.documentUrl,
        observedAt: tx.filingDate,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistBeneficialOwnership(
  assetId: string,
  result: BeneficialOwnershipResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = result.collectedAt;

  for (const filing of result.filings) {
    const dedupeKey = `13dg:${filing.accessionNumber}`;
    const eventData = {
      ...filing,
      dedupe_key: dedupeKey,
    };

    const eventResult = await withTransaction(async (client) => {
      return insertSecEvent(client, {
        assetId,
        informationType: "event",
        source: "sec_13dg",
        data: eventData,
        sourceUrl: filing.documentUrl,
        observedAt: filing.filingDate,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistCorporateActions(
  assetId: string,
  result: CorporateActionsResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = result.collectedAt;

  for (const filing of result.filings) {
    const dedupeKey = `corp_action:${filing.accessionNumber}`;
    const eventData = {
      ...filing,
      dedupe_key: dedupeKey,
    };

    const eventResult = await withTransaction(async (client) => {
      return insertSecEvent(client, {
        assetId,
        informationType: "event",
        source: "sec_corporate_action",
        data: eventData,
        sourceUrl: filing.documentUrl,
        observedAt: filing.filingDate,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistInstitutionalHoldings(
  assetId: string,
  result: InstitutionalHoldingsResult,
): Promise<number> {
  // Placeholder - 13F bulk collection not yet integrated
  return 0;
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Executor                               */
/* -------------------------------------------------------------------------- */

interface IngestionResult {
  profile: { ok: boolean; profile: StockProfile | null; error: string | null };
  quote: { ok: boolean; quote: StockQuote | null; error: string | null };
  history: { ok: boolean; history: StockHistory | null; error: string | null; candles: CandleUpsertResult | null };
  fundamentals: { ok: boolean; statements: FinancialStatements | null; metrics: FinancialMetrics | null; error: string | null };
  insider: { ok: boolean; transactions: InsiderTransaction[]; count: number; error: string | null };
  institutional: { ok: boolean; periods: ThirteenFPeriod[]; count: number; error: string | null };
  beneficial: { ok: boolean; filings: BeneficialOwnershipFiling[]; count: number; error: string | null };
  corporate: { ok: boolean; filings: CorporateActionFiling[]; count: number; error: string | null };
  errors: Array<{ dataset: DatasetName; message: string }>;
}

async function executeIngestionPlan(
  identity: StockIdentity,
  plan: IngestionPlan,
  options: { historyRange?: { from: string; to: string } } = {},
): Promise<IngestionResult> {
  const errors: Array<{ dataset: DatasetName; message: string }> = [];

  // Default history range: last 365 days
  const to = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
  const from = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Profile (must be first - creates asset)
  let profileResult: NormalizedProfileResult = { ok: false, reason: "not attempted" };
  let assetId = identity.assetId;
  let profile: StockProfile | null = null;

  if (plan.steps.some((s) => s.dataset === "profile")) {
    profileResult = await fetchFmpProfile(identity.ticker);
    if (!profileResult.ok) {
      errors.push({ dataset: "profile", message: profileResult.reason });
    } else {
      const persisted = await persistProfile(identity, profileResult);
      assetId = persisted.assetId;
      profile = persisted.profile;
    }
  }

  // 2. Quote
  let quoteResult: NormalizedQuoteResult = { ok: false, reason: "not attempted" };
  let quote: StockQuote | null = null;

  if (plan.steps.some((s) => s.dataset === "quote")) {
    const currency = profile?.currency ?? null;
    quoteResult = await fetchFmpQuote(identity.ticker, currency);
    if (!quoteResult.ok) {
      errors.push({ dataset: "quote", message: quoteResult.reason });
    } else {
      const profileUrl = `${fmpGet.__proto__.constructor.name}`; // placeholder for source URL
      const { quote: q } = await persistQuote(assetId, quoteResult, quoteResult.ok ? "fmp_quote" : "");
      quote = q;
    }
  }

  // 3. History
  let historyResult: StockHistory | null = null;
  let candleResult: CandleUpsertResult | null = null;

  if (plan.steps.some((s) => s.dataset === "history")) {
    try {
      historyResult = await fetchFmpHistory(identity.ticker, from, to);
      candleResult = await persistHistory(assetId, historyResult, profile?.currency ?? null);
    } catch (error) {
      errors.push({ dataset: "history", message: `History fetch failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  // 4. Fundamentals
  let fundamentalsResult: FundamentalsResult = { statements: null, metrics: null, error: null, collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "financial_statements" || s.dataset === "financial_metrics")) {
    fundamentalsResult = await collectFundamentals({ ...identity, assetId });
    if (fundamentalsResult.error) {
      errors.push({ dataset: "financial_statements", message: fundamentalsResult.error });
    } else {
      await persistFundamentals(assetId, fundamentalsResult);
    }
  }

  // 5. Insider Transactions
  let insiderResult: InsiderCollectionResult = { transactions: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "insider_transactions")) {
    insiderResult = await collectInsiderTransactions({ ...identity, assetId });
    if (insiderResult.errors.length > 0) {
      errors.push({ dataset: "insider_transactions", message: insiderResult.errors.map((e) => e.message).join("; ") });
    } else {
      await persistInsiderTransactions(assetId, insiderResult);
    }
  }

  // 6. Institutional Holdings (13F)
  let institutionalResult: InstitutionalHoldingsResult = { periods: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "institutional_holdings")) {
    institutionalResult = await collectInstitutionalHoldings({ ...identity, assetId });
    if (institutionalResult.errors.length > 0) {
      errors.push({ dataset: "institutional_holdings", message: institutionalResult.errors.map((e) => e.message).join("; ") });
    } else {
      await persistInstitutionalHoldings(assetId, institutionalResult);
    }
  }

  // 7. Beneficial Ownership
  let beneficialResult: BeneficialOwnershipResult = { filings: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "beneficial_ownership")) {
    beneficialResult = await collectBeneficialOwnershipFilings({ ...identity, assetId });
    if (beneficialResult.errors.length > 0) {
      errors.push({ dataset: "beneficial_ownership", message: beneficialResult.errors.map((e) => e.message).join("; ") });
    } else {
      await persistBeneficialOwnership(assetId, beneficialResult);
    }
  }

  // 8. Corporate Actions
  let corporateResult: CorporateActionsResult = { filings: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "corporate_actions")) {
    corporateResult = await collectCorporateActionFilings({ ...identity, assetId });
    if (corporateResult.errors.length > 0) {
      errors.push({ dataset: "corporate_actions", message: corporateResult.errors.map((e) => e.message).join("; ") });
    } else {
      await persistCorporateActions(assetId, corporateResult);
    }
  }

  return {
    profile: { ok: profileResult.ok, profile, error: profileResult.ok ? null : profileResult.reason },
    quote: { ok: quoteResult.ok, quote, error: quoteResult.ok ? null : quoteResult.reason },
    history: { ok: historyResult !== null, history: historyResult, error: null, candles: candleResult },
    fundamentals: {
      ok: fundamentalsResult.error === null,
      statements: fundamentalsResult.statements,
      metrics: fundamentalsResult.metrics,
      error: fundamentalsResult.error,
    },
    insider: {
      ok: insiderResult.errors.length === 0,
      transactions: insiderResult.transactions,
      count: insiderResult.transactions.length,
      error: insiderResult.errors.length > 0 ? insiderResult.errors[0].message : null,
    },
    institutional: {
      ok: institutionalResult.errors.length === 0,
      periods: institutionalResult.periods,
      count: institutionalResult.periods.length,
      error: institutionalResult.errors.length > 0 ? institutionalResult.errors[0].message : null,
    },
    beneficial: {
      ok: beneficialResult.errors.length === 0,
      filings: beneficialResult.filings,
      count: beneficialResult.filings.length,
      error: beneficialResult.errors.length > 0 ? beneficialResult.errors[0].message : null,
    },
    corporate: {
      ok: corporateResult.errors.length === 0,
      filings: corporateResult.filings,
      count: corporateResult.filings.length,
      error: corporateResult.errors.length > 0 ? corporateResult.errors[0].message : null,
    },
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Main Service Entry                               */
/* -------------------------------------------------------------------------- */

/**
 * Main entry point: resolves a stock, checks coverage, executes ingestion plan,
 * and returns the complete intelligence package.
 */
export async function getOrIngestStock(
  query: string,
  options: GetOrIngestStockOptions = {},
): Promise<StockIntelligenceResult> {
  // Configure FMP rate limiting
  setFmpRequestsPerMinute(120);
  setFmpRequestBudget(100);
  resetFmpRequestUsage(100);

  // 1. Resolve the stock
  const resolution = await resolveStock(query);
  if (resolution.kind !== "resolved") {
    throw new Error(resolution.message);
  }

  let identity = resolution.identity;

  // 2. Get coverage report
  const coverage = await getStockCoverage(identity);

  // 3. If read-only, return current state
  if (options.readOnly) {
    return buildResult(identity, coverage, null, []);
  }

  // 4. Create ingestion plan
  const plan = createIngestionPlan(identity.assetId || "", identity.ticker, coverage, {
    refresh: options.refresh,
    include: options.include,
  });

  // 5. Execute plan if there's work to do
  let ingestionResult: IngestionResult | null = null;
  if (plan.steps.length > 0) {
    ingestionResult = await executeIngestionPlan(identity, plan, {
      historyRange: { from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
    });

    // Refresh identity with assigned assetId
    if (!identity.assetId && ingestionResult.profile.profile) {
      identity = { ...identity, assetId: ingestionResult.profile.profile.assetId };
    }
  }

  // 6. Get fresh coverage after ingestion
  const freshCoverage = await getStockCoverage(identity);

  // 7. Read back stored data for response
  const client = await pool.connect();
  try {
    const dbClient = {
      async query(text: string, values?: unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
      },
    };
    const stored = await readStockState(dbClient, identity.ticker, {
      recentCandles: 30,
      recentSnapshots: 5,
      recentEvents: 20,
    });

    return buildResult(identity, freshCoverage, stored, ingestionResult?.errors ?? []);
  } finally {
    client.release();
  }
}

/**
 * Builds the final result from stored data and ingestion results.
 */
function buildResult(
  identity: StockIdentity,
  coverage: StockCoverageReport,
  stored: Awaited<ReturnType<typeof readStockState>> | null,
  ingestionErrors: Array<{ dataset: DatasetName; message: string }>,
): StockIntelligenceResult {
  // Build profile from stored data
  let profile: StockProfile | null = null;
  if (stored?.profile) {
    const p = stored.profile;
    profile = {
      assetId: identity.assetId,
      ticker: identity.ticker,
      companyName: identity.companyName,
      exchange: p.exchange as string | null,
      cik: identity.cik,
      isin: null,
      cusip: null,
      sector: p.sector as string | null,
      industry: p.industry as string | null,
      description: p.business_summary as string | null,
      website: null,
      country: null,
      ipoDate: null,
      currency: null,
      isEtf: null,
      isFund: null,
      isAdr: null,
      isActivelyTrading: null,
      providerData: {},
      updatedAt: p.updated_at as string,
    };
  }

  // Build quote from latest snapshot
  let quote: StockQuote | null = null;
  if (stored?.snapshots.length) {
    const latest = stored.snapshots[0];
    const data = latest.data as Record<string, unknown>;
    quote = {
      provider: "fmp",
      symbol: identity.ticker,
      provider_symbol: data.provider_symbol as string,
      name: data.name as string | null,
      currency: data.currency as string | null,
      price: data.price as number,
      change: data.change as number | null,
      change_percent: data.change_percent as number | null,
      open: data.open as number | null,
      previous_close: data.previous_close as number | null,
      day_low: data.day_low as number | null,
      day_high: data.day_high as number | null,
      year_low: data.year_low as number | null,
      year_high: data.year_high as number | null,
      volume: data.volume as number | null,
      average_volume: data.average_volume as number | null,
      market_cap: data.market_cap as number | null,
      price_avg_50: data.price_avg_50 as number | null,
      price_avg_200: data.price_avg_200 as number | null,
      exchange: data.exchange as string | null,
      observed_at: data.observed_at as string | null,
      collected_at: data.collected_at as string,
      provider_raw: data,
    };
  }

  // Build history from stored candles
  let history: StockHistory | null = null;
  if (stored?.price_history.candle_count > 0) {
    history = {
      provider: "fmp",
      symbol: identity.ticker,
      interval: "1d",
      fetched_at: new Date().toISOString(),
      requested: { from: null, to: null },
      candles: stored.price_history.recent.map((c) => ({
        symbol: identity.ticker,
        date: c.timestamp ? c.timestamp.slice(0, 10) : "",
        timestamp: c.timestamp as string,
        open: c.open as number,
        high: c.high as number,
        low: c.low as number,
        close: c.close as number,
        volume: c.volume as number | null,
        change: null,
        change_percent: null,
        vwap: null,
      })).reverse(),
      rejected: [],
      duplicates_removed: 0,
    };
  }

  // Build other datasets from stored SEC events
  const insiderTransactions: InsiderTransaction[] = (stored?.sec_events.insider ?? []).map((e) => e.data as InsiderTransaction);
  const institutionalHoldings: ThirteenFPeriod[] = (stored?.sec_events.institutional ?? []).map((e) => e.data as ThirteenFPeriod);
  const beneficialOwnership: BeneficialOwnershipFiling[] = (stored?.sec_events.beneficial_ownership ?? []).map((e) => e.data as BeneficialOwnershipFiling);
  const corporateActions: CorporateActionFiling[] = (stored?.sec_events.corporate_actions ?? []).map((e) => e.data as CorporateActionFiling);

  // Financial statements/metrics from stored profile
  let financialStatements: FinancialStatements | null = null;
  let financialMetrics: FinancialMetrics | null = null;
  if (stored?.profile?.financial_statements) {
    financialStatements = stored.profile.financial_statements as FinancialStatements;
  }
  if (stored?.profile?.financial_metrics) {
    financialMetrics = stored.profile.financial_metrics as FinancialMetrics;
  }

  return {
    identity,
    profile,
    quote,
    history,
    financialStatements,
    financialMetrics,
    insiderTransactions,
    institutionalHoldings,
    beneficialOwnership,
    corporateActions,
    coverage,
    errors: ingestionErrors,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

import { searchStocks, type StockSearchCandidate } from "./stockResolver.js";

export async function autocompleteStocks(query: string, limit = 10): Promise<StockSearchCandidate[]> {
  return searchStocks(query, limit);
}