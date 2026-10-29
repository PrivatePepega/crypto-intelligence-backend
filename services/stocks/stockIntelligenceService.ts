import "dotenv/config";

import pool from "../../config/database.js";
import { fmpGet, setFmpRequestsPerMinute, setFmpRequestBudget, resetFmpRequestUsage } from "../../collectors/assets/commodities/fmpClient.js";
import { resolveStock, type StockIdentity } from "./stockResolver.js";
import { createDbClient, getStockCoverage, type StockCoverageReport } from "./stockCoverage.js";
import { createIngestionPlan, type IngestionPlan } from "./freshnessPolicy.js";
import {
  normalizeStockProfile,
  normalizeStockQuote,
  normalizeStockHistory,
  mergeStockHistories,
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
  insertInstitutionalHoldingsPeriod,
  readStockState,
  withTransaction,
  type CandleUpsertResult,
  type SnapshotInsertResult,
  type DbClient,
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
  GetOrIngestStockOptions,
  DatasetName,
  FinancialStatements,
  FinancialMetrics,
  InsiderTransaction,
  ThirteenFPeriod,
  BeneficialOwnershipFiling,
  CorporateActionFiling,
} from "../../types/stocks/stock.types.js";
import {
  toCoverageSummary,
  type CleanStockProfile,
  type CleanStockQuote,
  type CleanStockCandle,
  type CleanStockHistory,
  type CleanFinancialStatements,
  type CleanFinancialStatementPeriod,
  type CleanFinancialMetrics,
  type CleanSecEvent,
  type CollectionMetadata,
  type DatasetDiagnostic,
  type DatasetRunStatus,
  type SecEventSource,
  type StockIntelligenceServiceResult,
} from "../../types/stocks/api.types.js";
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
  const assetId = identity.assetId;

  // Update profile with merged data from FMP profile
  const updatedProfile: StockProfile = {
    ...profile,
    assetId,
  };

  await withTransaction(async (client) => {
    await upsertStockProfile(client, assetId, updatedProfile);
    // Persist canonical asset attributes that come from the provider profile
    // (website, provider identifiers). The asset row already exists.
    await upsertStockAsset(client, { ...identity, assetId }, updatedProfile);
  });

  return { assetId, profile: updatedProfile };
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
  // Only parsed ownership records are business data. Filings that were skipped
  // or whose extraction failed are reported as collection diagnostics and
  // retried on a later run, never stored as empty events.
  const records = result.filings.filter(
    (filing) => filing.extractionStatus === "xml" || filing.extractionStatus === "ai",
  );

  for (const filing of records) {
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
  // A filing whose extraction failed has no normalized event. Storing it would
  // permanently keep an empty record because event inserts are idempotent, so
  // it is reported as a diagnostic and retried instead.
  const records = result.filings.filter(
    (filing) => filing.extractionStatus === "ai" && filing.event !== null,
  );

  for (const filing of records) {
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
  let inserted = 0;
  const collectedAt = result.collectedAt;

  for (const period of result.periods) {
    // The first filing identifies the period. Manager identity comes from the
    // collector so the stored record is attributable to its filer.
    const filing = period.filings[0];
    if (!filing) continue;

    try {
      const eventResult = await withTransaction(async (client) => {
        return insertInstitutionalHoldingsPeriod(
          client,
          assetId,
          {
            reportPeriod: period.reportPeriod,
            holdings: period.holdings as unknown as Array<Record<string, unknown>>,
            filings: period.filings,
            totals: period.totals,
          },
          period.managerCik,
          period.managerName ?? "unknown",
          filing.accessionNumber,
          filing.filingDate,
          collectedAt,
        );
      });
      if (eventResult.inserted) inserted++;
    } catch (error) {
      console.error(
        `[STOCKS] Failed to persist 13F period ${period.reportPeriod} for ${period.managerCik}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return inserted;
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
  /** Records actually written this run, keyed by dataset. */
  written: Partial<Record<DatasetName, number>>;
  errors: Array<{ dataset: DatasetName; message: string }>;
}

/**
 * Converts a database NUMERIC/string value to a finite number.
 * Falls back to 0 only for OHLC fields, which are always present in stored rows.
 */
function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts an internal error to a short message that is safe for API clients:
 * no stack traces, no absolute filesystem paths.
 */
function toPublicMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .split("\n")[0]!
    .replace(/[A-Za-z]:\\[^\s"']+/g, "<local file>")
    .replace(/\/[\w.-]+\/[\w./-]+/g, "<local file>")
    .slice(0, 300);
}

/**
 * Runs a collector so a single failing dataset cannot abort the whole run.
 * Returns null when the collector threw; the reason is appended to `errors`.
 */
async function runCollector<T>(
  dataset: DatasetName,
  errors: Array<{ dataset: DatasetName; message: string }>,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = toPublicMessage(error);
    console.error(`[STOCKS] Collector ${dataset} failed:`, message);
    errors.push({ dataset, message });
    return null;
  }
}

function appendCollectorErrors(
  errors: Array<{ dataset: DatasetName; message: string }>,
  dataset: DatasetName,
  collectorErrors: Array<{ message: string }>,
): void {
  if (collectorErrors.length === 0) return;
  errors.push({
    dataset,
    message: collectorErrors.map((entry) => toPublicMessage(entry.message)).join("; "),
  });
}

async function executeIngestionPlan(
  identity: StockIdentity,
  plan: IngestionPlan,
  options: { historyRange?: { from: string; to: string } } = {},
): Promise<IngestionResult> {
  const errors: Array<{ dataset: DatasetName; message: string }> = [];
  const written: Partial<Record<DatasetName, number>> = {};

  // Default history range: last 365 days
  const to = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
  const from = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // The canonical asset is created before this function runs, so assetId is
  // always available. Keep a fallback lookup for callers that pass an
  // unresolved identity.
  let assetId = identity.assetId;
  if (!assetId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id FROM assets.assets WHERE asset_type = 'stock' AND lower(symbol) = lower($1) LIMIT 1`,
        [identity.ticker],
      );
      if (result.rows.length > 0) {
        assetId = result.rows[0]["id"] as string;
      }
    } finally {
      client.release();
    }
  }

  if (!assetId) {
    errors.push({ dataset: "profile", message: "Canonical asset is missing; ingestion cannot proceed." });
    return {
      profile: { ok: false, profile: null, error: "No canonical asset" },
      quote: { ok: false, quote: null, error: "No canonical asset" },
      history: { ok: false, history: null, error: "No canonical asset", candles: null },
      fundamentals: { ok: false, statements: null, metrics: null, error: "No canonical asset" },
      insider: { ok: false, transactions: [], count: 0, error: "No canonical asset" },
      institutional: { ok: false, periods: [], count: 0, error: "No canonical asset" },
      beneficial: { ok: false, filings: [], count: 0, error: "No canonical asset" },
      corporate: { ok: false, filings: [], count: 0, error: "No canonical asset" },
      written,
      errors,
    };
  }

  // 1. Profile (source of exchange, sector, industry, business summary)
  let profileResult: NormalizedProfileResult = { ok: false, reason: "not attempted" };
  let profile: StockProfile | null = null;

  if (plan.steps.some((s) => s.dataset === "profile")) {
    try {
      profileResult = await fetchFmpProfile(identity.ticker);
      if (!profileResult.ok) {
        errors.push({ dataset: "profile", message: profileResult.reason });
      } else {
        const persisted = await persistProfile(identity, profileResult);
        assetId = persisted.assetId;
        profile = persisted.profile;
        written.profile = profile ? 1 : 0;
      }
    } catch (error) {
      errors.push({ dataset: "profile", message: toPublicMessage(error) });
    }
  }

  // 2. Quote
  let quoteResult: NormalizedQuoteResult = { ok: false, reason: "not attempted" };
  let quote: StockQuote | null = null;

  if (plan.steps.some((s) => s.dataset === "quote")) {
    try {
      const currency = profile?.currency ?? null;
      quoteResult = await fetchFmpQuote(identity.ticker, currency);
      if (!quoteResult.ok) {
        errors.push({ dataset: "quote", message: quoteResult.reason });
      } else {
        const sourceUrl = `https://financialmodelingprep.com/stable/quote?symbol=${identity.ticker}`;
        const { quote: q, snapshot } = await persistQuote(assetId, quoteResult, sourceUrl);
        quote = q;
        written.quote = snapshot?.inserted ? 1 : 0;
      }
    } catch (error) {
      errors.push({ dataset: "quote", message: toPublicMessage(error) });
    }
  }

  // 3. History
  let historyResult: StockHistory | null = null;
  let candleResult: CandleUpsertResult | null = null;

  if (plan.steps.some((s) => s.dataset === "history")) {
    try {
      historyResult = await fetchFmpHistory(identity.ticker, from, to);
      candleResult = await persistHistory(assetId, historyResult, profile?.currency ?? null);
      written.history = candleResult.inserted + candleResult.updated;
    } catch (error) {
      errors.push({ dataset: "history", message: `History collection failed: ${toPublicMessage(error)}` });
    }
  }

  // 4. Fundamentals
  let fundamentalsResult: FundamentalsResult = { statements: null, metrics: null, error: null, collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "financial_statements" || s.dataset === "financial_metrics")) {
    const collected = await runCollector("financial_statements", errors, () =>
      collectFundamentals({ ...identity, assetId }),
    );
    if (collected) {
      fundamentalsResult = collected;
      if (collected.error) {
        errors.push({ dataset: "financial_statements", message: collected.error });
      } else {
        try {
          await persistFundamentals(assetId, collected);
          written.financial_statements = collected.statements?.annual.length ?? 0;
          written.financial_metrics = collected.metrics?.periods.length ?? 0;
        } catch (error) {
          errors.push({ dataset: "financial_statements", message: `Persist failed: ${toPublicMessage(error)}` });
        }
      }
    }
  }

  // 5. Insider transactions
  let insiderResult: InsiderCollectionResult = { transactions: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "insider_transactions")) {
    const collected = await runCollector("insider_transactions", errors, () =>
      collectInsiderTransactions({ ...identity, assetId }),
    );
    if (collected) {
      insiderResult = collected;
      appendCollectorErrors(errors, "insider_transactions", collected.errors);
      // Persist whatever succeeded; partial collector errors do not discard data.
      if (collected.transactions.length > 0) {
        try {
          written.insider_transactions = await persistInsiderTransactions(assetId, collected);
        } catch (error) {
          errors.push({ dataset: "insider_transactions", message: `Persist failed: ${toPublicMessage(error)}` });
        }
      }
    }
  }

  // 6. Institutional holdings (13F)
  let institutionalResult: InstitutionalHoldingsResult = { periods: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "institutional_holdings")) {
    const collected = await runCollector("institutional_holdings", errors, () =>
      collectInstitutionalHoldings({ ...identity, assetId }),
    );
    if (collected) {
      institutionalResult = collected;
      appendCollectorErrors(errors, "institutional_holdings", collected.errors);
      if (collected.periods.length > 0) {
        try {
          written.institutional_holdings = await persistInstitutionalHoldings(assetId, collected);
        } catch (error) {
          errors.push({ dataset: "institutional_holdings", message: `Persist failed: ${toPublicMessage(error)}` });
        }
      }
    }
  }

  // 7. Beneficial ownership (13D/13G)
  let beneficialResult: BeneficialOwnershipResult = { filings: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "beneficial_ownership")) {
    const collected = await runCollector("beneficial_ownership", errors, () =>
      collectBeneficialOwnershipFilings({ ...identity, assetId }),
    );
    if (collected) {
      beneficialResult = collected;
      appendCollectorErrors(errors, "beneficial_ownership", collected.errors);
      if (collected.filings.length > 0) {
        try {
          written.beneficial_ownership = await persistBeneficialOwnership(assetId, collected);
        } catch (error) {
          errors.push({ dataset: "beneficial_ownership", message: `Persist failed: ${toPublicMessage(error)}` });
        }
      }
    }
  }

  // 8. Corporate actions
  let corporateResult: CorporateActionsResult = { filings: [], errors: [], collectedAt: new Date().toISOString() };

  if (plan.steps.some((s) => s.dataset === "corporate_actions")) {
    const collected = await runCollector("corporate_actions", errors, () =>
      collectCorporateActionFilings({ ...identity, assetId }),
    );
    if (collected) {
      corporateResult = collected;
      appendCollectorErrors(errors, "corporate_actions", collected.errors);
      if (collected.filings.length > 0) {
        try {
          written.corporate_actions = await persistCorporateActions(assetId, collected);
        } catch (error) {
          errors.push({ dataset: "corporate_actions", message: `Persist failed: ${toPublicMessage(error)}` });
        }
      }
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
      error: insiderResult.errors.length > 0 ? insiderResult.errors[0]?.message ?? null : null,
    },
    institutional: {
      ok: institutionalResult.errors.length === 0,
      periods: institutionalResult.periods,
      count: institutionalResult.periods.length,
      error: institutionalResult.errors.length > 0 ? institutionalResult.errors[0]?.message ?? null : null,
    },
    beneficial: {
      ok: beneficialResult.errors.length === 0,
      filings: beneficialResult.filings,
      count: beneficialResult.filings.length,
      error: beneficialResult.errors.length > 0 ? beneficialResult.errors[0]?.message ?? null : null,
    },
    corporate: {
      ok: corporateResult.errors.length === 0,
      filings: corporateResult.filings,
      count: corporateResult.filings.length,
      error: corporateResult.errors.length > 0 ? corporateResult.errors[0]?.message ?? null : null,
    },
    written,
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Main Service Entry                               */
/* -------------------------------------------------------------------------- */

/**
 * Main entry point: resolves a stock, checks coverage, executes the ingestion
 * plan, persists what was collected, and returns the stored intelligence.
 *
 * Diagnostics are collected during the run and returned under metadata. A
 * single failing dataset never aborts the request: whatever succeeded is
 * persisted and read back, and the failure is reported explicitly.
 */
export async function getOrIngestStock(
  query: string,
  options: GetOrIngestStockOptions = {},
): Promise<StockIntelligenceServiceResult> {
  const startTime = Date.now();
  const requestedAt = new Date(startTime).toISOString();
  const refresh = options.refresh === true;
  const readOnly = options.readOnly === true;
  
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

  // 2. Ensure canonical asset exists in database (create if not exists)
  // This must happen regardless of readOnly mode so identity.assetId is always populated
  const assetResult = await withTransaction(async (client) => {
    return upsertStockAsset(client, identity, null);
  });
  identity = { ...identity, assetId: assetResult.asset_id };

  // 3. Get coverage report
  const coverage = await getStockCoverage(identity);

  // 3. Read stored data for response (always, even in read-only mode).
  // `readStockState` issues independent reads, so it uses the pool rather than
  // a single checked-out connection.
  let stored: Awaited<ReturnType<typeof readStockState>> | null = null;
  stored = await readStockState(createDbClient(), identity.ticker, {
    recentCandles: 30,
    recentSnapshots: 5,
    recentEvents: 200,
  });

  // 4. If read-only, return current state without ingestion
  if (readOnly) {
    const durationMs = Date.now() - startTime;
    return buildResult(identity, coverage, stored, null, durationMs, {
      refresh,
      readOnly: true,
      requestedAt,
    });
  }

  // 4. Create ingestion plan
  const plan = createIngestionPlan(identity.assetId || "", identity.ticker, coverage, {
    refresh,
    ...(options.include ? { include: options.include } : {}),
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

  // 7. Read back stored data for response (re-read after ingestion)
  const freshStored = await readStockState(createDbClient(), identity.ticker, {
    recentCandles: 30,
    recentSnapshots: 5,
    recentEvents: 200,
  });

  const durationMs = Date.now() - startTime;
  return buildResult(identity, freshCoverage, freshStored, ingestionResult, durationMs, {
    refresh,
    readOnly: false,
    requestedAt,
  });
}

/**
 * Builds the clean service result from stored data.
 *
 * Only persisted business records are returned here. Everything about how this
 * particular call was executed (coverage, per-dataset outcome, warnings,
 * errors) goes into `collectionMetadata` and never into the business objects.
 */
function buildResult(
  identity: StockIdentity,
  coverage: StockCoverageReport,
  stored: Awaited<ReturnType<typeof readStockState>> | null,
  ingestionResult: IngestionResult | null,
  durationMs: number,
  options: { refresh: boolean; readOnly: boolean; requestedAt: string },
): StockIntelligenceServiceResult {
  // ------------------------------------------------------------------ profile
  let profile: CleanStockProfile | null = null;
  if (stored?.profile) {
    const p = stored.profile;
    profile = {
      assetId: identity.assetId,
      ticker: identity.ticker,
      companyName: identity.companyName,
      exchange: (p["exchange"] as string | null) ?? null,
      cik: identity.cik,
      sector: (p["sector"] as string | null) ?? null,
      industry: (p["industry"] as string | null) ?? null,
      // Business summary lives only in assets.stocks, never on the asset row.
      description: (p["business_summary"] as string | null) ?? null,
      // Website is a canonical asset attribute (assets.assets.website_url).
      website: stored.asset?.website_url ?? null,
      updatedAt: (p["updated_at"] as string | null) ?? null,
    };
  }

  // -------------------------------------------------------------------- quote
  let quote: CleanStockQuote | null = null;
  const latestSnapshot = stored?.snapshots[0];
  if (latestSnapshot) {
    const data = latestSnapshot["data"] as Record<string, unknown>;
    if (typeof data["price"] === "number") {
      quote = {
        provider: "fmp",
        symbol: identity.ticker,
        providerSymbol: (data["providerSymbol"] as string) ?? identity.ticker,
        name: (data["name"] as string | null) ?? null,
        currency: (data["currency"] as string | null) ?? null,
        price: data["price"] as number,
        change: (data["change"] as number | null) ?? null,
        changePercent: (data["changePercent"] as number | null) ?? null,
        open: (data["open"] as number | null) ?? null,
        previousClose: (data["previousClose"] as number | null) ?? null,
        dayLow: (data["dayLow"] as number | null) ?? null,
        dayHigh: (data["dayHigh"] as number | null) ?? null,
        yearLow: (data["yearLow"] as number | null) ?? null,
        yearHigh: (data["yearHigh"] as number | null) ?? null,
        volume: (data["volume"] as number | null) ?? null,
        averageVolume: (data["averageVolume"] as number | null) ?? null,
        marketCap: (data["marketCap"] as number | null) ?? null,
        priceAvg50: (data["priceAvg50"] as number | null) ?? null,
        priceAvg200: (data["priceAvg200"] as number | null) ?? null,
        exchange: (data["exchange"] as string | null) ?? null,
        observedAt: (latestSnapshot["observed_at"] as string | null) ?? null,
        collectedAt: (latestSnapshot["collected_at"] as string) ?? "",
        snapshotKey: (data["snapshotKey"] as string) ?? "",
      };
    }
  }

  // ------------------------------------------------------------------ history
  let history: CleanStockHistory | null = null;
  if (stored && stored.price_history.candle_count > 0) {
    // Stored rows come back newest-first; candles are returned oldest-first.
    // NUMERIC columns arrive from PostgreSQL as strings, so every price and
    // volume is coerced to a real number here.
    const orderedCandles = stored.price_history.recent
      .map((row) => ({
        timestamp: row["timestamp"] as string,
        open: toFiniteNumber(row["open"]),
        high: toFiniteNumber(row["high"]),
        low: toFiniteNumber(row["low"]),
        close: toFiniteNumber(row["close"]),
        volume: toNumberOrNull(row["volume"]),
      }))
      .reverse();

    const candles: CleanStockCandle[] = orderedCandles.map((candle, index) => {
      const previous = orderedCandles[index - 1];
      let change: number | null = null;
      let changePercent: number | null = null;
      if (previous && previous.close !== 0) {
        change = candle.close - previous.close;
        changePercent = (change / previous.close) * 100;
      }
      return {
        symbol: identity.ticker,
        date: candle.timestamp ? candle.timestamp.slice(0, 10) : "",
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        change,
        changePercent,
        vwap: null,
      };
    });

    history = {
      provider: "fmp",
      symbol: identity.ticker,
      interval: "1d",
      // The response carries the most recent candles only, so the effective
      // range describes what is actually in `candles`.
      effectiveFrom: candles[0]?.date ?? null,
      effectiveTo: candles[candles.length - 1]?.date ?? null,
      candles,
    };
  }

  // -------------------------------------------------------------- fundamentals
  let financialStatements: CleanFinancialStatements | null = null;
  let financialMetrics: CleanFinancialMetrics | null = null;

  const rawStatements = stored?.profile?.["financial_statements"];
  if (rawStatements && typeof rawStatements === "object") {
    const fs = rawStatements as FinancialStatements;
    financialStatements = {
      annual: fs.annual.map(toCleanStatementPeriod),
      quarterly: fs.quarterly.map(toCleanStatementPeriod),
      source: fs.source,
      cik: fs.cik,
      entityName: fs.entityName,
      normalizedAt: fs.normalizedAt,
    };
  }

  const rawMetrics = stored?.profile?.["financial_metrics"];
  if (rawMetrics && typeof rawMetrics === "object") {
    const fm = rawMetrics as FinancialMetrics;
    financialMetrics = {
      periods: fm.periods.map((p) => ({
        fy: p.fy,
        period: p.period,
        grossMargin: p.grossMargin,
        operatingMargin: p.operatingMargin,
        netMargin: p.netMargin,
        currentRatio: p.currentRatio,
        debtToEquity: p.debtToEquity,
        freeCashFlow: p.freeCashFlow,
        returnOnAssets: p.returnOnAssets,
        returnOnEquity: p.returnOnEquity,
        revenueGrowth: p.revenueGrowth,
      })),
      source: fm.source,
      cik: fm.cik,
      computedAt: fm.computedAt,
    };
  }

  // ------------------------------------------------------------ SEC datasets
  const insiderTransactions = toCleanEvents<InsiderTransaction>(
    identity.assetId,
    "sec_insider",
    stored?.sec_events.insider ?? [],
  );
  const institutionalHoldings = toCleanEvents<ThirteenFPeriod>(
    identity.assetId,
    "sec_13f",
    stored?.sec_events.institutional ?? [],
  );
  const beneficialOwnership = toCleanEvents<BeneficialOwnershipFiling>(
    identity.assetId,
    "sec_13dg",
    stored?.sec_events.beneficial_ownership ?? [],
  );
  const corporateActions = toCleanEvents<CorporateActionFiling>(
    identity.assetId,
    "sec_corporate_action",
    stored?.sec_events.corporate_actions ?? [],
  );

  // -------------------------------------------------------------- diagnostics
  // Availability is expressed in the same terms as the response payload
  // (observations, periods, candles, events), not raw table row counts.
  const availableByDataset: Partial<Record<DatasetName, number>> = {
    profile: profile ? 1 : 0,
    quote: quote ? 1 : 0,
    history: stored?.price_history.candle_count ?? 0,
    financial_statements:
      (financialStatements?.annual.length ?? 0) +
      (financialStatements?.quarterly.length ?? 0),
    financial_metrics: financialMetrics?.periods.length ?? 0,
    insider_transactions: insiderTransactions.length,
    institutional_holdings: institutionalHoldings.length,
    beneficial_ownership: beneficialOwnership.length,
    corporate_actions: corporateActions.length,
  };

  const errorsByDataset = new Map<DatasetName, string>();
  for (const error of ingestionResult?.errors ?? []) {
    const previous = errorsByDataset.get(error.dataset);
    errorsByDataset.set(
      error.dataset,
      previous ? `${previous}; ${error.message}` : error.message,
    );
  }

  const datasets: DatasetDiagnostic[] = coverage.datasets.map((entry) => {
    const dataset = entry.dataset as DatasetName;
    const collected = ingestionResult?.written[dataset];
    const error = errorsByDataset.get(dataset);
    const recordsAvailable = availableByDataset[dataset] ?? entry.recordCount;

    let status: DatasetRunStatus;
    if (error) {
      status =
        recordsAvailable > 0 || (collected ?? 0) > 0 ? "partial" : "failed";
    } else if (collected !== undefined) {
      status = "success";
    } else if (recordsAvailable > 0) {
      // Persisted by an earlier run and still fresh; nothing to do this time.
      status = "success";
    } else {
      status = "skipped";
    }

    const diagnostic: DatasetDiagnostic = {
      dataset,
      status,
      recordsAvailable,
    };
    if (collected !== undefined) {
      diagnostic.recordsCollected = collected;
    }
    if (error) {
      diagnostic.message = toPublicMessage(error);
    } else if (status === "skipped") {
      diagnostic.message = options.readOnly
        ? "Read-only request: this dataset was not collected."
        : "No records are available for this dataset yet.";
    }
    return diagnostic;
  });

  const warnings: string[] = [];
  if (options.readOnly) {
    warnings.push(
      "Read-only request: stored data was returned without contacting providers.",
    );
  }
  for (const diagnostic of datasets) {
    if (diagnostic.status === "partial") {
      warnings.push(
        `${diagnostic.dataset}: returned partial data${
          diagnostic.message ? ` (${diagnostic.message})` : ""
        }`,
      );
    }
  }

  const errors = datasets
    .filter((d) => d.status === "failed" || d.status === "partial")
    .map((d) => ({
      dataset: d.dataset,
      message: d.message ?? "Collection failed without a provider message.",
    }));

  const collectionMetadata: CollectionMetadata = {
    requestedAt: options.requestedAt,
    durationMs,
    refresh: options.refresh,
    readOnly: options.readOnly,
    coverage: toCoverageSummary(coverage),
    datasets,
    warnings,
    errors,
  };

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
    collectionMetadata,
  };
}

/** Flattens one stored statement period into the API shape. */
function toCleanStatementPeriod(
  period: FinancialStatements["annual"][number],
): CleanFinancialStatementPeriod {
  return {
    fy: period.fy,
    period: period.period,
    concepts: Object.fromEntries(
      Object.entries(period.concepts).map(([key, concept]) => [
        key,
        {
          concept: concept.concept,
          value: concept.value,
          unit: concept.unit,
          periodEnd: concept.periodEnd,
          filingDate: concept.filingDate,
          accessionNumber: concept.accessionNumber,
          form: concept.form,
        },
      ]),
    ),
  };
}

/** Maps persisted `assets.information` rows to clean per-event API records. */
function toCleanEvents<T>(
  assetId: string,
  source: SecEventSource,
  rows: Array<Record<string, unknown>>,
): Array<CleanSecEvent<T>> {
  return rows.map((row) => {
    const data = (row["data"] ?? {}) as Record<string, unknown>;
    const id = String(row["id"] ?? "");
    return {
      id,
      assetId,
      informationType: "event",
      source,
      data: data as T,
      sourceUrl: (row["source_url"] as string | null) ?? null,
      observedAt: (row["observed_at"] as string | null) ?? null,
      collectedAt: (row["collected_at"] as string) ?? "",
      dedupeKey: (data["dedupe_key"] as string) ?? id,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

import { searchStocks, type StockSearchCandidate } from "./stockResolver.js";

export async function autocompleteStocks(query: string, limit = 10): Promise<StockSearchCandidate[]> {
  return searchStocks(query, limit);
}
