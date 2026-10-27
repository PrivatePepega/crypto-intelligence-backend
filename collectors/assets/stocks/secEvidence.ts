import { getFilingIndexUrl } from "./secEdgarFetch.js";
import { containsQuote } from "./secDocumentText.js";

/**
 * Evidence records kept with every extracted SEC event.
 *
 * The filing itself is never stored. The evidence block holds the stable links
 * back to it plus verbatim excerpts that were checked against the document, so
 * a reader can reopen the source and see the sentence a fact came from.
 */

/** Longest excerpt kept, in characters. */
const MAX_EXCERPT_CHARS = 500;

export interface FilingEvidence {
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  documentUrl: string;
  filingIndexUrl: string;
  /** Verbatim sentences from the filing, trimmed to a readable length. */
  excerpts: string[];
  /**
   * False when at least one model-supplied excerpt could not be found in the
   * document and was dropped.
   */
  excerptsVerified: boolean;
  /** How many candidate excerpts were dropped because they were not found. */
  excerptsRejected: number;
}

export interface EvidenceInput {
  cik: string | number;
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate?: string | null;
  documentUrl: string;
  /** Candidate excerpts. */
  excerpts?: Array<string | null | undefined>;
  /**
   * Normalized document text. When provided, every excerpt must appear in it;
   * excerpts that do not are dropped and the result is flagged unverified.
   */
  sourceText?: string;
}

/** Trims an excerpt to a sentence or word boundary within the length budget. */
export function trimExcerpt(value: string, maxChars: number = MAX_EXCERPT_CHARS): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastSentence = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
  );

  if (lastSentence > maxChars * 0.5) {
    return `${slice.slice(0, lastSentence + 1).trim()}`;
  }

  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > 0 ? slice.slice(0, lastSpace).trim() : slice.trim();
}

/**
 * Builds the evidence block for one filing.
 *
 * When `sourceText` is present the excerpts are verified against it. A model
 * quote that is not in the document is dropped rather than stored, because an
 * unverifiable quote is indistinguishable from an invented one.
 */
export function buildFilingEvidence(input: EvidenceInput): FilingEvidence {
  const candidates = (input.excerpts ?? [])
    .map((value) => (value ?? "").replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0);

  let verified = true;
  let rejected = 0;
  let excerpts: string[];

  if (input.sourceText === undefined) {
    excerpts = candidates.map((value) => trimExcerpt(value)).filter((value) => value.length > 0);
  } else {
    excerpts = [];
    for (const candidate of candidates) {
      if (containsQuote(input.sourceText, candidate)) {
        excerpts.push(trimExcerpt(candidate));
      } else {
        verified = false;
        rejected += 1;
      }
    }
  }

  return {
    form: input.form,
    accessionNumber: input.accessionNumber,
    filingDate: input.filingDate,
    reportDate: input.reportDate ?? null,
    documentUrl: input.documentUrl,
    filingIndexUrl: getFilingIndexUrl(input.cik, input.accessionNumber),
    excerpts,
    excerptsVerified: verified,
    excerptsRejected: rejected,
  };
}

/** True when a value looks like a percentage of a class (0-100). */
export function isPercentOfClass(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}
