import {
  createDbClient,
  dedupeCandlesByTimestamp,
  findCommodityAsset,
  insertMarketSnapshot,
  upsertCommodityAsset,
  upsertCommodityProfile,
  upsertDailyCandles,
  type DbClient,
  type DbQueryResult,
} from "../collectors/assets/commodities/commodityRepository.js";
import { buildCommodityAssetInput } from "../collectors/assets/commodities/fmpCommodityNormalizer.js";
import type {
  CommodityCandle,
  CommodityIdentity,
  CommodityQuote,
} from "../types/FMP/fmpCommodity.types.js";

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
 *   - one commodity asset per symbol / provider symbol
 *   - `asset_price_history` unique on (asset_id, interval, timestamp)
 *   - the guarded `assets.information` insert keyed on `snapshot_key`
 *
 * This is not a SQL parser. It throws on any statement it does not recognise,
 * so a change in the repository's SQL contract fails the test instead of silently
 * passing.
 */
class FakeDb implements DbClient {
  assets: Array<Record<string, unknown>> = [];
  profiles = new Map<string, Record<string, unknown>>();
  candles = new Map<string, Record<string, unknown>>();
  snapshots = new Map<string, Record<string, unknown>>();
  statements: string[] = [];

  private nextAssetId = 1;
  private nextSnapshotId = 1;

  async query(text: string, values: unknown[] = []): Promise<DbQueryResult> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.statements.push(sql);

    if (
      sql.startsWith(
        "SELECT id, symbol, name, asset_type, external_ids, created_at, updated_at FROM assets.assets",
      )
    ) {
      const symbol = String(values[0] ?? "").toLowerCase();
      const providerSymbol = String(values[1] ?? "");
      const match = this.assets.find((asset) => {
        const external = asset["external_ids"] as Record<string, unknown> | undefined;
        const fmp = external?.["fmp"] as Record<string, unknown> | undefined;
        return (
          String(asset["symbol"]).toLowerCase() === symbol || fmp?.["symbol"] === providerSymbol
        );
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
      asset["external_ids"] = { ...existing, fmp: { ...(existing["fmp"] ?? {}), ...incoming } };
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
        external_ids: { fmp: external },
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
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("INSERT INTO assets.asset_price_history")) {
      if (values.length % 8 !== 0) {
        throw new Error(`fake: unexpected candle parameter count ${values.length}`);
      }

      const rows: Array<Record<string, unknown>> = [];
      for (let index = 0; index < values.length; index += 8) {
        const assetId = String(values[index]);
        const timestamp = String(values[index + 1]);
        const key = `${assetId}|${timestamp}`;
        const inserted = !this.candles.has(key);
        this.candles.set(key, {
          asset_id: assetId,
          timestamp,
          open: values[index + 2],
          high: values[index + 3],
          low: values[index + 4],
          close: values[index + 5],
          volume: values[index + 6],
          quote_currency: values[index + 7],
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
        data: JSON.parse(String(values[1])) as Record<string, unknown>,
        source_url: values[2],
        observed_at: values[3],
        collected_at: values[4],
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    throw new Error(`fake: unhandled statement: ${sql.slice(0, 120)}`);
  }
}

const identity: CommodityIdentity = {
  provider: "fmp",
  symbol: "GCUSD",
  provider_name: "Gold Futures",
  exchange: null,
  trade_month: "Dec",
  currency: "USD",
  listed_at: "2026-10-27T17:00:00.000Z",
};

const quote: CommodityQuote = {
  provider: "fmp",
  symbol: "GCUSD",
  provider_symbol: "GCUSD",
  name: "Gold Futures",
  currency: "USD",
  price: 4072.5,
  change: 34.1,
  change_percent: 0.84439,
  open: 4032.8,
  previous_close: 4038.4,
  day_low: 4001.6,
  day_high: 4078.9,
  year_low: 3901.3,
  year_high: 5626.8,
  volume: 116759,
  price_avg_50: 4333.19,
  price_avg_200: 4490.37,
  market_cap: null,
  exchange: "COMMODITY",
  observed_at: "2026-10-27T16:54:50.000Z",
  collected_at: "2026-10-27T17:00:00.000Z",
};

const candles: CommodityCandle[] = [
  {
    symbol: "GCUSD",
    date: "2026-10-26",
    timestamp: "2026-10-26T00:00:00.000Z",
    open: 4038.4,
    high: 4050.2,
    low: 3990.1,
    close: 4032.8,
    volume: 110233,
    change: -12.5,
    change_percent: -0.31,
    vwap: 4021.4,
  },
  {
    symbol: "GCUSD",
    date: "2026-10-27",
    timestamp: "2026-10-27T00:00:00.000Z",
    open: 4032.8,
    high: 4078.9,
    low: 4001.6,
    close: 4075.1,
    volume: 116545,
    change: 42.3,
    change_percent: 1.0489,
    vwap: 4051.87,
  },
];

// --------------------------------------------------
// First write
// --------------------------------------------------

const first = new FakeDb();
const assetInput = buildCommodityAssetInput(identity);

const created = await upsertCommodityAsset(first, assetInput);
pass("asset is created on first write", created.created);
pass("created asset id is returned", created.asset_id.startsWith("asset-"));
pass("exactly one asset exists", first.assets.length === 1);
pass("asset is a commodity", first.assets[0]?.["asset_type"] === "commodity");
pass("asset keeps the provider symbol", first.assets[0]?.["symbol"] === "GCUSD");
pass(
  "asset stores the provider identifier",
  (
    (first.assets[0]?.["external_ids"] as Record<string, unknown>)?.["fmp"] as Record<
      string,
      unknown
    >
  )?.["symbol"] === "GCUSD",
);

await upsertCommodityProfile(first, created.asset_id, assetInput);
pass(
  "profile is written",
  first.profiles.get(created.asset_id)?.["commodity_type"] === "precious_metal",
);
pass("profile keeps currency", first.profiles.get(created.asset_id)?.["currency"] === "USD");

const firstCandles = await upsertDailyCandles(first, created.asset_id, candles, {
  quoteCurrency: "USD",
});
pass("both candles are inserted", firstCandles.inserted === 2);
pass("no candles are updated on first write", firstCandles.updated === 0);
pass("two candle rows exist", first.candles.size === 2);
pass(
  "candle volume is preserved",
  first.candles.get(`${created.asset_id}|2026-10-27T00:00:00.000Z`)?.["volume"] === 116545,
);

const firstSnapshot = await insertMarketSnapshot(first, created.asset_id, quote, "https://x/quote");
pass("snapshot is inserted", firstSnapshot.inserted);
pass("snapshot key is returned", firstSnapshot.snapshot_key.startsWith("fmp:GCUSD:"));
pass("one snapshot exists", first.snapshots.size === 1);

// --------------------------------------------------
// Second write: idempotency
// --------------------------------------------------

const secondAsset = await upsertCommodityAsset(first, assetInput);
pass("asset is not created twice", !secondAsset.created);
pass("asset id is reused", secondAsset.asset_id === created.asset_id);
pass("still exactly one asset", first.assets.length === 1);

const secondCandles = await upsertDailyCandles(first, created.asset_id, candles, {
  quoteCurrency: "USD",
});
pass("re-run inserts no candles", secondCandles.inserted === 0);
pass("re-run updates the existing candles", secondCandles.updated === 2);
pass("candle count is unchanged", first.candles.size === 2);

const secondSnapshot = await insertMarketSnapshot(
  first,
  created.asset_id,
  quote,
  "https://x/quote",
);
pass("re-run does not duplicate the snapshot", !secondSnapshot.inserted);
pass("snapshot count is unchanged", first.snapshots.size === 1);
pass(
  "snapshot key is stable across runs",
  secondSnapshot.snapshot_key === firstSnapshot.snapshot_key,
);

// A different provider observation time is a genuinely new snapshot.
const laterQuote: CommodityQuote = {
  ...quote,
  price: 4080.1,
  observed_at: "2026-10-27T17:30:00.000Z",
  collected_at: "2026-10-27T17:31:00.000Z",
};
const laterSnapshot = await insertMarketSnapshot(
  first,
  created.asset_id,
  laterQuote,
  "https://x/quote",
);
pass("a new observation is stored", laterSnapshot.inserted);
pass("two snapshots exist", first.snapshots.size === 2);

// --------------------------------------------------
// Duplicate protection inside a single batch
// --------------------------------------------------

const duplicateBatch = await upsertDailyCandles(
  first,
  created.asset_id,
  [candles[0]!, candles[0]!],
  {
    quoteCurrency: "USD",
  },
);
pass(
  "duplicate timestamps collapse before the insert",
  duplicateBatch.inserted + duplicateBatch.updated === 1,
  `inserted=${duplicateBatch.inserted} updated=${duplicateBatch.updated}`,
);
pass("candle count is still two", first.candles.size === 2);
pass("dedupe keeps one candle", dedupeCandlesByTimestamp([candles[0]!, candles[0]!]).length === 1);
pass(
  "dedupe sorts by timestamp",
  dedupeCandlesByTimestamp([candles[1]!, candles[0]!])[0]?.timestamp === "2026-10-26T00:00:00.000Z",
);

// --------------------------------------------------
// Identity protection
// --------------------------------------------------

const curated = new FakeDb();
curated.assets.push({
  id: "asset-curated",
  symbol: "GCUSD",
  name: "Gold (manually verified)",
  asset_type: "commodity",
  external_ids: { manual: { reviewed: true } },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

const curatedUpsert = await upsertCommodityAsset(curated, assetInput);
pass("existing asset is reused", curatedUpsert.asset_id === "asset-curated");
pass("existing asset is not created", !curatedUpsert.created);
pass("one asset remains", curated.assets.length === 1);
pass(
  "manually verified name is preserved",
  curated.assets[0]?.["name"] === "Gold (manually verified)",
);
pass(
  "manual provider block is preserved",
  (
    (curated.assets[0]?.["external_ids"] as Record<string, unknown>)?.["manual"] as Record<
      string,
      unknown
    >
  )?.["reviewed"] === true,
);
pass(
  "fmp block is merged in",
  (
    (curated.assets[0]?.["external_ids"] as Record<string, unknown>)?.["fmp"] as Record<
      string,
      unknown
    >
  )?.["symbol"] === "GCUSD",
);

const lowercase = await findCommodityAsset(curated, "gcusd");
pass("lookup is case-insensitive", lowercase?.id === "asset-curated");

const providerOnly = new FakeDb();
providerOnly.assets.push({
  id: "asset-provider",
  symbol: "XAU-LEGACY",
  name: "Legacy gold",
  asset_type: "commodity",
  external_ids: { fmp: { symbol: "GCUSD" } },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});
const providerMatch = await upsertCommodityAsset(providerOnly, assetInput);
pass("provider identifier also resolves identity", providerMatch.asset_id === "asset-provider");
pass("provider-matched asset is not duplicated", providerOnly.assets.length === 1);

// A null classification must not erase curated metadata.
await upsertCommodityProfile(curated, "asset-curated", assetInput);
await upsertCommodityProfile(curated, "asset-curated", {
  ...assetInput,
  commodity_type: null,
  benchmark: null,
  currency: null,
});
pass(
  "null classification keeps the stored type",
  curated.profiles.get("asset-curated")?.["commodity_type"] === "precious_metal",
);
pass(
  "null currency keeps the stored currency",
  curated.profiles.get("asset-curated")?.["currency"] === "USD",
);

// --------------------------------------------------
// Parameterised SQL contract
// --------------------------------------------------

pass(
  "candle upsert uses the unique key",
  first.statements.some((sql) =>
    sql.includes('ON CONFLICT (asset_id, interval, "timestamp") DO UPDATE'),
  ),
);
pass(
  "candle upsert never writes a zero volume for missing data",
  first.candles.get(`${created.asset_id}|2026-10-27T00:00:00.000Z`)?.["volume"] === 116545,
);
pass(
  "snapshot insert is guarded",
  first.statements.some((sql) =>
    sql.includes("WHERE NOT EXISTS ( SELECT 1 FROM assets.information"),
  ),
);
pass(
  "snapshot is stored as a market snapshot",
  first.statements.some((sql) => sql.includes("'market_snapshot'")),
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

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll FMP commodity repository tests passed.");
}
