import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  OUTPUT_DIR,
  fetchSecText,
  getFilingIndexUrl,
  getRawFilingDocumentUrl,
  loadCompanySubmissions,
  parseRecentFilings,
  saveJson,
  toIsoDate,
} from "./secEdgarFetch.js";
import { extractDocumentText } from "./secDocumentText.js";
import { buildFilingEvidence, type FilingEvidence } from "./secEvidence.js";
import type {
  CorporateActionEventType,
  CorporateActionExtraction,
} from "../../AI/assets/schemas.js";
import type { ExtractionModelKey, ExtractionUsage } from "../../AI/assets/secExtractor.js";

/**
 * SEC Edgar corporate-action and capital-raising collector.
 *
 * Discovers filings through the submissions endpoint, prioritizes new 8-K
 * filings and securities registration/offering documents, and — unless
 * extraction is disabled — reads each primary document with the AI extractor
 * to classify the event, identify the parties, and pull out dates and amounts.
 *
 * The form list is a discovery filter, not a complete taxonomy of corporate
 * actions: a company can disclose the same kind of event on a different form.
 * Each output row therefore keeps the original filing URL and the filing index
 * URL as evidence, plus verbatim excerpts that were checked against the
 * document.
 *
 * Documents are fetched transiently. Only the normalized JSON report is
 * written:
 *
 *   collectors/assets/data/Edgar corporate_actions_CIK{cik}.json
 *
 * Run with:
 *   npx tsx collectors/assets/secCorporateActions.ts --cik=320193 --max=12
 *   npx tsx collectors/assets/secCorporateActions.ts --cik=320193 --extract=false
 *
 * Rate limiting is inherited from secEdgarFetch (1 request/second, SEC
 * User-Agent, exponential backoff on 429).
 */

/**
 * Forms the collector looks for, grouped by how much they usually matter.
 *
 * Lower tiers are processed first so that a small `--max` still surfaces the
 * current-report and offering documents before routine annual proxies.
 */
export const CORPORATE_ACTION_FORM_TIERS: Readonly<Record<string, 1 | 2 | 3 | 4>> = {
  "8-K": 1,

  "S-1": 2,
  "S-3": 2,
  "424B1": 2,
  "424B3": 2,
  "424B5": 2,

  "SC TO-T": 3,
  "SC TO-I": 3,
  DEFM14A: 3,
  PREM14A: 3,

  "DEF 14A": 4,
};

/** Every accepted form label, including amendments. */
export const CORPORATE_ACTION_FORMS: readonly string[] = Object.keys(
  CORPORATE_ACTION_FORM_TIERS,
).flatMap((form) => [form, `${form}/A`]);

/** Strips the amendment suffix so tiering does not need duplicate entries. */
export function baseForm(form: string): string {
  const normalized = form.trim().toUpperCase();
  return normalized.endsWith("/A") ? normalized.slice(0, -2) : normalized;
}

/** Returns the processing tier for a form label, or null when it is not tracked. */
export function corporateActionTier(form: string): 1 | 2 | 3 | 4 | null {
  return CORPORATE_ACTION_FORM_TIERS[baseForm(form)] ?? null;
}

export interface CorporateActionEvent {
  isCorporateAction: boolean;
  eventType: CorporateActionEventType;
  summary: string;
  parties: Array<{ name: string; role: string }>;
  eventDate: string | null;
  amounts: Array<{ label: string; value: number; currency: string | null; unit: string | null }>;
  financialImplications: string;
  confidence: "low" | "medium" | "high";
}

export interface CorporateActionFiling {
  form: string;
  tier: number;
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  primaryDocDescription: string;
  documentUrl: string;
  filingIndexUrl: string;
  extractionStatus: "ai" | "skipped" | "failed";
  event: CorporateActionEvent | null;
  /** Normalized document length before truncation, for transparency. */
  documentChars: number | null;
  documentTruncated: boolean;
  evidence: FilingEvidence;
  extractionUsage: ExtractionUsage | null;
}

export interface CorporateActionsReport {
  source: "SEC EDGAR corporate actions";
  cik: string;
  entityName: string;
  generatedAt: string;
  requestedForms: string[];
  since: string | null;
  filings: CorporateActionFiling[];
  summary: {
    filings: number;
    extracted: number;
    skipped: number;
    failed: number;
    notCorporateAction: number;
    byTier: Record<string, number>;
    byEventType: Partial<Record<CorporateActionEventType, number>>;
  };
  extraction: {
    enabled: boolean;
    model: string | null;
    documents: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  errors: Array<{ form: string; accessionNumber: string; message: string }>;
}

export interface CollectCorporateActionsOptions {
  cik: string;
  maxFilings?: number;
  forms?: string[];
  refreshSubmissions?: boolean;
  /** ISO date; filings filed before it are ignored. */
  since?: string;
  /** AI extraction of the filing document. Enabled by default. */
  extract?: boolean;
  model?: ExtractionModelKey;
  maxDocumentChars?: number;
  outputFilename?: string;
}

const DEFAULT_MAX_FILINGS = 12;
const DEFAULT_MAX_DOCUMENT_CHARS = 60_000;

function normalizeEvent(extracted: CorporateActionExtraction): CorporateActionEvent {
  return {
    isCorporateAction: extracted.isCorporateAction,
    eventType: extracted.eventType,
    summary: extracted.summary.trim(),
    parties: extracted.parties.map((party) => ({
      name: party.name.trim(),
      role: party.role.trim(),
    })),
    eventDate: toIsoDate(extracted.eventDate),
    amounts: extracted.amounts.map((amount) => ({
      label: amount.label.trim(),
      value: amount.value,
      currency: amount.currency,
      unit: amount.unit,
    })),
    financialImplications: extracted.financialImplications.trim(),
    confidence: extracted.confidence,
  };
}

function buildSummary(filings: CorporateActionFiling[]): CorporateActionsReport["summary"] {
  const byTier: Record<string, number> = {};
  const byEventType: Partial<Record<CorporateActionEventType, number>> = {};

  for (const filing of filings) {
    byTier[String(filing.tier)] = (byTier[String(filing.tier)] ?? 0) + 1;
    if (filing.event) {
      byEventType[filing.event.eventType] = (byEventType[filing.event.eventType] ?? 0) + 1;
    }
  }

  return {
    filings: filings.length,
    extracted: filings.filter((filing) => filing.extractionStatus === "ai").length,
    skipped: filings.filter((filing) => filing.extractionStatus === "skipped").length,
    failed: filings.filter((filing) => filing.extractionStatus === "failed").length,
    notCorporateAction: filings.filter((filing) => filing.event?.isCorporateAction === false)
      .length,
    byTier,
    byEventType,
  };
}

/**
 * Collects corporate-action filings for one issuer.
 *
 * The output keeps document links and extracted facts only. Nothing from the
 * filing body is persisted beyond verified excerpts.
 */
export async function collectCorporateActions(
  options: CollectCorporateActionsOptions,
): Promise<CorporateActionsReport> {
  const cik = options.cik;
  const maxFilings = options.maxFilings ?? DEFAULT_MAX_FILINGS;
  const since = options.since ?? null;
  const extractEnabled = options.extract ?? true;
  const maxDocumentChars = options.maxDocumentChars ?? DEFAULT_MAX_DOCUMENT_CHARS;
  const requestedForms = (options.forms ?? [...CORPORATE_ACTION_FORMS]).map((form) =>
    form.trim().toUpperCase(),
  );
  const accepted = new Set(requestedForms);

  const submissions = await loadCompanySubmissions(cik, options.refreshSubmissions ?? false);
  const allFilings = parseRecentFilings(submissions, cik);

  const candidates = allFilings
    .filter((filing) => {
      if (!accepted.has(filing.form.trim().toUpperCase())) {
        return false;
      }
      if (since !== null && filing.filingDate < since) {
        return false;
      }
      return filing.primaryDocument !== "";
    })
    .sort((a, b) => {
      const tierA = corporateActionTier(a.form) ?? 9;
      const tierB = corporateActionTier(b.form) ?? 9;
      if (tierA !== tierB) {
        return tierA - tierB;
      }
      if (a.filingDate !== b.filingDate) {
        return b.filingDate.localeCompare(a.filingDate);
      }
      return b.accessionNumber.localeCompare(a.accessionNumber);
    })
    .slice(0, maxFilings);

  const filings: CorporateActionFiling[] = [];
  const errors: CorporateActionsReport["errors"] = [];
  const modelIds = new Set<string>();
  let documents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  console.log(`Collecting ${candidates.length} corporate-action filing(s) for CIK ${cik}...`);

  for (const filing of candidates) {
    const tier = corporateActionTier(filing.form) ?? 9;
    const documentUrl = getRawFilingDocumentUrl(
      cik,
      filing.accessionNumber,
      filing.primaryDocument,
    );
    const filingIndexUrl = getFilingIndexUrl(cik, filing.accessionNumber);
    const reportDate = toIsoDate(filing.reportDate);

    const base: Omit<CorporateActionFiling, "extractionStatus" | "event" | "evidence"> = {
      form: filing.form,
      tier,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      reportDate,
      primaryDocDescription: filing.primaryDocDescription,
      documentUrl,
      filingIndexUrl,
      documentChars: null,
      documentTruncated: false,
      extractionUsage: null,
    };

    const evidence = (excerpts: string[] = [], sourceText?: string): FilingEvidence =>
      buildFilingEvidence({
        cik,
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate,
        documentUrl,
        excerpts,
        ...(sourceText !== undefined ? { sourceText } : {}),
      });

    if (!extractEnabled) {
      filings.push({
        ...base,
        extractionStatus: "skipped",
        event: null,
        evidence: evidence(),
      });
      console.log(
        `  - ${filing.form} ${filing.filingDate} ${filing.accessionNumber} (extraction disabled)`,
      );
      continue;
    }

    try {
      const raw = await fetchSecText(documentUrl);
      const document = extractDocumentText(raw, maxDocumentChars);
      const { extractCorporateAction } = await import("../../AI/assets/secExtractor.js");

      const result = await extractCorporateAction(
        {
          text: document.text,
          form: filing.form,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber,
          documentUrl,
          issuerName: typeof submissions["name"] === "string" ? submissions["name"] : null,
          issuerCik: cik,
          truncated: document.truncated,
        },
        options.model,
      );

      const event = normalizeEvent(result.data);
      const verifiedEvidence = evidence(result.data.evidenceQuotes, document.text);

      filings.push({
        ...base,
        extractionStatus: "ai",
        event,
        documentChars: document.originalLength,
        documentTruncated: document.truncated,
        evidence: verifiedEvidence,
        extractionUsage: result.usage,
      });

      documents += 1;
      modelIds.add(result.usage.modelId);
      inputTokens += result.usage.inputTokens ?? 0;
      outputTokens += result.usage.outputTokens ?? 0;
      totalTokens += result.usage.totalTokens ?? 0;

      console.log(
        `  ✓ ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
          `(${event.eventType}${event.isCorporateAction ? "" : ", not an action"}; ` +
          `${verifiedEvidence.excerpts.length} excerpt(s))`,
      );

      if (verifiedEvidence.excerptsRejected > 0) {
        console.warn(
          `  ! ${filing.form} ${filing.accessionNumber}: dropped ` +
            `${verifiedEvidence.excerptsRejected} excerpt(s) not found in the document`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ form: filing.form, accessionNumber: filing.accessionNumber, message });

      filings.push({
        ...base,
        extractionStatus: "failed",
        event: null,
        evidence: evidence(),
      });

      console.warn(`  ! ${filing.form} ${filing.accessionNumber}: ${message}`);
    }
  }

  const report: CorporateActionsReport = {
    source: "SEC EDGAR corporate actions",
    cik,
    entityName: typeof submissions["name"] === "string" ? submissions["name"] : "",
    generatedAt: new Date().toISOString(),
    requestedForms,
    since,
    filings,
    summary: buildSummary(filings),
    extraction: {
      enabled: extractEnabled,
      model: modelIds.size > 0 ? [...modelIds].join(", ") : null,
      documents,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    errors,
  };

  const outputFilename = options.outputFilename ?? `Edgar corporate_actions_CIK${cik}.json`;
  await saveJson(outputFilename, report);
  return report;
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseModelArg(): ExtractionModelKey | undefined {
  const value = getArg("model");
  if (
    value === "google" ||
    value === "groq" ||
    value === "openai" ||
    value === "openrouter" ||
    value === "cloudflare"
  ) {
    return value;
  }
  return undefined;
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cik = getArg("cik") ?? "320193";
  const maxFilings = Number.parseInt(getArg("max") ?? String(DEFAULT_MAX_FILINGS), 10);
  const maxChars = Number.parseInt(getArg("max-chars") ?? String(DEFAULT_MAX_DOCUMENT_CHARS), 10);
  const forms = (getArg("forms") ?? CORPORATE_ACTION_FORMS.join(","))
    .split(",")
    .map((form) => form.trim().toUpperCase())
    .filter((form) => form !== "");
  const model = parseModelArg();
  const outputFilename = getArg("output");
  const since = getArg("since");

  const report = await collectCorporateActions({
    cik,
    maxFilings: Number.isFinite(maxFilings) ? maxFilings : DEFAULT_MAX_FILINGS,
    forms,
    refreshSubmissions: getArg("refresh") === "true",
    extract: getArg("extract") !== "false",
    ...(since ? { since } : {}),
    ...(model ? { model } : {}),
    ...(Number.isFinite(maxChars) ? { maxDocumentChars: maxChars } : {}),
    ...(outputFilename ? { outputFilename } : {}),
  });

  console.log("\nCorporate actions summary:");
  console.log(`  Entity:        ${report.entityName}`);
  console.log(`  Filings:       ${report.summary.filings}`);
  console.log(`  Extracted:     ${report.summary.extracted}`);
  console.log(`  Not an action: ${report.summary.notCorporateAction}`);
  if (report.errors.length > 0) {
    console.log(`  Errors:        ${report.errors.length}`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
