import { z } from "zod";

/**
 * Schemas for facts extracted from SEC filing documents.
 *
 * These describe what a model is allowed to return, not what the filing
 * "means". Every field is nullable where a document may legitimately omit it:
 * a missing value must stay missing rather than be inferred from another
 * filing or from general knowledge about the company.
 */

const isoDateOrNull = z
  .string()
  .nullable()
  .describe("Date in YYYY-MM-DD form, or null when the document does not state it.");

const numberOrNull = z
  .number()
  .nullable()
  .describe("Plain number without thousands separators, or null when not disclosed.");

/**
 * One reporting person on a Schedule 13D/13G cover page.
 *
 * The power columns mirror the filing's own table. A filer may report sole
 * voting power but no dispositive power, so each column is independent.
 */
export const reportingPersonSchema = z.object({
  name: z.string().min(1).describe("Reporting person's name exactly as printed."),
  cik: z.string().nullable().describe("Reporting person CIK if printed, otherwise null."),
  citizenshipOrOrganization: z
    .string()
    .nullable()
    .describe("Citizenship or state of organization as printed, otherwise null."),
  soleVotingPower: numberOrNull,
  sharedVotingPower: numberOrNull,
  soleDispositivePower: numberOrNull,
  sharedDispositivePower: numberOrNull,
  aggregateAmountOwned: numberOrNull.describe("Aggregate shares beneficially owned."),
  percentOfClass: numberOrNull.describe("Percent of class as a number from 0 to 100."),
  typeOfReportingPerson: z
    .string()
    .nullable()
    .describe("Two-letter reporting-person type code (IA, HC, IN, CO, ...) if printed."),
});

/**
 * Facts from a Schedule 13D or 13G document.
 *
 * Used only when a filing is not machine-readable XML; the deterministic XML
 * path does not call a model.
 */
export const beneficialOwnershipExtractionSchema = z.object({
  issuerName: z.string().nullable(),
  issuerCik: z.string().nullable(),
  issuerCusip: z.string().nullable(),
  securitiesClass: z.string().nullable(),
  eventDate: isoDateOrNull.describe(
    "The date of the event that requires the statement (the cover-page date).",
  ),
  amendmentNumber: z
    .number()
    .int()
    .nullable()
    .describe("Amendment number if this is an amendment."),
  reportingPersons: z.array(reportingPersonSchema).min(1),
  purposeOfTransaction: z
    .string()
    .nullable()
    .describe("Item 4 purpose of the transaction, summarized in two sentences or fewer."),
  sourceOfFunds: z
    .string()
    .nullable()
    .describe("Item 3 source and amount of funds, if stated, otherwise null."),
  evidenceQuote: z
    .string()
    .nullable()
    .describe("A verbatim sentence from the document supporting the ownership figures."),
});

export type ReportingPersonExtraction = z.infer<typeof reportingPersonSchema>;
export type BeneficialOwnershipExtraction = z.infer<typeof beneficialOwnershipExtractionSchema>;

/**
 * Event classes the corporate-action extractor may assign.
 *
 * The list is deliberately closed: an unclassifiable filing is `other`, which
 * is more useful downstream than a free-text label invented per filing.
 */
export const CORPORATE_ACTION_EVENT_TYPES = [
  "acquisition",
  "divestiture",
  "merger",
  "tenderOffer",
  "securitiesOffering",
  "debtFinancing",
  "executiveChange",
  "materialAgreement",
  "bankruptcy",
  "default",
  "delisting",
  "restructuring",
  "shareholderMeeting",
  "earnings",
  "other",
] as const;

export const corporateActionEventTypeSchema = z.enum(CORPORATE_ACTION_EVENT_TYPES);

export const corporateActionPartySchema = z.object({
  name: z.string().min(1),
  role: z
    .string()
    .min(1)
    .describe("Role in the event, e.g. acquirer, target, issuer, lender, executive, auditor."),
});

export const corporateActionAmountSchema = z.object({
  label: z.string().min(1).describe("What the amount measures, e.g. 'aggregate offering price'."),
  value: z.number().describe("Plain number without separators or currency symbols."),
  currency: z.string().nullable().describe("ISO currency code when stated, otherwise null."),
  unit: z
    .string()
    .nullable()
    .describe("Unit or scale as stated, e.g. shares, warrants, USD, percent; otherwise null."),
});

/**
 * Facts and interpretation for one corporate-action filing.
 *
 * `financialImplications` is the only interpretive field. It must be grounded
 * in the document: dilution, leverage, change of control and similar effects
 * are described only where the filing supplies the facts that support them.
 */
export const corporateActionExtractionSchema = z.object({
  isCorporateAction: z
    .boolean()
    .describe("False when the document is routine and discloses no valuation-relevant event."),
  eventType: corporateActionEventTypeSchema,
  summary: z.string().min(1).describe("Two sentences or fewer describing what happened."),
  parties: z.array(corporateActionPartySchema),
  eventDate: isoDateOrNull.describe("Date the event occurred or is expected to occur."),
  amounts: z.array(corporateActionAmountSchema),
  financialImplications: z
    .string()
    .min(1)
    .describe(
      "Potential effect on valuation, ownership, or financial condition, grounded in the filing.",
    ),
  evidenceQuotes: z
    .array(z.string().min(1))
    .max(3)
    .describe("Up to three verbatim sentences from the document that support the extraction."),
  confidence: z.enum(["low", "medium", "high"]),
});

export type CorporateActionExtraction = z.infer<typeof corporateActionExtractionSchema>;
export type CorporateActionEventType = (typeof CORPORATE_ACTION_EVENT_TYPES)[number];
