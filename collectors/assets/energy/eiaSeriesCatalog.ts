import type { EiaSeriesDefinition } from "../../../types/EIA/eia.types.js";

/**
 * Verified EIA series catalog.
 *
 * Every entry was confirmed live on 2026-10-27 against
 * `https://api.eia.gov/v2/` by both the route's `facet/series/` listing and a
 * real data request. Nothing here is inferred from documentation alone.
 *
 * Two rules are encoded in this file:
 *
 *   1. `frequency` is **pinned**. EIA treats the `frequency` parameter as an
 *      aggregation control, not a filter: requesting the daily `RWTC` series at
 *      `weekly` returns weekly averages with HTTP 200 and no error. A collector
 *      that lets frequency float would silently mix daily and weekly values.
 *   2. `unit` is **pinned**. Units are not comparable across these series
 *      (`$/BBL`, `MBBL`, `MBBL/D`, `%`, `BCF`, `MMCF`). A provider unit that no
 *      longer matches the catalog is treated as a data-integrity failure, never
 *      converted or silently accepted.
 *
 * Price series are attached to a benchmark asset. Supply/demand series are
 * market-wide statistics and are stored as `macro_context` without an asset,
 * because claiming they "belong" to one benchmark contract would be an
 * editorial assertion the provider never made.
 */
export const EIA_SERIES: EiaSeriesDefinition[] = [
  {
    series_id: "RWTC",
    route: "petroleum/pri/spt",
    frequency: "daily",
    unit: "$/BBL",
    title: "Cushing, OK WTI Spot Price FOB (Dollars per Barrel)",
    category: "crude_price_spot",
    kind: "price",
    asset_symbol: "RWTC",
  },
  {
    series_id: "RBRTE",
    route: "petroleum/pri/spt",
    frequency: "daily",
    unit: "$/BBL",
    title: "Europe Brent Spot Price FOB (Dollars per Barrel)",
    category: "crude_price_spot",
    kind: "price",
    asset_symbol: "RBRTE",
  },
  {
    series_id: "WCESTUS1",
    route: "petroleum/stoc/wstk",
    frequency: "weekly",
    unit: "MBBL",
    title: "U.S. Ending Stocks excluding SPR of Crude Oil (Thousand Barrels)",
    category: "crude_inventory",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "WCRFPUS2",
    route: "petroleum/sum/sndw",
    frequency: "weekly",
    unit: "MBBL/D",
    title: "U.S. Field Production of Crude Oil (Thousand Barrels per Day)",
    category: "crude_production",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "MCRFPUS2",
    route: "petroleum/crd/crpdn",
    frequency: "monthly",
    unit: "MBBL/D",
    title: "U.S. Field Production of Crude Oil (Thousand Barrels per Day)",
    category: "crude_production",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "MCRIMUS2",
    route: "petroleum/move/imp",
    frequency: "monthly",
    unit: "MBBL/D",
    title: "U.S. Imports of Crude Oil (Thousand Barrels per Day)",
    category: "crude_imports",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "MCREXUS2",
    route: "petroleum/move/exp",
    frequency: "monthly",
    unit: "MBBL/D",
    title: "U.S. Exports of Crude Oil (Thousand Barrels per Day)",
    category: "crude_exports",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "WPULEUS3",
    route: "petroleum/pnp/wiup",
    frequency: "weekly",
    unit: "%",
    title: "U.S. Percent Utilization of Refinery Operable Capacity",
    category: "refinery_utilization",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "WGFUPUS2",
    route: "petroleum/sum/sndw",
    frequency: "weekly",
    unit: "MBBL/D",
    title: "U.S. Product Supplied of Finished Motor Gasoline (Thousand Barrels per Day)",
    category: "product_supplied",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "WDIUPUS2",
    route: "petroleum/sum/sndw",
    frequency: "weekly",
    unit: "MBBL/D",
    title: "U.S. Product Supplied of Distillate Fuel Oil (Thousand Barrels per Day)",
    category: "product_supplied",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "NW2_EPG0_SWO_R48_BCF",
    route: "natural-gas/stor/wkly",
    frequency: "weekly",
    unit: "BCF",
    title: "Weekly Lower 48 States Natural Gas Working Underground Storage (Billion Cubic Feet)",
    category: "gas_storage",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "N9070US2",
    route: "natural-gas/prod/sum",
    frequency: "monthly",
    unit: "MMCF",
    title: "U.S. Dry Natural Gas Production (MMcf)",
    category: "gas_production",
    kind: "fundamental",
    asset_symbol: null,
  },
  {
    series_id: "N9140US2",
    route: "natural-gas/cons/sum",
    frequency: "monthly",
    unit: "MMCF",
    title: "U.S. Natural Gas Total Consumption (MMcf)",
    category: "gas_consumption",
    kind: "fundamental",
    asset_symbol: null,
  },
];

const BY_SERIES_ID = new Map(EIA_SERIES.map((entry) => [entry.series_id, entry]));

/** Looks up a catalog entry, case-sensitively (EIA ids are uppercase). */
export function findEiaSeries(seriesId: string): EiaSeriesDefinition | null {
  return BY_SERIES_ID.get(seriesId.trim()) ?? null;
}

/** Default collection targets: every verified series in the catalog. */
export const DEFAULT_EIA_SERIES_IDS = EIA_SERIES.map((entry) => entry.series_id);

/**
 * Asset identity for a price series.
 *
 * `symbol` is the EIA series id rather than an invented ticker such as `WTI` or
 * `XAU`, for the same reason the FMP collector stores provider symbols: mapping
 * a provider series onto a canonical ticker asserts an equivalence the provider
 * never stated.
 *
 * EIA `RBRTE` is the Europe Brent **spot** assessment. It is deliberately a
 * separate asset from `BZUSD`, which is FMP's Brent **futures** contract. The two
 * differ in price on the same day and are not interchangeable.
 */
export interface EnergyAssetDefinition {
  symbol: string;
  name: string;
  commodity_type: string;
  benchmark: string;
  currency: string;
  unit_of_measure: string;
  value_drivers: Record<string, unknown> | null;
}

const WTI_ASSET: EnergyAssetDefinition = {
  symbol: "RWTC",
  name: "WTI Crude Oil Spot (Cushing, OK)",
  commodity_type: "energy",
  benchmark: "WTI",
  currency: "USD",
  // Label expansion of the provider's `$/BBL` token, not a conversion.
  unit_of_measure: "USD per barrel",
  value_drivers: {
    provenance: "collector-curated",
    note: "EIA series that describe the same U.S. crude oil market. This is taxonomy, not a causal claim.",
    related_eia_series: [
      "WCESTUS1",
      "WCRFPUS2",
      "MCRFPUS2",
      "MCRIMUS2",
      "MCREXUS2",
      "WPULEUS3",
      "WGFUPUS2",
      "WDIUPUS2",
    ],
  },
};

const BRENT_ASSET: EnergyAssetDefinition = {
  symbol: "RBRTE",
  name: "Brent Crude Oil Spot (Europe FOB)",
  commodity_type: "energy",
  benchmark: "Brent",
  currency: "USD",
  unit_of_measure: "USD per barrel",
  // EIA's U.S. crude statistics describe the domestic market, not the
  // waterborne Brent benchmark, so no related-series links are claimed.
  value_drivers: null,
};

const ASSET_BY_SYMBOL = new Map<string, EnergyAssetDefinition>([
  [WTI_ASSET.symbol, WTI_ASSET],
  [BRENT_ASSET.symbol, BRENT_ASSET],
]);

/** Asset definition attached to a price series, or null for fundamentals. */
export function findEnergyAsset(symbol: string): EnergyAssetDefinition | null {
  return ASSET_BY_SYMBOL.get(symbol.trim()) ?? null;
}

/** Asset definitions for every price series in the catalog. */
export const ENERGY_ASSETS: EnergyAssetDefinition[] = [WTI_ASSET, BRENT_ASSET];
