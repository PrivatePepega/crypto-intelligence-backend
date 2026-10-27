# Ownership Intelligence

Collectors for SEC insider ownership (Forms 3, 4, 5), beneficial ownership
(Schedules 13D and 13G) and institutional holdings (Forms 13F-HR and
13F-HR/A).

Both collectors reuse the shared SEC client in
`collectors/assets/stocks/secEdgarFetch.ts`:

- `User-Agent: CryptoIntelligencePlatform fernandojcastellanos@gmail.com`
- at most one request per second
- exponential backoff on HTTP 429
- raw JSON is saved under `collectors/assets/stocks/data/` with the `Edgar ` prefix

No database writes are performed. The output files are deterministic JSON
snapshots that can be loaded into the database by a later ingestion step.

## Insider ownership — Forms 3, 4 and 5

Script: `collectors/assets/stocks/secInsiderOwnership.ts`

```powershell
npx.cmd tsx collectors/assets/stocks/secInsiderOwnership.ts --cik=320193 --max=12
```

Options:

| Option              | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| `--cik=320193`      | Issuer CIK (default Apple)                                    |
| `--max=12`          | Number of most recent matching filings to fetch               |
| `--forms=3,4,5`     | Forms to include                                              |
| `--amendments=true` | Also include `3/A`, `4/A`, `5/A`                              |
| `--refresh=true`    | Re-fetch the submissions JSON instead of using the saved copy |
| `--output=...`      | Output filename (default `Edgar insider_CIK{cik}.json`)       |

### Flow

1. Load `https://data.sec.gov/submissions/CIK{cik}.json` (saved copy first).
2. Filter `filings.recent.form` for the requested forms.
3. Build the raw XML URL from the accession number and primary document.
   Submissions often point at an XSL-rendered path such as
   `xslF345X06/form4.xml`; the collector strips the XSL directory and fetches
   `form4.xml`.
4. If the raw URL is missing, fall back to the filing `index.json` and try the
   XML documents in that directory.
5. Parse the ownership document into normalized transaction rows.

### Output

`Edgar insider_CIK{cik}.json` contains:

- `filings[]` — one record per filing with issuer, reporting owner(s),
  relationship flags, 10b5-1 flag, footnotes and filing URLs.
- `transactions[]` — a flat, sorted list of every table row. Each row keeps:
  - `transactionCode` (SEC code) and `transactionType`
    (`purchase`, `sale`, `award`, `optionExercise`, `conversion`,
    `taxWithholding`, `dispositionToIssuer`, `gift`, `holding`, `other`)
  - `transactionCategory` (`acquisition`, `disposition`, or `null`)
  - `shares`, `pricePerShare`, `transactionValue`
  - `sharesOwnedFollowingTransaction`
  - `directOrIndirectOwnership` (`D` / `I`) and `natureOfOwnership`
  - derivative fields (`underlyingSecurityTitle`, `underlyingSecurityShares`,
    `conversionOrExercisePrice`, `exerciseDate`, `expirationDate`)
  - `filingDate`, `reportDate`, `accessionNumber`, `documentUrl`, `xmlUrl`
  - referenced footnote text
- `summary` — filing/transaction counts and purchase/sale/award totals.
- `errors[]` — filings that could not be fetched or parsed.

A holding row (`nonDerivativeHolding` / `derivativeHolding`) is marked with
`isHolding: true`, `transactionType: "holding"` and no transaction code. This
is how Form 3 initial positions and Form 5 holdings are represented.

The reporting owner is the first `reportingOwner` when a filing has joint
filers; all owners remain available under `filings[].reportingOwners`.

Only `filings.recent` is used. Older submission archives listed in
`filings.files` are not fetched by this collector.

## Beneficial ownership — Schedules 13D and 13G

Script: `collectors/assets/stocks/secBeneficialOwnership.ts`

```powershell
npx.cmd tsx collectors/assets/stocks/secBeneficialOwnership.ts --cik=320193 --max=20
```

| Option               | Meaning                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `--cik=320193`       | Issuer CIK (default Apple)                                               |
| `--max=20`           | Number of most recent matching filings to fetch                          |
| `--forms=13D,13G`    | Schedule families to include                                             |
| `--amendments=false` | Exclude `/A` filings                                                     |
| `--extract=false`    | Skip AI extraction of legacy HTML filings                                |
| `--model=google`     | Extraction model: `google`, `groq`, `openai`, `openrouter`, `cloudflare` |
| `--max-chars=60000`  | Document text budget passed to the extractor                             |
| `--refresh=true`     | Re-fetch the submissions JSON                                            |
| `--output=...`       | Default `Edgar 13dg_CIK{cik}.json`                                       |

### Flow

1. Load the submissions JSON (saved copy first).
2. Keep `SC 13D`, `SCHEDULE 13D`, `SC 13G`, `SCHEDULE 13G` and their `/A`
   amendments. Discovery matches the schedule family rather than a fixed form
   string, because submissions use both the legacy and current labels.
3. Fetch the raw document URL. The XSL viewer prefix
   (`xslSCHEDULE_13G_X02/primary_doc.xml`) is stripped so the underlying
   document is read.
4. If the document is machine-readable XML (`<edgarSubmission>`), parse it
   deterministically.
5. If it is a legacy HTML/SGML filing, normalize it to text and — unless
   `--extract=false` — read it with the AI extractor. The AI module is imported
   lazily, so discovery and the XML path work without provider credentials.
6. Keep the document URL, filing index URL, filing metadata, extracted facts
   and verified excerpts. **The document itself is not saved.**

### Output

`Edgar 13dg_CIK{cik}.json` contains `filings[]`, each with:

- `form`, `scheduleType` (`13D` / `13G`), `isAmendment`, `amendmentNumber`
- `filingDate`, `reportDate`, `eventDate`
- `issuerName`, `issuerCik`, `issuerCusip`, `securitiesClass`
- `documentUrl`, `filingIndexUrl`
- `extractionStatus` — `xml`, `ai` or `skipped`
- `reportingPersons[]` — name, CIK, citizenship/organization, sole and shared
  voting power, sole and shared dispositive power, `aggregateAmountOwned`,
  `percentOfClass`, `typeOfReportingPerson`, `memberOfGroup`, `fundType`
- `purposeOfTransaction` — Item 4 for 13D
- `sourceOfFunds` — Item 3 for 13D
- `evidence` — form, accession, dates, URLs, verbatim `excerpts`, and
  `excerptsVerified` / `excerptsRejected`
- `extractionUsage` — model and token counts when the AI path ran

`summary` counts filings by schedule and amendment, reporting persons, XML/AI
paths, and the highest reported percentage.

### What the two schedules mean

- **13D** is filed when a person or group acquires more than 5% with an active
  intent (control, board change, strategic influence). Item 4 states that
  purpose, and it is the part that matters most for interpreting the position.
- **13G** is the passive-investor schedule (institutional managers, index
  funds, certain exempt investors). It carries no purpose statement; the
  collector leaves `purposeOfTransaction` null rather than inferring intent.

A 13G filing can report a group aggregate (for example, a parent and its
subsidiaries), so the same share count may appear for several reporting
persons. Read `reportingPersons[]` as separate filers, not as additive
positions.

### Evidence handling

For XML filings the excerpt is taken from a prose field in the document (the
13D ownership sentence, or the 13G cover-page comment). For AI-read legacy
filings, every quote the model returns is checked against the normalized
document text; a quote that is not found is dropped and counted in
`excerptsRejected`. An invented quote is therefore never stored as evidence.

The extractor defaults to the Google Gemini model configured in
`AI/providers/model.ts`. Provider availability varies; `--model` selects
another configured provider when the default is unavailable.

## Institutional holdings — Form 13F

Script: `collectors/assets/stocks/sec13FHoldings.ts`

### Manager path

```powershell
npx.cmd tsx collectors/assets/stocks/sec13FHoldings.ts --cik=1067983 --max-periods=4
```

Options:

| Option            | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `--cik=1067983`   | Manager CIK (default Berkshire Hathaway)            |
| `--max-periods=4` | Number of most recent report periods to fetch       |
| `--map=path`      | Optional CUSIP-to-asset JSON map                    |
| `--refresh=true`  | Re-fetch the submissions JSON                       |
| `--output=...`    | Output filename (default `Edgar 13f_CIK{cik}.json`) |

For each selected filing the collector:

1. Reads the filing `index.json`.
2. Fetches the cover page (`primary_doc.xml`).
3. Finds and fetches the information table (the non-`primary_doc` XML whose
   root is `informationTable`).
4. Parses positions, voting authority and the cover-page amendment metadata.

`--max-periods` counts distinct report periods, so an original and its
amendment are always selected together.

Output: `Edgar 13f_CIK{cik}.json`

- `periods[]` — newest first. Each period contains aggregated `holdings[]`,
  the `filings[]` that contributed to it, and totals.
- Each holding keeps `cusip`, issuer/class, `putCall`, `shares`,
  `shareType`, `valueAsReported`, `valueUnit`, `valueUsd`,
  `impliedPricePerShare`, voting authority, investment discretion and every
  contributing `filingRefs` record.
- `managerName`, `generatedAt`, `errors[]`.

### Bulk data set path

```powershell
npx.cmd tsx collectors/assets/stocks/sec13FHoldings.ts --year=2026 --quarter=2 `
  --cusip=037833100 --asset=AAPL

# or process an already-downloaded ZIP
npx.cmd tsx collectors/assets/stocks/sec13FHoldings.ts "--zip=C:\path\2026q2_form13f.zip" `
  --year=2026 --quarter=2 --cusip=037833100 --asset=AAPL
```

Options:

| Option                 | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `--year` / `--quarter` | Quarterly data set to download                      |
| `--zip`                | Process a local data set ZIP instead of downloading |
| `--cusip` / `--cusips` | One or more target CUSIPs (required)                |
| `--asset`              | Asset id applied to every target CUSIP              |
| `--map`                | Optional CUSIP-to-asset JSON map                    |
| `--output`             | Output filename                                     |

The data set is organized by **filing window**, not by report period:

| Quarter | Filing window                            |
| ------- | ---------------------------------------- |
| Q1      | 1 March – 31 May                         |
| Q2      | 1 June – 31 August                       |
| Q3      | 1 September – 30 November                |
| Q4      | 1 December – end of February (next year) |

Data sets through 2023 use `{year}q{quarter}_form13f.zip`; 2024+ use month
ranges such as `01jun2026-31aug2026_form13f.zip`. The newest posting may live
under `/files/datastandardsinnovation/` rather than `/files/structureddata/`;
the collector tries both.

The ZIP is parsed in memory with Node's `zlib` (no new dependency) and the
relevant rows are read from `SUBMISSION.tsv`, `COVERPAGE.tsv` and
`INFOTABLE.tsv`.

Output: `Edgar 13f bulk_{period}_{cusips}.json`

- `managers[]` — one record per reporting manager, each with its own
  `periods[]` and holdings.
- `target` — requested CUSIPs, resolved asset id, and any unmatched CUSIPs.
- `totals` — manager/position counts, normalized value and shares by type.
- `dataset` — year, quarter, URL or local ZIP path, generation time.

## Amendments

Both 13F paths apply the same deterministic rules per manager and report
period, in filing-date order:

- A later non-amendment report replaces the active entries.
- `RESTATEMENT` replaces the active entries.
- `NEW HOLDINGS` appends its rows to the active entries.

`filingRefs` on each aggregated holding shows every filing that contributed,
so an amended position can be traced back to the original and the amendment.

A `13F-HR/A` can therefore add positions that did not exist in the original
report. The collector does not treat the amendment as a complete replacement
unless the cover page says `RESTATEMENT`.

## Value units

Form 13F value reporting changed on **2023-01-03**:

- before that date, market value was reported in **thousands of dollars**
- on or after that date, market value is reported in **dollars**

The collector preserves `valueAsReported` exactly and derives:

- `valueUnit` — `USD_THOUSANDS` or `USD`
- `valueUnitSource` — `sec_filing_date_rule`
- `valueUsd` — normalized to dollars
- `impliedPricePerShare` — `valueUsd / shares` when shares are positive

**Data-quality caveat:** the SEC data sets are "as-filed". A small number of
pre-2023 filers reported dollars instead of thousands (or otherwise deviated
from the instruction). The collector does not silently correct those filings.
`valueAsReported` is the source of truth; `impliedPricePerShare` makes an
implausible unit visible (for example, a share price in the hundreds of
thousands for a large-cap stock).

## CUSIP resolution

CUSIPs are never matched to assets by issuer name. Resolution only uses an
explicit mapping:

```json
{
  "037833100": { "assetId": "AAPL", "ticker": "AAPL", "name": "Apple Inc." }
}
```

Unmapped holdings are returned with `assetResolution: "unmapped"` and
`assetId: null`. This is deliberate: a fuzzy name match can associate a
position with the wrong share class or the wrong company.

The bulk CLI can also be given `--asset=AAPL`, which applies that asset id to
every requested CUSIP after the caller has identified the security.

## What Form 13F does not tell you

- It is not a complete list of shareholders. Only qualifying institutional
  investment managers file it.
- Holdings are reported with a delay (up to 45 days after quarter end, and
  amendments can arrive later).
- It covers Section 13(f) securities only.
- Confidential holdings may be omitted from public filings.
- A `13F-NT` notice reports no holdings and is not included in the manager
  filter; only `13F-HR` and `13F-HR/A` are collected.
- Reported values are the manager's valuation at the report date, not a live
  market value.

## Tests

`tests/secOwnership.parsing.test.ts` covers the deterministic parsing and
amendment logic without network access:

```powershell
npx.cmd tsx tests/secOwnership.parsing.test.ts
```

`tests/secFilingIntelligence.test.ts` covers 13D/13G parsing, HTML/SGML to
text, excerpt verification, corporate-action tiering, date parsing and the
extraction schemas:

```powershell
npx.cmd tsx tests/secFilingIntelligence.test.ts
```
