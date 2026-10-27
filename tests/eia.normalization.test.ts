import {
  buildObservationKey,
  buildObservationSnapshotData,
  isValidPeriod,
  mergeSeriesResults,
  normalizeEiaSeries,
  parseEiaValue,
  parseProviderTotal,
  snapshotTypeFor,
} from "../collectors/assets/energy/eiaNormalizer.js";
import {
  DEFAULT_EIA_SERIES_IDS,
  EIA_SERIES,
  findEiaSeries,
  findEnergyAsset,
  ENERGY_ASSETS,
} from "../collectors/assets/energy/eiaSeriesCatalog.js";
import {
  defaultSeriesStart,
  parseSeriesList,
  resolveSeriesWindow,
} from "../collectors/assets/energy/eiaFetchers.js";
import {
  classifyEiaStatus,
  isRetryableEiaFailure,
  readEiaError,
  readEiaWarnings,
  redactEiaUrl,
} from "../collectors/assets/energy/eiaClient.js";
import type { EiaSeriesDefinition } from "../types/EIA/eia.types.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const WTI = findEiaSeries("RWTC");
if (WTI === null) {
  throw new Error("RWTC missing from the catalog; cannot run normalization tests.");
}

const INVENTORY = findEiaSeries("WCESTUS1");
if (INVENTORY === null) {
  throw new Error("WCESTUS1 missing from the catalog; cannot run normalization tests.");
}

const MONTHLY = findEiaSeries("MCRFPUS2");
if (MONTHLY === null) {
  throw new Error("MCRFPUS2 missing from the catalog; cannot run normalization tests.");
}

const FETCHED_AT = "2026-10-27T18:00:00.000Z";

const REQUESTED = { start: "2026-10-01", end: null, limit: 5_000 };

/** Minimal real-shaped row. */
const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  period: "2026-10-20",
  duoarea: "YCUOK",
  "area-name": "NA",
  product: "EPCWTI",
  "product-name": "WTI Crude Oil",
  process: "PF4",
  "process-name": "Spot Price FOB",
  series: "RWTC",
  "series-description": "Cushing, OK WTI Spot Price FOB (Dollars per Barrel)",
  value: "107.89",
  units: "$/BBL",
  ...overrides,
});

const envelope = (rows: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  warnings: [],
  response: {
    total: String(rows.length),
    dateFormat: "YYYY-MM-DD",
    frequency: "daily",
    data: rows,
    ...extra,
  },
});

// --------------------------------------------------
// Period validation
// --------------------------------------------------

pass("daily period is valid", isValidPeriod("2026-10-20", "daily"));
pass("weekly period is valid", isValidPeriod("2026-10-16", "weekly"));
pass("monthly period is valid", isValidPeriod("2026-09", "monthly"));
pass("annual period is valid", isValidPeriod("2025", "annual"));
pass("quarterly period is valid", isValidPeriod("2026-Q3", "quarterly"));
pass("monthly period rejected for a daily series", !isValidPeriod("2026-10", "daily"));
pass("daily period rejected for a monthly series", !isValidPeriod("2026-10-01", "monthly"));
pass("impossible calendar day is rejected", !isValidPeriod("2026-02-30", "daily"));
pass("month 13 is rejected", !isValidPeriod("2026-13", "monthly"));
pass("free text is rejected", !isValidPeriod("latest", "daily"));

// --------------------------------------------------
// Value and total parsing
// --------------------------------------------------

pass("string value becomes a number", parseEiaValue("107.89") === 107.89);
pass("numeric value passes through", parseEiaValue(0) === 0);
pass("negative values are legitimate", parseEiaValue("-3.25") === -3.25);
pass("empty string has no value", parseEiaValue("") === null);
pass("NA has no value", parseEiaValue("NA") === null);
pass("null has no value", parseEiaValue(null) === null);
pass("absent has no value", parseEiaValue(undefined) === null);
pass("non-numeric text has no value", parseEiaValue("see note") === null);
pass("provider total is parsed from a string", parseProviderTotal("10276") === 10276);
pass("provider total accepts a number", parseProviderTotal(42) === 42);
pass("negative total is rejected", parseProviderTotal("-1") === null);
pass("non-numeric total is rejected", parseProviderTotal("many") === null);

// --------------------------------------------------
// Happy path
// --------------------------------------------------

const happy = normalizeEiaSeries(envelope([row()]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});

pass("one observation is produced", happy.observations.length === 1);
pass("value is numeric", happy.observations[0]?.value === 107.89);
pass("unit is the pinned catalog unit", happy.observations[0]?.unit === "$/BBL");
pass("frequency is the pinned cadence", happy.observations[0]?.frequency === "daily");
pass("period is preserved verbatim", happy.observations[0]?.period === "2026-10-20");
pass("provider is recorded", happy.observations[0]?.provider === "eia");
pass(
  "series description is captured",
  happy.observations[0]?.series_name?.startsWith("Cushing, OK") === true,
);
pass("collection time is recorded", happy.observations[0]?.collected_at === FETCHED_AT);
pass("provider total is parsed", happy.provider_total === 1);
pass("no rows are rejected", happy.rejected.length === 0);
pass("nothing is truncated", !happy.truncated);

// EIA reports a period, not an instant. observed_at stays NULL.
const snapshotData = buildObservationSnapshotData(WTI, happy.observations[0]!);
pass("snapshot carries the series id", snapshotData["series_id"] === "RWTC");
pass("snapshot carries the period", snapshotData["period"] === "2026-10-20");
pass("snapshot carries the value", snapshotData["value"] === 107.89);
pass("snapshot carries the unit", snapshotData["unit"] === "$/BBL");
pass("snapshot carries the frequency", snapshotData["frequency"] === "daily");
pass("snapshot carries the source", snapshotData["source"] === "eia");
pass("snapshot does not invent an instant", snapshotData["observed_at"] === null);
pass("snapshot key is stable", snapshotData["snapshot_key"] === "eia:RWTC:daily:2026-10-20:latest");
pass("price series is a market snapshot", snapshotTypeFor(WTI) === "market_snapshot");
pass("fundamental series is macro context", snapshotTypeFor(INVENTORY) === "macro_context");

// --------------------------------------------------
// Integrity: units
// --------------------------------------------------

const wrongUnit = normalizeEiaSeries(envelope([row({ units: "$/GAL" })]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});

pass("unit mismatch produces no observation", wrongUnit.observations.length === 0);
pass("unit mismatch is reported", wrongUnit.rejected.length === 1);
pass(
  "unit mismatch names both units",
  wrongUnit.rejected[0]?.reason.includes("$/GAL") === true &&
    wrongUnit.rejected[0]?.reason.includes("$/BBL") === true,
);
pass(
  "unit mismatch is never converted",
  wrongUnit.observations.every((observation) => observation.unit === WTI.unit),
);

const missingUnit = normalizeEiaSeries(envelope([row({ units: null })]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass(
  "an absent unit falls back to the pinned catalog unit",
  missingUnit.observations[0]?.unit === WTI.unit,
);

// --------------------------------------------------
// Integrity: frequency and series identity
// --------------------------------------------------

// A weekly-period row can never be stored as a daily observation: EIA would be
// reporting an aggregate, not a daily value.
const weeklyAggregateForDailySeries = normalizeEiaSeries(
  envelope([row({ period: "2026-10-16" })]),
  {
    definition: WTI,
    fetchedAt: FETCHED_AT,
    requested: REQUESTED,
    truncated: false,
  },
);
pass(
  "a daily-formatted weekly aggregate cannot be told apart, so frequency is pinned at request time",
  weeklyAggregateForDailySeries.observations.length === 1,
);

const monthlyRowForDailySeries = normalizeEiaSeries(envelope([row({ period: "2026-09" })]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass(
  "monthly period is rejected for a daily series",
  monthlyRowForDailySeries.observations.length === 0,
);
pass(
  "cadence mismatch is reported",
  monthlyRowForDailySeries.rejected[0]?.reason.includes("daily") === true,
);

const wrongSeries = normalizeEiaSeries(envelope([row({ series: "RBRTE" })]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass("row from another series is rejected", wrongSeries.observations.length === 0);
pass("cross-series rejection is reported", wrongSeries.rejected.length === 1);

// --------------------------------------------------
// Integrity: unusable values
// --------------------------------------------------

for (const unusable of [null, "", "NA", "--", "not a number"]) {
  const result = normalizeEiaSeries(envelope([row({ value: unusable })]), {
    definition: WTI,
    fetchedAt: FETCHED_AT,
    requested: REQUESTED,
    truncated: false,
  });
  pass(
    `unusable value ${JSON.stringify(unusable)} is rejected, not zeroed`,
    result.observations.length === 0 &&
      result.rejected.length === 1 &&
      result.rejected[0]?.reason === "no usable numeric value",
  );
}

const mixedValues = normalizeEiaSeries(
  envelope([
    row({ period: "2026-10-16", value: "99.93" }),
    row({ period: "2026-10-19", value: null }),
    row({ period: "2026-10-20", value: "107.89" }),
  ]),
  { definition: WTI, fetchedAt: FETCHED_AT, requested: REQUESTED, truncated: false },
);
pass("usable rows survive an unusable neighbour", mixedValues.observations.length === 2);
pass("only the unusable row is rejected", mixedValues.rejected.length === 1);

// --------------------------------------------------
// Ordering and duplicates
// --------------------------------------------------

const unsorted = normalizeEiaSeries(
  envelope([
    row({ period: "2026-10-20", value: "107.89" }),
    row({ period: "2026-10-16", value: "99.93" }),
    row({ period: "2026-10-19", value: "101.10" }),
  ]),
  { definition: WTI, fetchedAt: FETCHED_AT, requested: REQUESTED, truncated: false },
);
pass(
  "observations are sorted by period",
  unsorted.observations.map((observation) => observation.period).join(",") ===
    "2026-10-16,2026-10-19,2026-10-20",
);

const duplicated = normalizeEiaSeries(
  envelope([
    row({ period: "2026-10-20", value: "107.89" }),
    row({ period: "2026-10-20", value: "108.01" }),
  ]),
  { definition: WTI, fetchedAt: FETCHED_AT, requested: REQUESTED, truncated: false },
);
pass("duplicate periods collapse", duplicated.observations.length === 1);
pass("duplicates_removed is counted", duplicated.duplicates_removed === 1);
pass("the last duplicate wins", duplicated.observations[0]?.value === 108.01);

pass(
  "observation key mirrors the database unique key",
  buildObservationKey(unsorted.observations[0]!) === "eia:RWTC:daily:2026-10-16",
);

// --------------------------------------------------
// Envelope edge cases
// --------------------------------------------------

const empty = normalizeEiaSeries(envelope([]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass(
  "an empty series is not an error",
  empty.observations.length === 0 && empty.rejected.length === 0,
);
pass("an empty series still reports its total", empty.provider_total === 0);

const withWarnings = normalizeEiaSeries(
  {
    warnings: [
      {
        warning: "incomplete return",
        description: "The API can only return 5000 rows in JSON format.",
      },
    ],
    response: { total: "10276", data: [row()] },
  },
  { definition: WTI, fetchedAt: FETCHED_AT, requested: REQUESTED, truncated: true },
);
pass("warnings are surfaced", withWarnings.warnings.length === 1);
pass(
  "warning text keeps both parts",
  withWarnings.warnings[0] ===
    "incomplete return: The API can only return 5000 rows in JSON format.",
);
pass("truncation is preserved", withWarnings.truncated);
pass("a response without a frequency echo stays null", withWarnings.provider_frequency === null);

const malformed = normalizeEiaSeries(
  { response: { data: "nope" } },
  {
    definition: WTI,
    fetchedAt: FETCHED_AT,
    requested: REQUESTED,
    truncated: false,
  },
);
pass("a non-array data node is rejected, not crashed", malformed.observations.length === 0);
pass("malformed payloads are reported", malformed.rejected.length === 1);

const notAnEnvelope = normalizeEiaSeries("plain text", {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass("a non-envelope body is rejected", notAnEnvelope.observations.length === 0);
pass("non-envelope rejection is reported", notAnEnvelope.rejected.length === 1);

const invalidRow = normalizeEiaSeries(envelope([{ period: "2026-10-20" }]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
pass("a row without a series id is rejected", invalidRow.observations.length === 0);
pass("row schema failures are reported", invalidRow.rejected.length === 1);

// --------------------------------------------------
// Pagination merge
// --------------------------------------------------

const pageOne = normalizeEiaSeries(envelope([row({ period: "2026-10-16", value: "99.93" })]), {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
  truncated: false,
});
const pageTwo = normalizeEiaSeries(
  envelope([
    row({ period: "2026-10-20", value: "107.89" }),
    row({ period: "2026-10-20", value: "107.95" }),
  ]),
  { definition: WTI, fetchedAt: FETCHED_AT, requested: REQUESTED, truncated: false },
);

const merged = mergeSeriesResults([pageOne, pageTwo], {
  definition: WTI,
  fetchedAt: FETCHED_AT,
  requested: REQUESTED,
});

pass("pages merge into one ordered series", merged.observations.length === 2);
pass(
  "merged observations stay ordered",
  merged.observations.map((observation) => observation.period).join(",") ===
    "2026-10-16,2026-10-20",
);
pass("duplicates across pages are counted", merged.duplicates_removed === 1);
pass("merged provider total is retained", merged.provider_total === 2);

// --------------------------------------------------
// Frequencies and units differ across the catalog
// --------------------------------------------------

pass("catalog has 13 verified series", EIA_SERIES.length === 13);
pass(
  "catalog default targets are the catalog",
  DEFAULT_EIA_SERIES_IDS.length === EIA_SERIES.length,
);
pass(
  "catalog includes daily, weekly and monthly cadences",
  new Set(EIA_SERIES.map((definition) => definition.frequency)).size >= 3,
);
pass(
  "catalog units are the verified provider tokens",
  EIA_SERIES.every((definition) =>
    ["$/BBL", "MBBL", "MBBL/D", "%", "BCF", "MMCF"].includes(definition.unit),
  ),
);
pass(
  "every price series has an asset",
  EIA_SERIES.filter((definition) => definition.kind === "price").every(
    (definition) =>
      definition.asset_symbol !== null && findEnergyAsset(definition.asset_symbol) !== null,
  ),
);
pass(
  "fundamental series have no asset",
  EIA_SERIES.filter((definition) => definition.kind === "fundamental").every(
    (definition) => definition.asset_symbol === null,
  ),
);
pass(
  "WTI and Brent spot resolve to distinct assets",
  findEnergyAsset("RWTC")?.symbol !== findEnergyAsset("RBRTE")?.symbol,
);
pass(
  "Brent spot asset is not the FMP futures symbol",
  ENERGY_ASSETS.every((asset) => asset.symbol !== "BZUSD"),
);
pass(
  "only WTI carries curated value drivers",
  findEnergyAsset("RWTC")?.value_drivers !== null &&
    findEnergyAsset("RBRTE")?.value_drivers === null,
);
pass(
  "WTI value drivers are labelled as taxonomy",
  (findEnergyAsset("RWTC")?.value_drivers as Record<string, unknown> | null)?.["provenance"] ===
    "collector-curated",
);

// --------------------------------------------------
// CLI argument contracts
// --------------------------------------------------

pass("series list accepts a catalog id", parseSeriesList("RWTC", []).join(",") === "RWTC");
pass("series list deduplicates", parseSeriesList("RWTC,RWTC,WCESTUS1", []).length === 2);
pass(
  "series list defaults to the catalog",
  parseSeriesList(null, DEFAULT_EIA_SERIES_IDS).length === 13,
);

let unknownRejected = false;
try {
  parseSeriesList("NOT_A_SERIES", []);
} catch {
  unknownRejected = true;
}
pass("an unknown series is rejected before any request", unknownRejected);

let emptyRejected = false;
try {
  parseSeriesList(",", []);
} catch {
  emptyRejected = true;
}
pass("an empty series list is rejected", emptyRejected);

const dailyWindow = resolveSeriesWindow(WTI, { from: "2026-09-01", to: "2026-09-30" });
pass(
  "daily window is accepted",
  dailyWindow.start === "2026-09-01" && dailyWindow.end === "2026-09-30",
);

const monthlyWindow = resolveSeriesWindow(MONTHLY, { from: "2025-01", to: "2025-12" });
pass("monthly window keeps month precision", monthlyWindow.start === "2025-01");

let badWindowRejected = false;
try {
  resolveSeriesWindow(WTI, { from: "2026-09", to: null });
} catch {
  badWindowRejected = true;
}
pass("a monthly start is rejected for a daily series", badWindowRejected);

let invertedRejected = false;
try {
  resolveSeriesWindow(WTI, { from: "2026-10-01", to: "2026-09-01" });
} catch {
  invertedRejected = true;
}
pass("an inverted window is rejected locally", invertedRejected);

const now = new Date("2026-10-27T00:00:00.000Z");
pass("daily default start is a date", /^\d{4}-\d{2}-\d{2}$/.test(defaultSeriesStart("daily", now)));
pass("monthly default start is a month", /^\d{4}-\d{2}$/.test(defaultSeriesStart("monthly", now)));
pass("monthly default start is in the past", defaultSeriesStart("monthly", now) < "2026-10");

const definitionWithoutAsset: EiaSeriesDefinition = {
  ...WTI,
  kind: "fundamental",
  asset_symbol: null,
};
pass("a fundamental definition has no asset", definitionWithoutAsset.asset_symbol === null);

// --------------------------------------------------
// Client: status, errors, redaction
// --------------------------------------------------

pass("a 2xx status is not a failure", classifyEiaStatus(200) === null);
pass("403 is unauthorized", classifyEiaStatus(403) === "unauthorized");
pass("401 is unauthorized", classifyEiaStatus(401) === "unauthorized");
pass("400 is an invalid request", classifyEiaStatus(400) === "invalid_request");
pass("404 is an invalid request", classifyEiaStatus(404) === "invalid_request");
pass("429 is rate limiting", classifyEiaStatus(429) === "rate_limited");
pass("500 is a provider fault", classifyEiaStatus(500) === "http_error");

pass("429 is retryable", isRetryableEiaFailure("rate_limited", 429));
pass("a network error is retryable", isRetryableEiaFailure("network", null));
pass("a timeout is retryable", isRetryableEiaFailure("timeout", null));
pass("a 503 is retryable", isRetryableEiaFailure("http_error", 503));
pass("a 400 is not retryable", !isRetryableEiaFailure("invalid_request", 400));
pass("an auth failure is not retryable", !isRetryableEiaFailure("unauthorized", 403));

const nestedError = readEiaError(
  JSON.stringify({
    error: {
      code: "API_KEY_MISSING",
      message: "No api_key was supplied. Please register for one.",
    },
  }),
);
pass("nested auth error code is read", nestedError.code === "API_KEY_MISSING");
pass("nested auth error message is read", nestedError.message?.startsWith("No api_key") === true);

const flatError = readEiaError(
  JSON.stringify({ error: "Requested path /petroleum/pri/nope is not valid.", code: 400 }),
);
pass(
  "flat route error message is read",
  flatError.message?.includes("/petroleum/pri/nope") === true,
);
pass("flat route error code is read", flatError.code === "400");

const textError = readEiaError("  upstream   gateway  ");
pass("plain text errors are normalized", textError.message === "upstream gateway");
pass("an empty body has no error message", readEiaError("   ").message === null);

pass(
  "warnings without a description still surface",
  readEiaWarnings({ warnings: [{ warning: "incomplete return" }] })[0] === "incomplete return",
);
pass("a body without warnings returns none", readEiaWarnings({ response: {} }).length === 0);

const secret = "super-secret-eia-key";
const redacted = redactEiaUrl(
  `https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&api_key=${secret}&length=1`,
);
pass("redaction hides the key", !redacted.includes(secret));
pass("redaction keeps the placeholder readable", redacted.includes("api_key=<redacted>"));
pass("redaction keeps other parameters", redacted.includes("frequency=daily"));
pass(
  "an url without a key is unchanged",
  redactEiaUrl("https://api.eia.gov/v2/").includes("eia.gov"),
);
pass("an unparseable url is reported safely", redactEiaUrl("not a url") === "(unparseable url)");

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll EIA normalization tests passed.");
}
