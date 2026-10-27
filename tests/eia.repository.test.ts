import {
  createDbClient,
  dedupeObservations,
  findEnergyAsset,
  insertLatestSnapshot,
  readEnergyState,
  upsertCommodityProfile,
  upsertEnergyAsset,
  upsertSeriesObservations,
  type DbClient,
  type DbQueryResult,
} from "../collectors/assets/energy/energyRepository.js";
import { normalizeEiaSeries } from "../collectors/assets/energy/eiaNormalizer.js";
import {
  findEiaSeries,
  findEnergyAsset as findAssetDefinition,
} from "../collectors/assets/energy/eiaSeriesCatalog.js";
import { persistEnergySeries } from "../collectors/assets/energy/eiaFetchers.js";
import type {
  EiaObservation,
  EiaSeriesDefinition,
  EnergyAssetInput,
} from "../types/EIA/eia.types.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

/**
 * Behavioural fake of the narrow SQL surface this repository uses.
 *
 * It models the constraints that make writes idempotent:
 *
 *   - one commodity asset per symbol or `external_ids.eia.series`
 *   - `assets.commodities` one row per asset, NULL never erases a value
 *   - `assets.series_observations` unique on
 *     (provider, series_id, frequency, period)
 *   - the guarded `assets.information` insert keyed on `snapshot_key`
 *
 * It is not a SQL parser. Unrecognised statements throw, and any attempt to
 * write `assets.asset_price_history` throws, so a change in the repository's SQL
 * contract fails the test instead of passing silently.
 */
class FakeDb implements DbClient {
  assets: Array<Record<string, unknown>> = [];
  profiles = new Map<string, Record<string, unknown>>();
  observations = new Map<string, Record<string, unknown>>();
  snapshots = new Map<string, Record<string, unknown>>();
  statements: string[] = [];

  private nextAssetId = 1;
  private nextSnapshotId = 1;

  async query(text: string, values: unknown[] = []): Promise<DbQueryResult> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.statements.push(sql);

    if (sql.includes("asset_price_history")) {
      throw new Error("fake: asset_price_history must never be written by the energy collector");
    }

    if (
      sql.startsWith(
        "SELECT id, symbol, name, asset_type, external_ids, created_at, updated_at FROM assets.assets",
      )
    ) {
      const symbol = String(values[0] ?? "").toLowerCase();
      const series = String(values[1] ?? "");
      const match = this.assets.find((asset) => {
        if (asset["asset_type"] !== "commodity") {
          return false;
        }
        const external = asset["external_ids"] as Record<string, unknown> | undefined;
        const eia = external?.["eia"] as Record<string, unknown> | undefined;
        return String(asset["symbol"]).toLowerCase() === symbol || eia?.["series"] === series;
      });
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.startsWith("UPDATE assets.assets SET external_ids = jsonb_set(")) {
      const asset = this.assets.find((entry) => entry["id"] === values[0]);
      if (!asset) {
        throw new Error("fake: update of unknown asset");
      }
      const incoming = JSON.parse(String(values[1])) as Record<string, unknown>;
      const existing = (asset["external_ids"] as Record<string, unknown>) ?? {};
      const existingEia = (existing["eia"] as Record<string, unknown> | undefined) ?? {};
      asset["external_ids"] = { ...existing, eia: { ...existingEia, ...incoming } };
      asset["updated_at"] = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("INSERT INTO assets.assets (symbol, name, asset_type, external_ids)")) {
      const external = JSON.parse(String(values[2])) as Record<string, unknown>;
      const now = new Date().toISOString();
      const asset = {
        id: `asset-${this.nextAssetId++}`,
        symbol: values[0],
        name: values[1],
        asset_type: "commodity",
        external_ids: { eia: external },
        created_at: now,
        updated_at: now,
      };
      this.assets.push(asset);
      return { rows: [{ id: asset.id }], rowCount: 1 };
    }

    if (sql.startsWith("INSERT INTO assets.commodities")) {
      const assetId = String(values[0]);
      const current = this.profiles.get(assetId);
      this.profiles.set(assetId, {
        commodity_type: values[1] ?? current?.["commodity_type"] ?? null,
        benchmark: values[2] ?? current?.["benchmark"] ?? null,
        currency: values[3] ?? current?.["currency"] ?? null,
        unit_of_measure: values[4] ?? current?.["unit_of_measure"] ?? null,
        value_drivers:
          values[5] === null
            ? (current?.["value_drivers"] ?? {})
            : (JSON.parse(String(values[5])) as Record<string, unknown>),
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("INSERT INTO assets.series_observations")) {
      if (values.length % 9 !== 0) {
        throw new Error(`fake: unexpected observation parameter count ${values.length}`);
      }

      const rows: Array<Record<string, unknown>> = [];
      for (let index = 0; index < values.length; index += 9) {
        const provider = String(values[index]);
        const seriesId = String(values[index + 1]);
        const frequency = String(values[index + 2]);
        const period = String(values[index + 3]);
        const key = `${provider}|${seriesId}|${frequency}|${period}`;
        const inserted = !this.observations.has(key);
        this.observations.set(key, {
          provider,
          series_id: seriesId,
          frequency,
          period,
          value: values[index + 4],
          unit: values[index + 5],
          series_name: values[index + 6],
          source: values[index + 7],
          source_url: values[index + 8],
          observed_at: null,
          collected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        rows.push({ inserted });
      }

      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith("INSERT INTO assets.information")) {
      const snapshotKey = String(values[5]);
      if (this.snapshots.has(snapshotKey)) {
        return { rows: [], rowCount: 0 };
      }
      const id = `snapshot-${this.nextSnapshotId++}`;
      this.snapshots.set(snapshotKey, {
        id,
        asset_id: values[0],
        information_type: values[1],
        data: JSON.parse(String(values[2])) as Record<string, unknown>,
        source: "eia",
        source_url: values[3],
        observed_at: null,
        collected_at: values[4],
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (sql.startsWith("SELECT COUNT(*)::int AS observation_count")) {
      const rows = [...this.observations.values()].filter(
        (entry) => entry["provider"] === "eia" && entry["series_id"] === values[0],
      );
      const periods = rows.map((entry) => String(entry["period"])).sort();
      return {
        rows: [
          {
            observation_count: rows.length,
            earliest_period: periods[0] ?? null,
            latest_period: periods[periods.length - 1] ?? null,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.startsWith("SELECT series_id, frequency, period, value, unit, series_name")) {
      const rows = [...this.observations.values()]
        .filter((entry) => entry["provider"] === "eia" && entry["series_id"] === values[0])
        .sort((left, right) => String(right["period"]).localeCompare(String(left["period"])))
        .slice(0, Number(values[1]));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith("SELECT id, asset_id, information_type, source, source_url")) {
      const rows = [...this.snapshots.values()]
        .filter((entry) => (entry["data"] as Record<string, unknown>)["series_id"] === values[0])
        .slice(0, Number(values[1]));
      return { rows, rowCount: rows.length };
    }

    throw new Error(`fake: unhandled statement: ${sql.slice(0, 140)}`);
  }
}

const WTI = findEiaSeries("RWTC");
const INVENTORY = findEiaSeries("WCESTUS1");
const BRENT = findEiaSeries("RBRTE");

if (WTI === null || INVENTORY === null || BRENT === null) {
  throw new Error("catalog is missing required series");
}

const FETCHED_AT = "2026-10-27T18:00:00.000Z";

const observation = (
  definition: EiaSeriesDefinition,
  period: string,
  value: number,
): EiaObservation => ({
  provider: "eia",
  series_id: definition.series_id,
  frequency: definition.frequency,
  period,
  value,
  unit: definition.unit,
  series_name: definition.title,
  collected_at: FETCHED_AT,
});

const wtiObservations: EiaObservation[] = [
  observation(WTI, "2026-10-16", 99.93),
  observation(WTI, "2026-10-19", 101.1),
  observation(WTI, "2026-10-20", 107.89),
];

const inventoryObservations: EiaObservation[] = [
  observation(INVENTORY, "2026-10-02", 411_000),
  observation(INVENTORY, "2026-10-09", 412_100),
  observation(INVENTORY, "2026-10-16", 412_517),
];

const assetDefinition = findAssetDefinition("RWTC");
if (assetDefinition === null) {
  throw new Error("RWTC asset definition missing");
}

const wtiAssetInput: EnergyAssetInput = {
  symbol: assetDefinition.symbol,
  name: assetDefinition.name,
  commodity_type: assetDefinition.commodity_type,
  benchmark: assetDefinition.benchmark,
  currency: assetDefinition.currency,
  unit_of_measure: assetDefinition.unit_of_measure,
  value_drivers: assetDefinition.value_drivers,
  provider_series: WTI.series_id,
  provider_route: WTI.route,
  provider_frequency: WTI.frequency,
  provider_unit: WTI.unit,
  provider_title: WTI.title,
};

// --------------------------------------------------
// First write: WTI vertical slice
// --------------------------------------------------

const db = new FakeDb();

const firstWrite = await persistEnergySeries(db, {
  definition: WTI,
  observations: wtiObservations,
  sourceUrl: "https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=<redacted>",
});

pass("price series creates an asset", firstWrite.asset_created);
pass("asset id is returned", firstWrite.asset_id?.startsWith("asset-") === true);
pass("only one asset exists", db.assets.length === 1);
pass("asset is a commodity", db.assets[0]?.["asset_type"] === "commodity");
pass("asset uses the EIA series id as symbol", db.assets[0]?.["symbol"] === "RWTC");
pass("asset keeps the curated name", db.assets[0]?.["name"] === assetDefinition.name);
pass(
  "asset records the provider series",
  (
    (db.assets[0]?.["external_ids"] as Record<string, unknown>)?.["eia"] as Record<string, unknown>
  )?.["series"] === "RWTC",
);
pass(
  "asset records the pinned frequency",
  (
    (db.assets[0]?.["external_ids"] as Record<string, unknown>)?.["eia"] as Record<string, unknown>
  )?.["frequency"] === "daily",
);
pass(
  "asset records the provider unit verbatim",
  (
    (db.assets[0]?.["external_ids"] as Record<string, unknown>)?.["eia"] as Record<string, unknown>
  )?.["unit"] === "$/BBL",
);

const profile = db.profiles.get(firstWrite.asset_id!);
pass("commodity profile is written", profile !== undefined);
pass("profile benchmark is WTI", profile?.["benchmark"] === "WTI");
pass("profile currency is USD", profile?.["currency"] === "USD");
pass("profile unit is the label expansion", profile?.["unit_of_measure"] === "USD per barrel");
pass(
  "profile keeps curated value drivers",
  (profile?.["value_drivers"] as Record<string, unknown>)?.["provenance"] === "collector-curated",
);

pass("all three observations are inserted", firstWrite.observations_inserted === 3);
pass("nothing is updated on first write", firstWrite.observations_updated === 0);
pass("three observation rows exist", db.observations.size === 3);
pass(
  "observation keeps the pinned unit",
  db.observations.get("eia|RWTC|daily|2026-10-20")?.["unit"] === "$/BBL",
);
pass(
  "observation records the provider source",
  db.observations.get("eia|RWTC|daily|2026-10-20")?.["source"] === "eia",
);
pass(
  "observation leaves observed_at null",
  db.observations.get("eia|RWTC|daily|2026-10-20")?.["observed_at"] === null,
);

pass("snapshot is inserted", firstWrite.snapshot_inserted);
pass(
  "snapshot is a market snapshot",
  db.snapshots.get(firstWrite.snapshot_key!)?.["information_type"] === "market_snapshot",
);
pass(
  "snapshot is linked to the price asset",
  db.snapshots.get(firstWrite.snapshot_key!)?.["asset_id"] === firstWrite.asset_id,
);
pass(
  "snapshot stores the latest period only",
  (db.snapshots.get(firstWrite.snapshot_key!)?.["data"] as Record<string, unknown>)["period"] ===
    "2026-10-20",
);

// --------------------------------------------------
// Second write: idempotency
// --------------------------------------------------

const secondWrite = await persistEnergySeries(db, {
  definition: WTI,
  observations: wtiObservations,
  sourceUrl: "https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=<redacted>",
});

pass("asset is not created twice", !secondWrite.asset_created);
pass("asset id is reused", secondWrite.asset_id === firstWrite.asset_id);
pass("still exactly one asset", db.assets.length === 1);
pass("re-run inserts no observations", secondWrite.observations_inserted === 0);
pass("re-run updates the existing observations", secondWrite.observations_updated === 3);
pass("observation count is unchanged", db.observations.size === 3);
pass("re-run does not duplicate the snapshot", !secondWrite.snapshot_inserted);
pass("snapshot count is unchanged", db.snapshots.size === 1);
pass("snapshot key is stable across runs", secondWrite.snapshot_key === firstWrite.snapshot_key);

// A new published period is a genuinely new latest snapshot.
const newPeriodWrite = await persistEnergySeries(db, {
  definition: WTI,
  observations: [...wtiObservations, observation(WTI, "2026-10-21", 108.4)],
  sourceUrl: "https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=<redacted>",
});
pass("a new period inserts one observation", newPeriodWrite.observations_inserted === 1);
pass("a new period creates a new snapshot", newPeriodWrite.snapshot_inserted);
pass("two snapshots exist", db.snapshots.size === 2);
pass(
  "the new snapshot carries the newer period",
  (db.snapshots.get(newPeriodWrite.snapshot_key!)?.["data"] as Record<string, unknown>)[
    "period"
  ] === "2026-10-21",
);

// --------------------------------------------------
// Fundamental series: market-wide, no asset
// --------------------------------------------------

const fundamentalWrite = await persistEnergySeries(db, {
  definition: INVENTORY,
  observations: inventoryObservations,
  sourceUrl: "https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=<redacted>",
});

pass("a fundamental series creates no asset", fundamentalWrite.asset_id === null);
pass("asset count is unchanged", db.assets.length === 1);
pass("fundamental observations are inserted", fundamentalWrite.observations_inserted === 3);
pass(
  "fundamental rows are stored at weekly cadence",
  db.observations.get("eia|WCESTUS1|weekly|2026-10-16")?.["frequency"] === "weekly",
);
pass(
  "fundamental rows keep their MBBL unit",
  db.observations.get("eia|WCESTUS1|weekly|2026-10-16")?.["unit"] === "MBBL",
);
pass(
  "fundamental snapshot is macro context",
  db.snapshots.get(fundamentalWrite.snapshot_key!)?.["information_type"] === "macro_context",
);
pass(
  "fundamental snapshot has no asset",
  db.snapshots.get(fundamentalWrite.snapshot_key!)?.["asset_id"] === null,
);

// --------------------------------------------------
// Duplicate protection inside a single batch
// --------------------------------------------------

const deduped = dedupeObservations([
  observation(WTI, "2026-10-20", 107.89),
  observation(WTI, "2026-10-20", 108.01),
  observation(WTI, "2026-10-16", 99.93),
]);

pass("duplicates collapse before the insert", deduped.length === 2);
pass("the last duplicate wins", deduped[1]?.value === 108.01);
pass("dedupe sorts by period", deduped[0]?.period === "2026-10-16");

const duplicateBatch = await upsertSeriesObservations(
  db,
  [observation(WTI, "2026-10-20", 107.89), observation(WTI, "2026-10-20", 108.01)],
  { definition: WTI, source: "eia", sourceUrl: null },
);
pass(
  "duplicate periods produce a single write",
  duplicateBatch.inserted + duplicateBatch.updated === 1,
  `inserted=${duplicateBatch.inserted} updated=${duplicateBatch.updated}`,
);

// Non-finite values are dropped rather than written.
const nonFinite = await upsertSeriesObservations(
  db,
  [{ ...observation(WTI, "2026-10-22", 0), value: Number.NaN }],
  { definition: WTI, source: "eia", sourceUrl: null },
);
pass(
  "non-finite values are not written",
  nonFinite.inserted + nonFinite.updated === 0 && !db.observations.has("eia|RWTC|daily|2026-10-22"),
);

// --------------------------------------------------
// Identity protection
// --------------------------------------------------

const curated = new FakeDb();
curated.assets.push({
  id: "asset-curated",
  symbol: "WTI-CURATED",
  name: "WTI (manually verified)",
  asset_type: "commodity",
  external_ids: { eia: { series: "RWTC" }, manual: { reviewed: true } },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

const curatedUpsert = await upsertEnergyAsset(curated, wtiAssetInput);
pass("provider series resolves identity", curatedUpsert.asset_id === "asset-curated");
pass("provider-matched asset is not duplicated", curated.assets.length === 1);
pass("curated name is preserved", curated.assets[0]?.["name"] === "WTI (manually verified)");
pass(
  "manual provider block is preserved",
  (
    (curated.assets[0]?.["external_ids"] as Record<string, unknown>)?.["manual"] as Record<
      string,
      unknown
    >
  )?.["reviewed"] === true,
);

const symbolMatch = new FakeDb();
symbolMatch.assets.push({
  id: "asset-symbol",
  symbol: "RWTC",
  name: "Some existing WTI row",
  asset_type: "commodity",
  external_ids: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});
const symbolUpsert = await upsertEnergyAsset(symbolMatch, wtiAssetInput);
pass("an existing symbol is reused", symbolUpsert.asset_id === "asset-symbol");
pass("symbol match does not duplicate", symbolMatch.assets.length === 1);

const lowercase = await findEnergyAsset(symbolMatch, "rwtc");
pass("symbol lookup is case-insensitive", lowercase?.id === "asset-symbol");

const seriesLookup = await findEnergyAsset(curated, "RWTC");
pass("provider series resolves identity by value", seriesLookup?.id === "asset-curated");

// A non-commodity asset with the same symbol must not be adopted.
const stockAsset = new FakeDb();
stockAsset.assets.push({
  id: "asset-stock",
  symbol: "RWTC",
  name: "Unrelated stock",
  asset_type: "stock",
  external_ids: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});
const stockLookup = await findEnergyAsset(stockAsset, "RWTC");
pass("non-commodity assets are not reused", stockLookup === null);

// --------------------------------------------------
// Metadata is never erased by a null
// --------------------------------------------------

await upsertCommodityProfile(db, firstWrite.asset_id!, wtiAssetInput);
await upsertCommodityProfile(db, firstWrite.asset_id!, {
  ...wtiAssetInput,
  commodity_type: null,
  benchmark: null,
  currency: null,
  unit_of_measure: null,
  value_drivers: null,
});
const afterNull = db.profiles.get(firstWrite.asset_id!);
pass("null classification keeps the stored type", afterNull?.["commodity_type"] === "energy");
pass("null benchmark keeps the stored benchmark", afterNull?.["benchmark"] === "WTI");
pass("null currency keeps the stored currency", afterNull?.["currency"] === "USD");
pass("null unit keeps the stored unit", afterNull?.["unit_of_measure"] === "USD per barrel");
pass(
  "null value drivers keep the stored drivers",
  (afterNull?.["value_drivers"] as Record<string, unknown>)?.["provenance"] === "collector-curated",
);

// --------------------------------------------------
// Unit and frequency are part of the identity
// --------------------------------------------------

const brentWrite = await persistEnergySeries(db, {
  definition: BRENT,
  observations: [observation(BRENT, "2026-10-20", 115.22)],
  sourceUrl: "https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=<redacted>",
});
pass("Brent spot becomes its own asset", brentWrite.asset_id !== firstWrite.asset_id);
pass(
  "Brent spot asset is RBRTE",
  db.assets.some((asset) => asset["symbol"] === "RBRTE"),
);
pass(
  "Brent spot does not reuse the FMP futures symbol",
  !db.assets.some((asset) => asset["symbol"] === "BZUSD"),
);
pass(
  "daily and weekly rows never share an identity",
  db.observations.has("eia|RWTC|daily|2026-10-20") &&
    db.observations.has("eia|WCESTUS1|weekly|2026-10-16") &&
    !db.observations.has("eia|RWTC|weekly|2026-10-20"),
);

// --------------------------------------------------
// SQL contract
// --------------------------------------------------

pass(
  "observation upsert uses the unique key",
  db.statements.some((sql) =>
    sql.includes("ON CONFLICT (provider, series_id, frequency, period) DO UPDATE"),
  ),
);
pass(
  "observation upsert is parameterised",
  db.statements.some((sql) => sql.includes("VALUES ($1, $2, $3, $4, $5::numeric")),
);
pass(
  "snapshot insert is guarded",
  db.statements.some((sql) => sql.includes("WHERE NOT EXISTS ( SELECT 1 FROM assets.information")),
);
pass(
  "snapshot guard includes the snapshot key",
  db.statements.some((sql) => sql.includes("data->>'snapshot_key' = $6")),
);
pass(
  "the collector never writes the OHLC table",
  db.statements.every((sql) => !sql.includes("asset_price_history")),
);
pass(
  "compatibility adapter forwards queries",
  typeof createDbClient({ query: async () => ({ rows: [], rowCount: 0 }) }).query === "function",
);

const adapter = createDbClient({
  query: async (text, values) => ({ rows: [{ text, count: values?.length ?? 0 }], rowCount: 1 }),
});
const adapted = await adapter.query("SELECT 1", [1, 2]);
pass("adapter returns rows", adapted.rows[0]?.["count"] === 2);
pass("adapter reports row count", adapted.rowCount === 1);

// --------------------------------------------------
// Read-back
// --------------------------------------------------

const readback = await readEnergyState(db, ["RWTC", "WCESTUS1"], {
  recentObservations: 2,
  recentSnapshots: 2,
});
pass("read-back returns one entry per series", readback.length === 2);

const wtiState = readback.find((state) => state.series_id === "RWTC");
pass("read-back finds the WTI observations", wtiState?.observation_count === 4);
pass("read-back reports the earliest period", wtiState?.earliest_period === "2026-10-16");
pass("read-back reports the latest period", wtiState?.latest_period === "2026-10-21");
pass("read-back limits recent rows", wtiState?.recent.length === 2);
pass("read-back is newest first", wtiState?.recent[0]?.["period"] === "2026-10-21");
pass("read-back resolves the asset", wtiState?.asset?.symbol === "RWTC");
pass("read-back surfaces snapshots", (wtiState?.snapshots.length ?? 0) === 2);

const inventoryState = readback.find((state) => state.series_id === "WCESTUS1");
pass("read-back finds the fundamental rows", inventoryState?.observation_count === 3);
pass("fundamental read-back has no asset", inventoryState?.asset === null);

// --------------------------------------------------
// Normalization feeds persistence without change
// --------------------------------------------------

const normalized = normalizeEiaSeries(
  {
    response: {
      total: "2",
      data: [
        {
          period: "2026-10-19",
          series: "RWTC",
          value: "101.1",
          units: "$/BBL",
          "series-description": "Cushing, OK WTI Spot Price FOB (Dollars per Barrel)",
        },
        {
          period: "2026-10-20",
          series: "RWTC",
          value: "not a number",
          units: "$/BBL",
          "series-description": "Cushing, OK WTI Spot Price FOB (Dollars per Barrel)",
        },
      ],
    },
  },
  {
    definition: WTI,
    fetchedAt: FETCHED_AT,
    requested: { start: "2026-10-01", end: null, limit: 5_000 },
    truncated: false,
  },
);

const normalizedDb = new FakeDb();
const normalizedWrite = await persistEnergySeries(normalizedDb, {
  definition: WTI,
  observations: normalized.observations,
  sourceUrl: null,
});
pass("normalization rejects the unusable row", normalized.rejected.length === 1);
pass("persistence stores only the usable row", normalizedWrite.observations_inserted === 1);
pass(
  "source_url may be null",
  normalizedDb.observations.get("eia|RWTC|daily|2026-10-19")?.["source_url"] === null,
);

const emptyWrite = await persistEnergySeries(new FakeDb(), {
  definition: WTI,
  observations: [],
  sourceUrl: null,
});
pass("an empty window writes no snapshot", emptyWrite.snapshot_inserted === false);
pass("an empty window still resolves the asset", emptyWrite.asset_id !== null);
pass("an empty window inserts no observations", emptyWrite.observations_inserted === 0);

const noSnapshotKey = new FakeDb();
await insertLatestSnapshot(noSnapshotKey, {
  asset_id: null,
  information_type: "macro_context",
  definition: INVENTORY,
  observation: inventoryObservations[2]!,
  source_url: "",
});
pass("a macro snapshot stores no asset", noSnapshotKey.snapshots.size === 1);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll EIA repository tests passed.");
}
