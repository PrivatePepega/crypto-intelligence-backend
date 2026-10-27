import {
  parseOwnershipDocument,
  type OwnershipFilingMeta,
} from "../collectors/assets/stocks/secInsiderOwnership.js";
import {
  buildThirteenFPeriods,
  normalize13FValue,
  parse13FInformationTable,
  parseCusipMap,
  parseTsv,
  resolveCusip,
  toIsoDate,
  type ThirteenFFilingInput,
  type ThirteenFInfoEntry,
} from "../collectors/assets/stocks/sec13FHoldings.js";

let failures = 0;
const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const meta: OwnershipFilingMeta = {
  form: "4",
  accessionNumber: "0000320193-26-000001",
  filingDate: "2026-10-22",
  reportDate: "2026-10-20",
  documentUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/form4.xml",
  xmlUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/form4.xml",
};

const form4Xml = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <periodOfReport>2026-10-20</periodOfReport>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc.</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001780525</rptOwnerCik>
      <rptOwnerName>Newstead Jennifer</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>false</isDirector>
      <isOfficer>true</isOfficer>
      <isTenPercentOwner>false</isTenPercentOwner>
      <isOther>false</isOther>
      <officerTitle>SVP, GC and Government Affairs</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <aff10b5One>true</aff10b5One>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value><footnoteId id="F1"/></securityTitle>
      <transactionDate><value>2026-10-20</value></transactionDate>
      <transactionCoding>
        <transactionFormType>4</transactionFormType>
        <transactionCode>S</transactionCode>
        <equitySwapInvolved>false</equitySwapInvolved>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>2399</value></transactionShares>
        <transactionPricePerShare><value>339.62</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>34795</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes>
    <footnote id="F1">Made pursuant to a Rule 10b5-1 trading plan.</footnote>
  </footnotes>
</ownershipDocument>`;

{
  const filing = parseOwnershipDocument(form4Xml, meta);
  const tx = filing.transactions[0];

  pass("Form 4 issuer is parsed", filing.issuer.tradingSymbol === "AAPL");
  pass("Form 4 owner is parsed", filing.reportingOwner?.name === "Newstead Jennifer");
  pass(
    "Form 4 officer title is parsed",
    filing.reportingOwner?.relationship.officerTitle?.includes("SVP") === true,
  );
  pass("Form 4 code S maps to sale", tx?.transactionType === "sale");
  pass("Form 4 disposition category", tx?.transactionCategory === "disposition");
  pass("Form 4 open-market sale", tx?.isOpenMarket === true);
  pass("Form 4 direct ownership", tx?.directOrIndirectOwnership === "D");
  pass("Form 4 shares are numeric", tx?.shares === 2399);
  pass("Form 4 price is numeric", tx?.pricePerShare === 339.62);
  pass("Form 4 value is rounded to cents", tx?.transactionValue === 814748.38);
  pass("Form 4 resulting holdings", tx?.sharesOwnedFollowingTransaction === 34795);
  pass("Form 4 footnotes are resolved", tx?.footnotes[0]?.includes("10b5-1") === true);
}

const form3Xml = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>3</documentType>
  <periodOfReport>2026-03-01</periodOfReport>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc.</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001780525</rptOwnerCik>
      <rptOwnerName>Newstead Jennifer</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <isOther>0</isOther>
      <officerTitle>SVP, GC and Secretary</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeHolding>
      <securityTitle><value>Common Stock</value></securityTitle>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>1200</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>I</value></directOrIndirectOwnership>
        <natureOfOwnership><value>By trust</value></natureOfOwnership>
      </ownershipNature>
    </nonDerivativeHolding>
  </nonDerivativeTable>
  <derivativeTable>
    <derivativeHolding>
      <securityTitle><value>Restricted Stock Unit</value></securityTitle>
      <conversionOrExercisePrice><footnoteId id="F2"/></conversionOrExercisePrice>
      <underlyingSecurity>
        <underlyingSecurityTitle><value>Common Stock</value></underlyingSecurityTitle>
        <underlyingSecurityShares><value>301040</value></underlyingSecurityShares>
      </underlyingSecurity>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </derivativeHolding>
  </derivativeTable>
  <footnotes>
    <footnote id="F2">Each RSU represents one share of common stock.</footnote>
  </footnotes>
</ownershipDocument>`;

{
  const filing = parseOwnershipDocument(form3Xml, { ...meta, form: "3", accessionNumber: "A-3" });
  const holding = filing.transactions[0];
  const derivative = filing.transactions[1];

  pass(
    "Form 3 non-derivative holding shares are captured",
    holding?.shares === 1200 && holding?.isHolding === true,
  );
  pass("Form 3 holding is indirect", holding?.directOrIndirectOwnership === "I");
  pass("Form 3 nature of ownership is captured", holding?.natureOfOwnership === "By trust");
  pass(
    "Form 3 derivative underlying shares are captured",
    derivative?.underlyingSecurityShares === 301040,
  );
  pass(
    "Form 3 derivative conversion price is null when footnoted",
    derivative?.conversionOrExercisePrice === null,
  );
}

const infoTableXml = `<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>1000</value>
    <shrsOrPrnAmt><sshPrnamt>10</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
    <votingAuthority><Sole>10</Sole><Shared>0</Shared><None>0</None></votingAuthority>
  </infoTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>2000</value>
    <shrsOrPrnAmt><sshPrnamt>20</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
    <votingAuthority><Sole>20</Sole><Shared>0</Shared><None>0</None></votingAuthority>
  </infoTable>
  <infoTable>
    <nameOfIssuer>MICROSOFT CORP</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>594918104</cusip>
    <value>500</value>
    <shrsOrPrnAmt><sshPrnamt>5</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
    <votingAuthority><Sole>5</Sole><Shared>0</Shared><None>0</None></votingAuthority>
  </infoTable>
</informationTable>`;

const makeFiling = (
  overrides: Partial<ThirteenFFilingInput> & { entries: ThirteenFInfoEntry[] },
): ThirteenFFilingInput => ({
  form: "13F-HR",
  accessionNumber: "A1",
  filingDate: "2026-08-14",
  reportDate: "2026-06-30",
  isAmendment: false,
  amendmentType: null,
  coverPage: null,
  primaryDocumentUrl: null,
  informationTableUrl: null,
  ...overrides,
});

{
  const entries = parse13FInformationTable(infoTableXml);
  pass("13F table parses all rows", entries.length === 3);
  pass("13F table parses shares", entries[0]?.shares === 10);
  pass("13F table parses voting authority", entries[0]?.votingAuthority.sole === 10);

  const periods = buildThirteenFPeriods([makeFiling({ entries })], {
    "037833100": { assetId: "AAPL", ticker: "AAPL", name: "Apple Inc." },
  });
  const period = periods[0];
  const apple = period?.holdings.find((holding) => holding.cusip === "037833100");

  pass("13F periods group by report date", periods.length === 1);
  pass("13F duplicate CUSIP rows aggregate", apple?.shares === 30 && apple?.valueUsd === 3000);
  pass(
    "13F asset resolution uses explicit CUSIP map",
    apple?.assetId === "AAPL" && apple?.assetResolution === "mapped",
  );
  pass("13F implied price is derivable", apple?.impliedPricePerShare === 100);
  pass("13F period totals include both securities", period?.totals.positions === 2);
}

{
  const base = parse13FInformationTable(infoTableXml);
  const newHolding: ThirteenFInfoEntry = {
    sourceRowId: "row-2",
    nameOfIssuer: "ALPHABET INC",
    titleOfClass: "CL A",
    cusip: "02079K305",
    figi: null,
    valueAsReported: 700,
    shares: 7,
    shareType: "SH",
    putCall: null,
    investmentDiscretion: "SOLE",
    otherManager: null,
    votingAuthority: { sole: 7, shared: null, none: null },
  };

  const withNewHoldings = buildThirteenFPeriods([
    makeFiling({ entries: base }),
    makeFiling({
      accessionNumber: "A2",
      filingDate: "2026-08-20",
      isAmendment: true,
      amendmentType: "NEW HOLDINGS",
      entries: [newHolding],
    }),
  ]);
  pass(
    "NEW HOLDINGS amendment appends positions",
    withNewHoldings[0]?.holdings.length === 3,
    `positions=${withNewHoldings[0]?.holdings.length}`,
  );

  const withRestatement = buildThirteenFPeriods([
    makeFiling({ entries: base }),
    makeFiling({
      accessionNumber: "A3",
      filingDate: "2026-08-21",
      isAmendment: true,
      amendmentType: "RESTATEMENT",
      entries: [newHolding],
    }),
  ]);
  pass(
    "RESTATEMENT amendment replaces positions",
    withRestatement[0]?.holdings.length === 1 &&
      withRestatement[0]?.holdings[0]?.cusip === "02079K305",
  );
}

{
  const preRule = normalize13FValue(123, "2013-05-22");
  const postRule = normalize13FValue(123, "2026-08-14");
  pass(
    "pre-2023 13F values are normalized from thousands",
    preRule.valueUnit === "USD_THOUSANDS" && preRule.valueUsd === 123000,
  );
  pass(
    "2023+ 13F values are already dollars",
    postRule.valueUnit === "USD" && postRule.valueUsd === 123,
  );
  pass("missing 13F value stays unknown", normalize13FValue(null, "2026-08-14").valueUsd === null);
}

{
  pass("bulk date DD-MON-YYYY parses", toIsoDate("31-MAY-2013") === "2013-05-31");
  pass("cover-page date MM-DD-YYYY parses", toIsoDate("06-30-2026") === "2026-06-30");
  pass("unknown date format stays null", toIsoDate("not-a-date") === null);

  const rows = parseTsv("ACCESSION_NUMBER\tVALUE\nA1\t123\n");
  pass("TSV headers and rows parse", rows.length === 1 && rows[0]?.["VALUE"] === "123");

  const objectMap = parseCusipMap({
    "037833100": { assetId: "AAPL", ticker: "AAPL", name: "Apple Inc." },
  });
  const arrayMap = parseCusipMap([{ cusip: "594918104", assetId: "MSFT" }]);
  pass("CUSIP object maps parse", objectMap["037833100"]?.assetId === "AAPL");
  pass("CUSIP array maps parse", arrayMap["594918104"]?.assetId === "MSFT");
  pass("unmapped CUSIP is explicit", resolveCusip("000000000", objectMap).status === "unmapped");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll ownership parsing tests passed.");
}
