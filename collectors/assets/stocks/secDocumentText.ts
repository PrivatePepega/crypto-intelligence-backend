/**
 * HTML/SGML to plain text for SEC filing documents.
 *
 * Filings are read transiently for extraction; nothing here writes to disk.
 * The result is a whitespace-normalized string that is safe to hand to a model
 * or to quote as evidence. It is intentionally lossy: tables collapse into
 * running text and formatting is discarded, because the extractor only needs
 * the statements and numbers a filing discloses.
 */

/** Default character budget for one document sent to the extractor. */
export const DEFAULT_MAX_DOCUMENT_CHARS = 60_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  ndash: "-",
  mdash: "-",
  lsquo: "'",
  rsquo: "'",
  sbquo: "'",
  ldquo: '"',
  rdquo: '"',
  bdquo: '"',
  hellip: "...",
  bull: "*",
  middot: "*",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
  deg: " degrees",
  times: "x",
  euro: "EUR",
  pound: "GBP",
  yen: "JPY",
  cent: " cents",
  sect: "Section",
  para: "Paragraph",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Legacy filings are served as full SGML submissions that wrap the readable
 * document in `<DOCUMENT>...<TEXT>...</TEXT>`. Keep only the text payload.
 */
function stripSgmlEnvelope(raw: string): string {
  if (!/<(?:SEC-)?DOCUMENT>/i.test(raw)) {
    return raw;
  }

  const start = raw.search(/<TEXT>/i);
  if (start === -1) {
    return raw;
  }

  const end = raw.search(/<\/TEXT>/i);
  return raw.slice(start + "<TEXT>".length, end === -1 ? raw.length : end);
}

function stripNonContentBlocks(html: string): string {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      // Inline XBRL headers carry hidden context and unit definitions, not
      // disclosure text. They also repeat filing metadata that confuses dates.
      .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, " ")
      .replace(/<ix:hidden\b[\s\S]*?<\/ix:hidden>/gi, " ")
  );
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section|article)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/**
 * Converts an HTML or SGML filing document to normalized plain text.
 *
 * Tags are removed before entities are decoded so escaped markup in the
 * disclosure (`&lt;`) cannot be mistaken for document structure.
 */
export function htmlToText(raw: string): string {
  const withoutEnvelope = stripSgmlEnvelope(raw);
  const withoutBlocks = stripNonContentBlocks(withoutEnvelope);
  const withoutTags = stripTags(withoutBlocks);
  const decoded = decodeEntities(withoutTags);

  return decoded
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalized plain text plus the truncation outcome, so callers can tell the
 * model (and the run log) that it saw only part of a long document.
 */
export interface ExtractedDocumentText {
  text: string;
  /** Length of the normalized text before truncation. */
  originalLength: number;
  truncated: boolean;
}

/**
 * Converts a filing document to text and truncates it to a character budget.
 *
 * Truncation happens at a word boundary where possible so a sentence is not
 * cut mid-token, which would make a quoted excerpt unusable as evidence.
 */
export function extractDocumentText(
  raw: string,
  maxChars: number = DEFAULT_MAX_DOCUMENT_CHARS,
): ExtractedDocumentText {
  const text = htmlToText(raw);

  if (text.length <= maxChars) {
    return { text, originalLength: text.length, truncated: false };
  }

  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.8 ? slice.slice(0, lastSpace) : slice;

  return { text: cut, originalLength: text.length, truncated: true };
}

/**
 * Case- and whitespace-insensitive form of a string, for checking whether a
 * model-provided quote actually appears in the source document.
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `quote` appears in `source` after normalization. Used to keep only
 * excerpts the document actually contains, so evidence cannot be invented.
 */
export function containsQuote(source: string, quote: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < 12) {
    return false;
  }
  return normalizeForMatch(source).includes(normalizedQuote);
}
