import {
  getFilingIndexUrl,
  getRawFilingDocumentUrl,
  toIsoDate,
} from "../collectors/assets/secEdgarFetch.js";
import {
  isAmendmentForm,
  parseScheduleXml,
  scheduleFromForm,
  type ScheduleFilingContext,
} from "../collectors/assets/secBeneficialOwnership.js";
import {
  CORPORATE_ACTION_FORMS,
  baseForm,
  corporateActionTier,
} from "../collectors/assets/secCorporateActions.js";
import {
  containsQuote,
  extractDocumentText,
  htmlToText,
  normalizeForMatch,
} from "../collectors/assets/secDocumentText.js";
import { buildFilingEvidence, trimExcerpt } from "../collectors/assets/secEvidence.js";
import {
  beneficialOwnershipExtractionSchema,
  corporateActionExtractionSchema,
} from "../AI/assets/schemas.js";

/**
 * Focused tests for SEC filing intelligence parsing.
 *
 * These cover the deterministic parts of the 13D/13G and corporate-action
 * collectors: XML normalization, HTML/SGML to text, excerpt verification,
 * form tiering, date parsing and schema validation. The AI calls themselves
 * are not exercised here; they require provider credentials and are validated
 * against live filings instead.
 *
 * Run with: npx tsx tests/secFilingIntelligence.test.ts
 */

let failures = 0;
const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// --------------------------------------------------
// Form discovery
// --------------------------------------------------

{
  pass("SC 13D maps to schedule 13D", scheduleFromForm("SC 13D") === "13D");
  pass("SCHEDULE 13G/A maps to schedule 13G", scheduleFromForm("SCHEDULE 13G/A") === "13G");
  pass("bare 13D/A maps to schedule 13D", scheduleFromForm("13D/A") === "13D");
  pass("unrelated form is not a schedule", scheduleFromForm("8-K") === null);
  pass("13G amendment is detected", isAmendmentForm("SCHEDULE 13G/A"));
  pass("13D original is not an amendment", !isAmendmentForm("SC 13D"));

  pass("8-K is priority tier 1", corporateActionTier("8-K") === 1);
  pass("8-K/A keeps tier 1", corporateActionTier("8-K/A") === 1);
  pass("424B5 is priority tier 2", corporateActionTier("424B5") === 2);
  pass("tender offer is tier 3", corporateActionTier("SC TO-T") === 3);
  pass("DEF 14A is tier 4", corporateActionTier("DEF 14A") === 4);
  pass("untracked form has no tier", corporateActionTier("SC 13D") === null);
  pass("amendment suffix is stripped", baseForm("424B5/A") === "424B5");
  pass(
    "form list includes amendments",
    CORPORATE_ACTION_FORMS.includes("S-1/A") && CORPORATE_ACTION_FORMS.includes("DEF 14A"),
  );
}

// --------------------------------------------------
// URL construction
// --------------------------------------------------

{
  pass(
    "filing index URL points at the accession directory",
    getFilingIndexUrl("320193", "0000320193-26-000018") ===
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000018/",
  );
  pass(
    "XSL viewer prefix is stripped from the raw document",
    getRawFilingDocumentUrl(
      "320193",
      "0002100119-26-000139",
      "xslSCHEDULE_13G_X02/primary_doc.xml",
    ) === "https://www.sec.gov/Archives/edgar/data/320193/000210011926000139/primary_doc.xml",
  );
}

// --------------------------------------------------
// Dates
// --------------------------------------------------

{
  pass("13D date MM/DD/YYYY parses", toIsoDate("03/31/2026") === "2026-03-31");
  pass("13F date MM-DD-YYYY parses", toIsoDate("06-30-2026") === "2026-06-30");
  pass("bulk date DD-MON-YYYY parses", toIsoDate("31-MAY-2013") === "2013-05-31");
  pass("ISO date passes through", toIsoDate("2026-08-14") === "2026-08-14");
  pass("unknown date format stays null", toIsoDate("not-a-date") === null);
}

// --------------------------------------------------
// HTML / SGML to text
// --------------------------------------------------

{
  const html = `
    <html><head><style>.x{color:red}</style><script>alert("no")</script></head>
    <body>
      <ix:header><ix:nonNumeric name="dei:DocumentType">8-K</ix:nonNumeric></ix:header>
      <p>Apple Inc.&nbsp;filed this   report &amp; related notes.</p>
      <p>Price &lt; $10&mdash;unchanged.</p>
      <!-- hidden comment -->
    </body></html>`;

  const text = htmlToText(html);
  pass("script and style content is removed", !/alert|color:red/.test(text));
  pass("inline XBRL header content is removed", !text.includes("dei:DocumentType"));
  pass("HTML comments are removed", !text.includes("hidden comment"));
  pass(
    "entities decode and whitespace collapses",
    text.includes("Apple Inc. filed this report & related notes."),
  );
  pass("escaped markup stays text", text.includes("Price < $10-unchanged."));

  const sgml = `<SEC-DOCUMENT>\n<DOCUMENT>\n<TYPE>SC 13G\n<TEXT>\n<p>Schedule 13G body</p>\n</TEXT>\n</DOCUMENT>\n</SEC-DOCUMENT>`;
  pass("SGML envelope keeps only the text payload", htmlToText(sgml) === "Schedule 13G body");

  const truncated = extractDocumentText("one two three four five six seven eight", 20);
  pass(
    "truncation is reported",
    truncated.truncated && truncated.text.length <= 20,
    truncated.text,
  );
  pass(
    "truncation keeps whole words",
    !truncated.text.endsWith(" ") && truncated.text.startsWith("one two"),
  );
  pass("untruncated document is marked complete", !extractDocumentText("short", 100).truncated);
}

// --------------------------------------------------
// Excerpt verification
// --------------------------------------------------

{
  const source =
    "The Reporting Persons beneficially own 3,479,963 Shares, representing approximately 6.1% of the class.";
  pass(
    "quote matching ignores spacing and curly quotes",
    containsQuote(source, "beneficially own 3,479,963 Shares,  representing approximately 6.1%"),
  );
  pass(
    "invented quote is rejected",
    !containsQuote(source, "The Reporting Persons intend to sell the issuer."),
  );
  pass("very short quote is rejected", !containsQuote(source, "the"));

  const verified = buildFilingEvidence({
    cik: "320193",
    form: "SC 13D",
    accessionNumber: "0000320193-26-000018",
    filingDate: "2026-07-30",
    reportDate: "2026-07-30",
    documentUrl: "https://www.sec.gov/example.htm",
    excerpts: [source, "This sentence is not in the filing at all."],
    sourceText: source,
  });
  pass(
    "unverified excerpts are dropped and flagged",
    verified.excerpts.length === 1 &&
      verified.excerptsVerified === false &&
      verified.excerptsRejected === 1,
  );
  pass(
    "evidence keeps the filing index URL",
    verified.filingIndexUrl.endsWith("/000032019326000018/"),
  );

  const trusted = buildFilingEvidence({
    cik: "320193",
    form: "SC 13G",
    accessionNumber: "0002100119-26-000139",
    filingDate: "2026-04-29",
    reportDate: "2026-03-31",
    documentUrl: "https://www.sec.gov/example.xml",
    excerpts: ["Vanguard Capital Management reports 1,099,168,953 shares."],
  });
  pass(
    "XML-derived excerpts are kept as verified",
    trusted.excerptsVerified && trusted.excerpts.length === 1,
  );

  const trimmed = trimExcerpt(`${"word ".repeat(200)}. tail`, 60);
  pass(
    "excerpt trimming ends at a whole word",
    trimmed.length <= 60 &&
      !trimmed.endsWith(" ") &&
      trimmed.split(" ").every((word) => word === "word"),
  );
  pass("normalizeForMatch lowercases", normalizeForMatch("Apple  INC.") === "apple inc.");
}

// --------------------------------------------------
// 13D/13G XML parsing
// --------------------------------------------------

const context = (form: string): ScheduleFilingContext => ({
  cik: "320193",
  form,
  accessionNumber: "0000320193-26-000001",
  filingDate: "2026-08-01",
  reportDate: "",
  documentUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/primary_doc.xml",
});

{
  const xml = `<?xml version="1.0"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/schedule13D">
  <headerData>
    <submissionType>SCHEDULE 13D</submissionType>
    <filerInfo><filer><filerCredentials><cik>0002089521</cik></filerCredentials></filer></filerInfo>
  </headerData>
  <formData>
    <coverPageHeader>
      <securitiesClassTitle>Common Stock, $0.01 par value</securitiesClassTitle>
      <dateOfEvent>10/15/2026</dateOfEvent>
      <issuerInfo>
        <issuerCIK>0000318306</issuerCIK>
        <issuerCusips><issuerCusipNumber>00289Y206</issuerCusipNumber></issuerCusips>
        <issuerName>ABEONA THERAPEUTICS INC.</issuerName>
      </issuerInfo>
    </coverPageHeader>
    <reportingPersons>
      <reportingPersonInfo>
        <reportingPersonCIK>0002089521</reportingPersonCIK>
        <reportingPersonName>James Russell Revocable Trust</reportingPersonName>
        <memberOfGroup>b</memberOfGroup>
        <fundType>PF</fundType>
        <citizenshipOrOrganization>NV</citizenshipOrOrganization>
        <soleVotingPower>0</soleVotingPower>
        <sharedVotingPower>3479963</sharedVotingPower>
        <soleDispositivePower>0</soleDispositivePower>
        <sharedDispositivePower>3479963</sharedDispositivePower>
        <aggregateAmountOwned>3479963</aggregateAmountOwned>
        <percentOfClass>6.1</percentOfClass>
        <typeOfReportingPerson>OO</typeOfReportingPerson>
      </reportingPersonInfo>
      <reportingPersonInfo>
        <reportingPersonNoCIK>Y</reportingPersonNoCIK>
        <reportingPersonName>James Russell</reportingPersonName>
        <citizenshipOrOrganization>X1</citizenshipOrOrganization>
        <soleVotingPower>0</soleVotingPower>
        <sharedVotingPower>3479963</sharedVotingPower>
        <soleDispositivePower>0</soleDispositivePower>
        <sharedDispositivePower>3479963</sharedDispositivePower>
        <aggregateAmountOwned>3479963</aggregateAmountOwned>
        <percentOfClass>6.1</percentOfClass>
        <typeOfReportingPerson>IN</typeOfReportingPerson>
      </reportingPersonInfo>
    </reportingPersons>
    <items1To7>
      <item3><fundsSource>Acquired with personal funds of approximately $17,776,513.</fundsSource></item3>
      <item4>
        <transactionPurpose>The Reporting Persons became concerned regarding the Issuer's operational execution.</transactionPurpose>
      </item4>
      <item5>
        <percentageOfClassSecurities>Each Reporting Person may be deemed to beneficially own 3,479,963 Shares, representing approximately 6.1% of the outstanding Shares.</percentageOfClassSecurities>
      </item5>
    </items1To7>
  </formData>
</edgarSubmission>`;

  const filing = parseScheduleXml(xml, context("SCHEDULE 13D"));
  pass("13D schedule type is recognized", filing.scheduleType === "13D");
  pass(
    "13D issuer and CUSIP parse",
    filing.issuerName === "ABEONA THERAPEUTICS INC." && filing.issuerCusip === "00289Y206",
  );
  pass("13D issuer CIK parses", filing.issuerCik === "0000318306");
  pass("13D event date becomes ISO", filing.eventDate === "2026-10-15");
  pass("13D report date falls back to the event date", filing.reportDate === "2026-10-15");
  pass("13D parses every reporting person", filing.reportingPersons.length === 2);
  pass(
    "13D person CIK and powers parse",
    filing.reportingPersons[0]?.cik === "0002089521" &&
      filing.reportingPersons[0]?.sharedVotingPower === 3479963,
  );
  pass("13D percentage parses", filing.reportingPersons[0]?.percentOfClass === 6.1);
  pass(
    "13D purpose is kept",
    filing.purposeOfTransaction?.startsWith("The Reporting Persons became concerned") === true,
  );
  pass("13D source of funds is kept", filing.sourceOfFunds?.includes("$17,776,513") === true);
  pass(
    "13D evidence quotes the ownership sentence",
    filing.evidence.excerpts[0]?.includes("3,479,963 Shares") === true,
  );
  pass("13D extraction path is deterministic XML", filing.extractionStatus === "xml");
}

{
  const xml = `<?xml version="1.0"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/schedule13g">
  <headerData>
    <submissionType>SCHEDULE 13G/A</submissionType>
    <filerInfo><filer><filerCredentials><cik>0000102909</cik></filerCredentials></filer></filerInfo>
  </headerData>
  <formData>
    <coverPageHeader>
      <amendmentNo>11</amendmentNo>
      <securitiesClassTitle>Common Stock</securitiesClassTitle>
      <eventDateRequiresFilingThisStatement>03/13/2026</eventDateRequiresFilingThisStatement>
      <issuerInfo>
        <issuerCik>0000320193</issuerCik>
        <issuerName>Apple Inc</issuerName>
        <issuerCusips><issuerCusipNumber>037833100</issuerCusipNumber></issuerCusips>
      </issuerInfo>
    </coverPageHeader>
    <coverPageHeaderReportingPersonDetails>
      <reportingPersonName>Vanguard Capital Management</reportingPersonName>
      <citizenshipOrOrganization>PA</citizenshipOrOrganization>
      <reportingPersonBeneficiallyOwnedNumberOfShares>
        <soleVotingPower>145321305</soleVotingPower>
        <sharedVotingPower>0</sharedVotingPower>
        <soleDispositivePower>1099168953</soleDispositivePower>
        <sharedDispositivePower>0</sharedDispositivePower>
      </reportingPersonBeneficiallyOwnedNumberOfShares>
      <reportingPersonBeneficiallyOwnedAggregateNumberOfShares>1099168953</reportingPersonBeneficiallyOwnedAggregateNumberOfShares>
      <classPercent>7.48</classPercent>
      <typeOfReportingPerson>IA</typeOfReportingPerson>
      <comments>This Schedule 13G reflects securities beneficially owned by Vanguard Capital Management.</comments>
    </coverPageHeaderReportingPersonDetails>
    <items><item4><amountBeneficiallyOwned>1099168953</amountBeneficiallyOwned></item4></items>
  </formData>
</edgarSubmission>`;

  const filing = parseScheduleXml(xml, context("SCHEDULE 13G/A"));
  pass("13G amendment number parses", filing.amendmentNumber === 11 && filing.isAmendment);
  pass("13G event date parses from slashes", filing.eventDate === "2026-03-13");
  pass(
    "13G person is read from the cover page",
    filing.reportingPersons[0]?.name === "Vanguard Capital Management",
  );
  pass(
    "13G aggregate shares parse",
    filing.reportingPersons[0]?.aggregateAmountOwned === 1099168953,
  );
  pass("13G percentage parses", filing.reportingPersons[0]?.percentOfClass === 7.48);
  pass("13G power columns parse", filing.reportingPersons[0]?.soleDispositivePower === 1099168953);
  pass(
    "13G reporting-person CIK falls back to the filer CIK",
    filing.reportingPersons[0]?.cik === "0000102909",
  );
  pass("13G has no disclosed purpose", filing.purposeOfTransaction === null);
  pass(
    "13G evidence quotes the cover-page comment",
    filing.evidence.excerpts[0]?.includes("Vanguard Capital Management") === true,
  );
}

{
  // A 13G without the cover-page detail block still exposes item 4 figures.
  const xml = `<?xml version="1.0"?>
<edgarSubmission>
  <headerData><submissionType>SCHEDULE 13G</submissionType></headerData>
  <formData>
    <coverPageHeader>
      <eventDateRequiresFilingThisStatement>12/31/2025</eventDateRequiresFilingThisStatement>
      <issuerInfo><issuerCik>0000320193</issuerCik><issuerName>Apple Inc</issuerName></issuerInfo>
    </coverPageHeader>
    <items>
      <item2><filingPersonName>Example Adviser LLC</filingPersonName><citizenship>DE</citizenship></item2>
      <item3><typeOfPersonFiling>IA</typeOfPersonFiling></item3>
      <item4>
        <amountBeneficiallyOwned>1,234,567</amountBeneficiallyOwned>
        <classPercent>5.2%</classPercent>
        <numberOfSharesPersonHas>
          <solePowerOrDirectToVote>1234567</solePowerOrDirectToVote>
          <sharedPowerOrDirectToVote>0</sharedPowerOrDirectToVote>
          <solePowerOrDirectToDispose>1234567</solePowerOrDirectToDispose>
          <sharedPowerOrDirectToDispose>0</sharedPowerOrDirectToDispose>
        </numberOfSharesPersonHas>
      </item4>
    </items>
  </formData>
</edgarSubmission>`;

  const filing = parseScheduleXml(xml, context("SC 13G"));
  pass(
    "13G item 4 fallback finds the filer",
    filing.reportingPersons[0]?.name === "Example Adviser LLC",
  );
  pass(
    "13G fallback aggregate handles commas",
    filing.reportingPersons[0]?.aggregateAmountOwned === 1234567,
  );
  pass(
    "13G fallback percentage handles a percent sign",
    filing.reportingPersons[0]?.percentOfClass === 5.2,
  );
  pass("13G fallback voting power parses", filing.reportingPersons[0]?.soleVotingPower === 1234567);
  pass("13G fallback type code parses", filing.reportingPersons[0]?.typeOfReportingPerson === "IA");
}

// --------------------------------------------------
// Extraction schema validation
// --------------------------------------------------

{
  const ownership = beneficialOwnershipExtractionSchema.safeParse({
    issuerName: "Apple Inc",
    issuerCik: "0000320193",
    issuerCusip: "037833100",
    securitiesClass: "Common Stock",
    eventDate: "2026-03-31",
    amendmentNumber: 11,
    reportingPersons: [
      {
        name: "Vanguard Capital Management",
        cik: null,
        citizenshipOrOrganization: "PA",
        soleVotingPower: 145321305,
        sharedVotingPower: 0,
        soleDispositivePower: 1099168953,
        sharedDispositivePower: 0,
        aggregateAmountOwned: 1099168953,
        percentOfClass: 7.48,
        typeOfReportingPerson: "IA",
      },
    ],
    purposeOfTransaction: null,
    sourceOfFunds: null,
    evidenceQuote: "Vanguard Capital Management reports 1,099,168,953 shares.",
  });
  pass("ownership schema accepts a complete record", ownership.success);

  const noPersons = beneficialOwnershipExtractionSchema.safeParse({
    issuerName: "Apple Inc",
    issuerCik: null,
    issuerCusip: null,
    securitiesClass: null,
    eventDate: null,
    amendmentNumber: null,
    reportingPersons: [],
    purposeOfTransaction: null,
    sourceOfFunds: null,
    evidenceQuote: null,
  });
  pass("ownership schema rejects an empty reporting-person list", !noPersons.success);

  const action = corporateActionExtractionSchema.safeParse({
    isCorporateAction: true,
    eventType: "securitiesOffering",
    summary: "The company priced a public offering of common stock.",
    parties: [{ name: "Apple Inc.", role: "issuer" }],
    eventDate: "2026-07-30",
    amounts: [
      { label: "aggregate offering price", value: 5000000000, currency: "USD", unit: "USD" },
    ],
    financialImplications:
      "The offering increases shares outstanding and dilutes existing holders.",
    evidenceQuotes: ["The company priced a public offering of common stock."],
    confidence: "high",
  });
  pass("corporate-action schema accepts a complete record", action.success);

  const badType = corporateActionExtractionSchema.safeParse({
    ...(action.success ? action.data : {}),
    eventType: "shareBuyback",
  });
  pass("corporate-action schema rejects an unknown event type", !badType.success);

  const tooManyQuotes = corporateActionExtractionSchema.safeParse({
    ...(action.success ? action.data : {}),
    evidenceQuotes: ["a", "b", "c", "d"],
  });
  pass("corporate-action schema caps evidence quotes", !tooManyQuotes.success);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll SEC filing intelligence tests passed.");
}
