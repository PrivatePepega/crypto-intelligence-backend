# Corporate Actions and Capital Raising

Collector for SEC filings that can change a company's valuation, ownership or
financial condition: current reports, securities registrations and
prospectuses, tender offers and merger proxies.

Script: `collectors/assets/stocks/secCorporateActions.ts`

```powershell
npx.cmd tsx collectors/assets/stocks/secCorporateActions.ts --cik=320193 --max=12
```

## Options

| Option               | Meaning                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `--cik=320193`       | Issuer CIK (default Apple)                                               |
| `--max=12`           | Number of filings to process after prioritization                        |
| `--forms=8-K,424B5`  | Restrict discovery to specific forms                                     |
| `--since=2026-01-01` | Ignore filings before this date                                          |
| `--extract=false`    | Discover and list filings without reading them                           |
| `--model=google`     | Extraction model: `google`, `groq`, `openai`, `openrouter`, `cloudflare` |
| `--max-chars=60000`  | Document text budget passed to the extractor                             |
| `--refresh=true`     | Re-fetch the submissions JSON                                            |
| `--output=...`       | Default `Edgar corporate_actions_CIK{cik}.json`                          |

## Discovery forms and priority

The form list is a discovery filter, not a complete taxonomy. The same event
can be disclosed on a different form, and a company may file an 8-K about an
offering and a 424B5 prospectus for the same transaction.

| Tier | Forms                                      | Why                                                                    |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------- |
| 1    | `8-K`, `8-K/A`                             | Current reports: material agreements, acquisitions, defaults, officers |
| 2    | `S-1`, `S-3`, `424B1`, `424B3`, `424B5`    | Registration and offering documents                                    |
| 3    | `SC TO-T`, `SC TO-I`, `DEFM14A`, `PREM14A` | Tender offers and merger proxies                                       |
| 4    | `DEF 14A`                                  | Annual proxy: governance, compensation, director disclosures           |

Amendments (`/A`) are accepted automatically. Candidates are sorted by tier
first and filing date second, so a small `--max` still surfaces this quarter's
8-Ks and offering documents before a routine annual proxy.

## Flow

1. Load the submissions JSON (saved copy first).
2. Filter `filings.recent` for the accepted forms and optional `--since` date.
3. Sort by tier, then newest first, and take `--max`.
4. Fetch each primary document, normalize it to text, and send it to the
   extractor. The AI module is imported lazily, so `--extract=false` works
   without provider credentials.
5. Keep the event, its evidence and the filing links. **No document is saved.**

Only the primary document is read. Exhibits — the actual merger agreement or
credit agreement attached to an 8-K — remain reachable through
`filingIndexUrl`, but are not fetched by default.

## Output

`Edgar corporate_actions_CIK{cik}.json` contains `filings[]`, each with:

- `form`, `tier`, `accessionNumber`, `filingDate`, `reportDate`,
  `primaryDocDescription`
- `documentUrl`, `filingIndexUrl`
- `extractionStatus` — `ai`, `skipped` (with `--extract=false`) or `failed`
- `event` — the extracted event, or `null` when it was not read
- `documentChars`, `documentTruncated`
- `evidence` — form, accession, dates, URLs, verified `excerpts`,
  `excerptsVerified`, `excerptsRejected`
- `extractionUsage` — model and token counts

### Event fields

- `isCorporateAction` — false when the document is routine and discloses no
  valuation-, ownership- or condition-relevant event
- `eventType` — one of `acquisition`, `divestiture`, `merger`, `tenderOffer`,
  `securitiesOffering`, `debtFinancing`, `executiveChange`,
  `materialAgreement`, `bankruptcy`, `default`, `delisting`, `restructuring`,
  `shareholderMeeting`, `earnings`, `other`
- `summary` — what happened, in two sentences or fewer
- `parties[]` — name and role (acquirer, target, issuer, lender, executive...)
- `eventDate` — ISO date when the document states one
- `amounts[]` — label, value, currency and unit as disclosed
- `financialImplications` — potential effect on valuation, ownership or
  financial condition, limited to what the filing supports
- `confidence` — `low`, `medium` or `high`

`summary` reports counts by tier and event type, plus extracted/skipped/failed
totals.

## AI extraction rules

The extractor is a reader, not a source of truth:

- The document is treated as untrusted data. Text inside it that addresses the
  model or asks for a different output is ignored.
- Values are returned only when the document states them. A missing number is
  `null`, never an estimate.
- Percentages are numbers from 0 to 100, dates are `YYYY-MM-DD`, and amounts
  are plain numbers without separators.
- `financialImplications` must be grounded in the filing. Dilution, leverage,
  change of control and going-concern language are reported only where the
  document supplies the facts.

Every quote is checked against the normalized document text. Quotes that are
not found are dropped and counted in `excerptsRejected`; they are never stored
as evidence.

The extractor defaults to the Google Gemini model configured in
`AI/providers/model.ts`. Provider availability varies; `--model` selects
another configured provider when the default is unavailable.

## Limits worth keeping in mind

- **Primary documents only.** An 8-K often just announces an event and attaches
  the agreement as an exhibit. The extraction describes what the 8-K says, not
  the full terms in the exhibit.
- **Proxies are long.** `DEF 14A` documents are truncated at `--max-chars`.
  Compensation tables near the end of a very long proxy may fall outside the
  window; the filing link is always kept.
- **Truncation is recorded.** `documentChars` is the normalized length before
  truncation, and `documentTruncated` says whether the model saw the whole
  document. Treat a truncated extraction as provisional.
- **One document per accession.** A filing with several documents (a prospectus
  and a supplement, for example) contributes only its primary document.
- **The form is not the event.** An 8-K can disclose something routine, and an
  offering can be announced in a press release exhibit. `isCorporateAction` and
  `confidence` exist because the form type alone is not a reliable signal.
- **No live prices.** Amounts are as disclosed. The collector does not convert
  currencies or value an offering against a market price.

## Evidence and persistence

Nothing from the document body is persisted beyond verified excerpts and the
extracted facts. Each row keeps:

- `documentUrl` — the exact document that was read
- `filingIndexUrl` — every document in the submission, including exhibits
- `evidence.excerpts[]` — verbatim sentences that support the extraction

This keeps the report small while leaving the original filing one click away.

## Tests

`tests/secFilingIntelligence.test.ts` covers form tiering, HTML/SGML to text,
date parsing, excerpt verification and the extraction schemas without network
access:

```powershell
npx.cmd tsx tests/secFilingIntelligence.test.ts
```
