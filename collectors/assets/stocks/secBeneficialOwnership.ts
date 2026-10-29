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
  type SecFiling,
} from "./secEdgarFetch.js";
import { extractDocumentText } from "./secDocumentText.js";
import { buildFilingEvidence, isPercentOfClass, type FilingEvidence } from "./secEvidence.js";
import {
  childLocal,
  childText,
  childrenNamedLocal,
  descendantText,
  parseXml,
  textOf,
  type XmlNode,
} from "./secXml.js";
import {
  extractBeneficialOwnership,
  type ExtractionModelKey,
  type ExtractionUsage,
} from "../../../AI/assets/secExtractor.js";

/**
 * SEC Edgar beneficial-ownership collector (Schedules 13D and 13G).
 *
 * Discovers 13D/13G filings through the submissions endpoint and extracts the
 * reporting person, aggregate shares owned, percentage of class, voting and
 * dispositive powers, and — for 13D — the disclosed purpose of the transaction.
 *
 * Modern filings are machine-readable XML (`primary_doc.xml`) and are parsed
 * deterministically. Older filings are HTML/SGML documents; those are read
 * transiently and passed to the AI extractor when extraction is enabled. The
 * collector never writes filing documents to disk: the output keeps the
 * document URL, the filing index URL, and verbatim supporting excerpts.
 *
 * Output: collectors/assets/stocks/data/Edgar 13dg_CIK{cik}.json
 *
 * Run with:
 *   npx tsx collectors/assets/secBeneficialOwnership.ts --cik=320193 --max=20
 *   npx tsx collectors/assets/secBeneficialOwnership.ts --cik=320193 --extract=false
 *
 * Rate limiting is inherited from secEdgarFetch (1 request/second, SEC
 * User-Agent, exponential backoff on 429).
 */

export type ScheduleType = "13D" | "13G";

export interface BeneficialOwnershipPerson {
  name: string;
  cik: string | null;
  citizenshipOrOrganization: string | null;
  soleVotingPower: number | null;
  sharedVotingPower: number | null;
  soleDispositivePower: number | null;
  sharedDispositivePower: number | null;
  aggregateAmountOwned: number | null;
  percentOfClass: number | null;
  typeOfReportingPerson: string | null;
  memberOfGroup: string | null;
  fundType: string | null;
}

export interface BeneficialOwnershipFiling {
  form: string;
  scheduleType: ScheduleType;
  isAmendment: boolean;
  amendmentNumber: number | null;
  accessionNumber: string;
  filingDate: string;
  /** Cover-page event date when stated, otherwise the submission report date. */
  reportDate: string | null;
  eventDate: string | null;
  issuerName: string | null;
  issuerCik: string | null;
  issuerCusip: string | null;
  securitiesClass: string | null;
  documentUrl: string;
  filingIndexUrl: string;
  /** How the facts were read: deterministic XML, AI over a legacy document, or neither. */
  extractionStatus: "xml" | "ai" | "skipped";
  reportingPersons: BeneficialOwnershipPerson[];
  purposeOfTransaction: string | null;
  sourceOfFunds: string | null;
  evidence: FilingEvidence;
  extractionUsage: ExtractionUsage | null;
}

export interface BeneficialOwnershipReport {
  source: "SEC EDGAR Schedules 13D/13G";
  cik: string;
  entityName: string;
  generatedAt: string;
  requestedForms: ScheduleType[];
  filings: BeneficialOwnershipFiling[];
  summary: {
    filings: number;
    schedule13D: number;
    schedule13G: number;
    amendments: number;
    reportingPersons: number;
    xmlFilings: number;
    aiFilings: number;
    skippedFilings: number;
    highestReportedPercent: {
      reportingPerson: string;
      percentOfClass: number;
      accessionNumber: string;
    } | null;
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

export interface ScheduleFilingContext {
  cik: string;
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  documentUrl: string;
}

export interface CollectBeneficialOwnershipOptions {
  cik: string;
  maxFilings?: number;
  /** Schedule families to include. Defaults to both. */
  forms?: ScheduleType[];
  includeAmendments?: boolean;
  refreshSubmissions?: boolean;
  /** AI extraction for legacy HTML filings. Enabled by default. */
  extract?: boolean;
  model?: ExtractionModelKey;
  maxDocumentChars?: number;
  outputFilename?: string;
}

const DEFAULT_MAX_FILINGS = 20;
const DEFAULT_MAX_DOCUMENT_CHARS = 60_000;

/**
 * Maps a submissions form label to its schedule family.
 *
 * The submissions endpoint uses both the legacy labels (`SC 13D`, `SC 13G/A`)
 * and the current ones (`SCHEDULE 13D`, `SCHEDULE 13G/A`), so discovery cannot
 * match on a fixed list.
 */
export function scheduleFromForm(form: string): ScheduleType | null {
  const match = /^(?:SC\s+|SCHEDULE\s+)?(13D|13G)(?:\/A)?$/i.exec(form.trim());
  if (!match?.[1]) {
    return null;
  }
  return match[1].toUpperCase() === "13D" ? "13D" : "13G";
}

/** True when a submissions form label is an amendment. */
export function isAmendmentForm(form: string): boolean {
  return /\/A$/i.test(form.trim());
}

/**
 * Finds the first direct child whose local name matches, then returns its
 * trimmed text. Used for fields whose namespace prefix varies between filings.
 */
function textAt(node: XmlNode | null | undefined, ...names: string[]): string | null {
  for (const name of names) {
    const value = textOf(childLocal(node, name));
    if (value !== "") {
      return value;
    }
  }
  return null;
}

/** Parses a whole-string share count, tolerating commas. */
function parseShareCount(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[,\s]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

/**
 * Parses a percentage of class.
 *
 * Cover pages normally hold a bare number, but some filings put the figure in
 * a sentence ("approximately 6.1% of the outstanding Shares"). A percentage is
 * only accepted when it is unambiguously a percentage, never the first number
 * in unrelated text.
 */
function parsePercentOfClass(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/,/g, "").trim();
  const direct = /^(\d+(?:\.\d+)?)\s*%?$/.exec(trimmed);
  const candidate = direct?.[1]
    ? Number(direct[1])
    : (() => {
        const embedded = /(\d+(?:\.\d+)?)\s*%/.exec(trimmed);
        return embedded?.[1] ? Number(embedded[1]) : null;
      })();

  return isPercentOfClass(candidate) ? candidate : null;
}

function parseAmendmentNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function issuerCusip(issuerInfo: XmlNode | null): string | null {
  const container = childLocal(issuerInfo, "issuerCusips");
  return textAt(container, "issuerCusipNumber");
}

function filingFilerCik(headerData: XmlNode | null): string | null {
  const filerInfo = childLocal(headerData, "filerInfo");
  const filer = childLocal(filerInfo, "filer");
  const credentials = childLocal(filer, "filerCredentials");
  const cik = textAt(credentials, "cik");
  return cik ? cik.padStart(10, "0") : null;
}

function parseReportingPerson13D(node: XmlNode): BeneficialOwnershipPerson {
  return {
    name: textAt(node, "reportingPersonName") ?? "",
    cik: textAt(node, "reportingPersonCIK"),
    citizenshipOrOrganization: textAt(node, "citizenshipOrOrganization"),
    soleVotingPower: parseShareCount(textAt(node, "soleVotingPower")),
    sharedVotingPower: parseShareCount(textAt(node, "sharedVotingPower")),
    soleDispositivePower: parseShareCount(textAt(node, "soleDispositivePower")),
    sharedDispositivePower: parseShareCount(textAt(node, "sharedDispositivePower")),
    aggregateAmountOwned: parseShareCount(textAt(node, "aggregateAmountOwned")),
    percentOfClass: parsePercentOfClass(textAt(node, "percentOfClass")),
    typeOfReportingPerson: textAt(node, "typeOfReportingPerson"),
    memberOfGroup: textAt(node, "memberOfGroup"),
    fundType: textAt(node, "fundType"),
  };
}

function parseReportingPerson13G(
  node: XmlNode,
  fallbackCik: string | null,
): BeneficialOwnershipPerson {
  const powers = childLocal(node, "reportingPersonBeneficiallyOwnedNumberOfShares");

  return {
    name: textAt(node, "reportingPersonName") ?? "",
    cik: textAt(node, "reportingPersonCIK", "reportingPersonCik") ?? fallbackCik,
    citizenshipOrOrganization: textAt(node, "citizenshipOrOrganization"),
    soleVotingPower: parseShareCount(textAt(powers, "soleVotingPower")),
    sharedVotingPower: parseShareCount(textAt(powers, "sharedVotingPower")),
    soleDispositivePower: parseShareCount(textAt(powers, "soleDispositivePower")),
    sharedDispositivePower: parseShareCount(textAt(powers, "sharedDispositivePower")),
    aggregateAmountOwned: parseShareCount(
      textAt(node, "reportingPersonBeneficiallyOwnedAggregateNumberOfShares"),
    ),
    percentOfClass: parsePercentOfClass(textAt(node, "classPercent")),
    typeOfReportingPerson: textAt(node, "typeOfReportingPerson"),
    memberOfGroup: null,
    fundType: null,
  };
}

/**
 * Reads a Schedule 13D/13G XML document into the normalized filing shape.
 *
 * Exported for tests: no network access is involved.
 */
export function parseScheduleXml(
  xml: string,
  context: ScheduleFilingContext,
): BeneficialOwnershipFiling {
  const root = parseXml(xml);
  const headerData = childLocal(root, "headerData");
  const formData = childLocal(root, "formData");

  if (!formData) {
    throw new Error("Schedule document has no formData element.");
  }

  const submissionType = textAt(headerData, "submissionType") ?? context.form;
  const scheduleType: ScheduleType = /13D/i.test(submissionType) ? "13D" : "13G";
  const coverPage = childLocal(formData, "coverPageHeader");
  const issuerInfo = childLocal(coverPage, "issuerInfo");
  const items = childLocal(formData, "items1To7") ?? childLocal(formData, "items");

  const rawEventDate =
    scheduleType === "13D"
      ? textAt(coverPage, "dateOfEvent")
      : textAt(coverPage, "eventDateRequiresFilingThisStatement");
  const eventDate = toIsoDate(rawEventDate) ?? toIsoDate(context.reportDate);
  const amendmentNumber = parseAmendmentNumber(textAt(coverPage, "amendmentNo"));
  const isAmendment = isAmendmentForm(context.form) || amendmentNumber !== null;
  const filerCik = filingFilerCik(headerData);

  const reportingPersons: BeneficialOwnershipPerson[] = [];

  if (scheduleType === "13D") {
    const container = childLocal(formData, "reportingPersons");
    for (const person of childrenNamedLocal(container, "reportingPersonInfo")) {
      const parsed = parseReportingPerson13D(person);
      if (parsed.name !== "") {
        reportingPersons.push(parsed);
      }
    }
  } else {
    const details = childrenNamedLocal(formData, "coverPageHeaderReportingPersonDetails");
    for (const detail of details) {
      const parsed = parseReportingPerson13G(detail, filerCik);
      if (parsed.name !== "") {
        reportingPersons.push(parsed);
      }
    }

    // A small number of 13G filings omit the cover-page detail block. The
    // item 4 table still carries the same figures, so read it as a fallback.
    if (reportingPersons.length === 0) {
      const item4 = childLocal(items, "item4");
      const name = textAt(childLocal(items, "item2"), "filingPersonName");
      if (item4 && name) {
        const powers = childLocal(item4, "numberOfSharesPersonHas");
        reportingPersons.push({
          name,
          cik: filerCik,
          citizenshipOrOrganization: textAt(childLocal(items, "item2"), "citizenship"),
          soleVotingPower: parseShareCount(textAt(powers, "solePowerOrDirectToVote")),
          sharedVotingPower: parseShareCount(textAt(powers, "sharedPowerOrDirectToVote")),
          soleDispositivePower: parseShareCount(textAt(powers, "solePowerOrDirectToDispose")),
          sharedDispositivePower: parseShareCount(textAt(powers, "sharedPowerOrDirectToDispose")),
          aggregateAmountOwned: parseShareCount(textAt(item4, "amountBeneficiallyOwned")),
          percentOfClass: parsePercentOfClass(textAt(item4, "classPercent")),
          typeOfReportingPerson: textAt(childLocal(items, "item3"), "typeOfPersonFiling"),
          memberOfGroup: null,
          fundType: null,
        });
      }
    }
  }

  const purposeOfTransaction =
    scheduleType === "13D"
      ? (descendantText(items, "transactionPurpose") ?? null)
      : (descendantText(items, "purposeOfTransaction") ?? null);
  const sourceOfFunds =
    scheduleType === "13D" ? (descendantText(items, "fundsSource") ?? null) : null;

  // Prefer prose that states the ownership figures over boilerplate.
  const excerpt =
    scheduleType === "13D"
      ? (descendantText(items, "percentageOfClassSecurities") ?? purposeOfTransaction)
      : (childText(childLocal(formData, "coverPageHeaderReportingPersonDetails"), "comments") ??
        descendantText(items, "ownershipMoreThan5PercentOnBehalfOfAnotherPerson"));

  const reportDate = toIsoDate(context.reportDate) ?? eventDate;

  return {
    form: context.form,
    scheduleType,
    isAmendment,
    amendmentNumber,
    accessionNumber: context.accessionNumber,
    filingDate: context.filingDate,
    reportDate,
    eventDate,
    issuerName: textAt(issuerInfo, "issuerName"),
    issuerCik: textAt(issuerInfo, "issuerCIK", "issuerCik"),
    issuerCusip: issuerCusip(issuerInfo),
    securitiesClass: textAt(coverPage, "securitiesClassTitle"),
    documentUrl: context.documentUrl,
    filingIndexUrl: getFilingIndexUrl(context.cik, context.accessionNumber),
    extractionStatus: "xml",
    reportingPersons,
    purposeOfTransaction,
    sourceOfFunds,
    evidence: buildFilingEvidence({
      cik: context.cik,
      form: context.form,
      accessionNumber: context.accessionNumber,
      filingDate: context.filingDate,
      reportDate,
      documentUrl: context.documentUrl,
      excerpts: [excerpt],
    }),
    extractionUsage: null,
  };
}

function normalizeExtractedPerson(person: {
  name: string;
  cik: string | null;
  citizenshipOrOrganization: string | null;
  soleVotingPower: number | null;
  sharedVotingPower: number | null;
  soleDispositivePower: number | null;
  sharedDispositivePower: number | null;
  aggregateAmountOwned: number | null;
  percentOfClass: number | null;
  typeOfReportingPerson: string | null;
}): BeneficialOwnershipPerson {
  const shares = (value: number | null): number | null =>
    value !== null && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

  return {
    name: person.name.trim(),
    cik: person.cik,
    citizenshipOrOrganization: person.citizenshipOrOrganization,
    soleVotingPower: shares(person.soleVotingPower),
    sharedVotingPower: shares(person.sharedVotingPower),
    soleDispositivePower: shares(person.soleDispositivePower),
    sharedDispositivePower: shares(person.sharedDispositivePower),
    aggregateAmountOwned: shares(person.aggregateAmountOwned),
    percentOfClass: isPercentOfClass(person.percentOfClass) ? person.percentOfClass : null,
    typeOfReportingPerson: person.typeOfReportingPerson,
    memberOfGroup: null,
    fundType: null,
  };
}

/**
 * Extracts ownership facts from a legacy (non-XML) filing document.
 *
 * The AI module is imported lazily: discovery and the deterministic XML path
 * must work without provider credentials.
 */
async function extractLegacyFiling(
  raw: string,
  context: ScheduleFilingContext,
  options: { model?: ExtractionModelKey; maxDocumentChars: number },
): Promise<BeneficialOwnershipFiling> {
  const document = extractDocumentText(raw, options.maxDocumentChars);

  const result = await extractBeneficialOwnership(
    {
      text: document.text,
      form: context.form,
      filingDate: context.filingDate,
      accessionNumber: context.accessionNumber,
      documentUrl: context.documentUrl,
      issuerCik: context.cik,
      truncated: document.truncated,
    },
    options.model,
  );

  const extracted = result.data;
  const reportingPersons = extracted.reportingPersons
    .map((person) => normalizeExtractedPerson(person))
    .filter((person) => person.name !== "");

  const eventDate = toIsoDate(extracted.eventDate) ?? toIsoDate(context.reportDate);
  const reportDate = toIsoDate(context.reportDate) ?? eventDate;
  const scheduleType: ScheduleType = /13D/i.test(context.form) ? "13D" : "13G";

  return {
    form: context.form,
    scheduleType,
    isAmendment: isAmendmentForm(context.form) || extracted.amendmentNumber !== null,
    amendmentNumber: extracted.amendmentNumber,
    accessionNumber: context.accessionNumber,
    filingDate: context.filingDate,
    reportDate,
    eventDate,
    issuerName: extracted.issuerName,
    issuerCik: context.cik,
    issuerCusip: extracted.issuerCusip,
    securitiesClass: extracted.securitiesClass,
    documentUrl: context.documentUrl,
    filingIndexUrl: getFilingIndexUrl(context.cik, context.accessionNumber),
    extractionStatus: "ai",
    reportingPersons,
    purposeOfTransaction: extracted.purposeOfTransaction,
    sourceOfFunds: extracted.sourceOfFunds,
    evidence: buildFilingEvidence({
      cik: context.cik,
      form: context.form,
      accessionNumber: context.accessionNumber,
      filingDate: context.filingDate,
      reportDate,
      documentUrl: context.documentUrl,
      excerpts: [extracted.evidenceQuote],
      sourceText: document.text,
    }),
    extractionUsage: result.usage,
  };
}

function skippedFiling(context: ScheduleFilingContext): BeneficialOwnershipFiling {
  const eventDate = toIsoDate(context.reportDate);
  const scheduleType: ScheduleType = /13D/i.test(context.form) ? "13D" : "13G";

  return {
    form: context.form,
    scheduleType,
    isAmendment: isAmendmentForm(context.form),
    amendmentNumber: null,
    accessionNumber: context.accessionNumber,
    filingDate: context.filingDate,
    reportDate: eventDate,
    eventDate,
    issuerName: null,
    issuerCik: context.cik,
    issuerCusip: null,
    securitiesClass: null,
    documentUrl: context.documentUrl,
    filingIndexUrl: getFilingIndexUrl(context.cik, context.accessionNumber),
    extractionStatus: "skipped",
    reportingPersons: [],
    purposeOfTransaction: null,
    sourceOfFunds: null,
    evidence: buildFilingEvidence({
      cik: context.cik,
      form: context.form,
      accessionNumber: context.accessionNumber,
      filingDate: context.filingDate,
      reportDate: eventDate,
      documentUrl: context.documentUrl,
    }),
    extractionUsage: null,
  };
}

function sortFilingsNewestFirst(filings: SecFiling[]): SecFiling[] {
  return [...filings].sort((a, b) => {
    if (a.filingDate !== b.filingDate) {
      return b.filingDate.localeCompare(a.filingDate);
    }
    return b.accessionNumber.localeCompare(a.accessionNumber);
  });
}

function buildSummary(filings: BeneficialOwnershipFiling[]): BeneficialOwnershipReport["summary"] {
  let highest: BeneficialOwnershipReport["summary"]["highestReportedPercent"] = null;

  for (const filing of filings) {
    for (const person of filing.reportingPersons) {
      if (person.percentOfClass === null) {
        continue;
      }
      if (highest === null || person.percentOfClass > highest.percentOfClass) {
        highest = {
          reportingPerson: person.name,
          percentOfClass: person.percentOfClass,
          accessionNumber: filing.accessionNumber,
        };
      }
    }
  }

  return {
    filings: filings.length,
    schedule13D: filings.filter((filing) => filing.scheduleType === "13D").length,
    schedule13G: filings.filter((filing) => filing.scheduleType === "13G").length,
    amendments: filings.filter((filing) => filing.isAmendment).length,
    reportingPersons: filings.reduce((total, filing) => total + filing.reportingPersons.length, 0),
    xmlFilings: filings.filter((filing) => filing.extractionStatus === "xml").length,
    aiFilings: filings.filter((filing) => filing.extractionStatus === "ai").length,
    skippedFilings: filings.filter((filing) => filing.extractionStatus === "skipped").length,
    highestReportedPercent: highest,
  };
}

/**
 * Collects 13D/13G filings for one issuer.
 *
 * Only the normalized JSON report is written. Filing documents are fetched to
 * be read and are discarded afterwards.
 */
export async function collectBeneficialOwnership(
  options: CollectBeneficialOwnershipOptions,
): Promise<BeneficialOwnershipReport> {
  const cik = options.cik;
  const requestedForms = options.forms ?? ["13D", "13G"];
  const includeAmendments = options.includeAmendments ?? true;
  const maxFilings = options.maxFilings ?? DEFAULT_MAX_FILINGS;
  const extractEnabled = options.extract ?? true;
  const maxDocumentChars = options.maxDocumentChars ?? DEFAULT_MAX_DOCUMENT_CHARS;

  const submissions = await loadCompanySubmissions(cik, options.refreshSubmissions ?? false);
  const allFilings = parseRecentFilings(submissions, cik);

  const candidates = sortFilingsNewestFirst(
    allFilings.filter((filing) => {
      const schedule = scheduleFromForm(filing.form);
      if (schedule === null || !requestedForms.includes(schedule)) {
        return false;
      }
      if (!includeAmendments && isAmendmentForm(filing.form)) {
        return false;
      }
      return filing.primaryDocument !== "";
    }),
  ).slice(0, maxFilings);

  const filings: BeneficialOwnershipFiling[] = [];
  const errors: BeneficialOwnershipReport["errors"] = [];
  const modelIds = new Set<string>();
  let documents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  // Provider outages and quota exhaustion would otherwise cost one long timeout
  // per filing. After two consecutive failures, stop calling the model and keep
  // the deterministic filing metadata instead.
  const MAX_CONSECUTIVE_EXTRACTION_FAILURES = 2;
  let consecutiveExtractionFailures = 0;

  console.log(
    `Collecting ${candidates.length} beneficial-ownership filing(s) for CIK ${cik} ` +
      `(schedules: ${requestedForms.join(", ")})...`,
  );

  for (const filing of candidates) {
    const context: ScheduleFilingContext = {
      cik,
      form: filing.form,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      documentUrl: "",
    };

    try {
      const documentUrl = getRawFilingDocumentUrl(
        cik,
        filing.accessionNumber,
        filing.primaryDocument,
      );
      context.documentUrl = documentUrl;

      const raw = await fetchSecText(documentUrl);
      const looksLikeXml = /<edgarSubmission\b/i.test(raw);

      if (looksLikeXml) {
        const parsed = parseScheduleXml(raw, context);
        filings.push(parsed);
        console.log(
          `  ✓ ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
            `(${parsed.reportingPersons.length} person(s), XML)`,
        );
        continue;
      }

      if (!extractEnabled || consecutiveExtractionFailures >= MAX_CONSECUTIVE_EXTRACTION_FAILURES) {
        const skipped = skippedFiling(context);
        filings.push(skipped);
        console.log(
          `  - ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
            (extractEnabled
              ? "(legacy document, AI extraction unavailable this run)"
              : "(legacy document, extraction disabled)"),
        );
        continue;
      }

      const extracted = await extractLegacyFiling(raw, context, {
        ...(options.model ? { model: options.model } : {}),
        maxDocumentChars,
      });
      consecutiveExtractionFailures = 0;
      filings.push(extracted);
      documents += 1;

      if (extracted.extractionUsage) {
        modelIds.add(extracted.extractionUsage.modelId);
        inputTokens += extracted.extractionUsage.inputTokens ?? 0;
        outputTokens += extracted.extractionUsage.outputTokens ?? 0;
        totalTokens += extracted.extractionUsage.totalTokens ?? 0;
      }

      console.log(
        `  ✓ ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
          `(${extracted.reportingPersons.length} person(s), AI)`,
      );

      if (extracted.evidence.excerptsRejected > 0) {
        console.warn(
          `  ! ${filing.form} ${filing.accessionNumber}: dropped ` +
            `${extracted.evidence.excerptsRejected} excerpt(s) not found in the document`,
        );
      }
    } catch (error) {
      consecutiveExtractionFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ form: filing.form, accessionNumber: filing.accessionNumber, message });
      console.warn(`  ! ${filing.form} ${filing.accessionNumber}: ${message}`);
    }
  }

  const report: BeneficialOwnershipReport = {
    source: "SEC EDGAR Schedules 13D/13G",
    cik,
    entityName: typeof submissions["name"] === "string" ? submissions["name"] : "",
    generatedAt: new Date().toISOString(),
    requestedForms,
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

  const outputFilename = options.outputFilename ?? `Edgar 13dg_CIK${cik}.json`;
  await saveJson(outputFilename, report);
  return report;
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cik = getArg("cik") ?? "320193";
  const maxFilings = Number.parseInt(getArg("max") ?? String(DEFAULT_MAX_FILINGS), 10);
  const requested = (getArg("forms") ?? "13D,13G")
    .split(",")
    .map((form) => form.trim().toUpperCase())
    .filter((form): form is ScheduleType => form === "13D" || form === "13G");
  const forms: ScheduleType[] = requested.length > 0 ? requested : ["13D", "13G"];
  const modelArg = getArg("model");
  const model =
    modelArg === "google" ||
    modelArg === "groq" ||
    modelArg === "openai" ||
    modelArg === "openrouter" ||
    modelArg === "cloudflare"
      ? modelArg
      : undefined;

  const outputFilename = getArg("output");
  const maxChars = Number.parseInt(getArg("max-chars") ?? String(DEFAULT_MAX_DOCUMENT_CHARS), 10);

  const report = await collectBeneficialOwnership({
    cik,
    maxFilings: Number.isFinite(maxFilings) ? maxFilings : DEFAULT_MAX_FILINGS,
    forms,
    includeAmendments: getArg("amendments") !== "false",
    refreshSubmissions: getArg("refresh") === "true",
    extract: getArg("extract") !== "false",
    ...(model ? { model } : {}),
    ...(Number.isFinite(maxChars) ? { maxDocumentChars: maxChars } : {}),
    ...(outputFilename ? { outputFilename } : {}),
  });

  console.log("\nBeneficial ownership summary:");
  console.log(`  Entity:        ${report.entityName}`);
  console.log(`  Filings:       ${report.summary.filings}`);
  console.log(`  Schedule 13D:  ${report.summary.schedule13D}`);
  console.log(`  Schedule 13G:  ${report.summary.schedule13G}`);
  console.log(`  Amendments:    ${report.summary.amendments}`);
  console.log(`  Persons:       ${report.summary.reportingPersons}`);
  console.log(`  XML / AI:      ${report.summary.xmlFilings} / ${report.summary.aiFilings}`);
  if (report.summary.highestReportedPercent) {
    console.log(
      `  Largest stake: ${report.summary.highestReportedPercent.percentOfClass}% ` +
        `(${report.summary.highestReportedPercent.reportingPerson})`,
    );
  }
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
