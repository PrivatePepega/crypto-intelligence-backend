import "dotenv/config";

/**
 * Curated reference data for the commodity contracts this collector targets.
 *
 * Provenance, stated once here and repeated in `docs/FMP_COMMODITIES.md`:
 *
 *   - `fmp_symbol` values are verified against `GET /commodities-list`. They are
 *     never guessed. `ALIUSD` is aluminum despite the unusual spelling; there is
 *     no `ALUUSD` in the provider list.
 *   - `display_name` is close to the provider's own `name` and is only used when
 *     the provider omits a name.
 *   - `commodity_type` and `benchmark` are collector-curated classification, not
 *     provider claims. They are stable taxonomy, not price data, and are stored
 *     in `assets.commodities` with `unit_of_measure` deliberately left NULL
 *     because FMP does not document contract size or units.
 *
 * Symbols outside this table are still ingestible: they keep provider identity
 * and receive NULL classification rather than an invented type.
 */

export interface CommodityReference {
  fmp_symbol: string;
  display_name: string;
  commodity_type: string | null;
  benchmark: string | null;
}

const REFERENCES: CommodityReference[] = [
  {
    fmp_symbol: "GCUSD",
    display_name: "Gold Futures",
    commodity_type: "precious_metal",
    benchmark: "COMEX gold",
  },
  {
    fmp_symbol: "SIUSD",
    display_name: "Silver Futures",
    commodity_type: "precious_metal",
    benchmark: "COMEX silver",
  },
  {
    // FMP labels CLUSD "Crude Oil"; it is the front-month WTI contract.
    fmp_symbol: "CLUSD",
    display_name: "Crude Oil (WTI)",
    commodity_type: "energy",
    benchmark: "WTI",
  },
  {
    fmp_symbol: "BZUSD",
    display_name: "Brent Crude Oil",
    commodity_type: "energy",
    benchmark: "Brent",
  },
  {
    fmp_symbol: "NGUSD",
    display_name: "Natural Gas",
    commodity_type: "energy",
    benchmark: "Henry Hub",
  },
  {
    fmp_symbol: "HGUSD",
    display_name: "Copper",
    commodity_type: "base_metal",
    benchmark: "COMEX copper",
  },
  {
    fmp_symbol: "ALIUSD",
    display_name: "Aluminum",
    commodity_type: "base_metal",
    benchmark: "Aluminum",
  },
  {
    fmp_symbol: "PLUSD",
    display_name: "Platinum",
    commodity_type: "precious_metal",
    benchmark: "NYMEX platinum",
  },
  {
    fmp_symbol: "PAUSD",
    display_name: "Palladium",
    commodity_type: "precious_metal",
    benchmark: "NYMEX palladium",
  },
  {
    fmp_symbol: "MGCUSD",
    display_name: "Micro Gold Futures",
    commodity_type: "precious_metal",
    benchmark: null,
  },
  {
    fmp_symbol: "SILUSD",
    display_name: "Micro Silver Futures",
    commodity_type: "precious_metal",
    benchmark: null,
  },
  {
    // Listed under /commodities-list by the provider, but an equity index future
    // rather than a physical commodity. Kept distinct so it is never aggregated
    // with physical supply/demand metrics.
    fmp_symbol: "ESUSD",
    display_name: "E-Mini S&P 500",
    commodity_type: "equity_index_future",
    benchmark: "S&P 500",
  },
];

const REFERENCE_BY_SYMBOL = new Map(
  REFERENCES.map((reference) => [reference.fmp_symbol.toUpperCase(), reference]),
);

/** Curated classification for a provider symbol, or null when unknown. */
export function findCommodityReference(symbol: string): CommodityReference | null {
  return REFERENCE_BY_SYMBOL.get(symbol.trim().toUpperCase()) ?? null;
}

/**
 * Default collection targets: the commodities named in the task.
 *
 * All seven symbols are verified to exist in `/commodities-list`. Whether the
 * current plan can actually return data for them is a separate question decided
 * at request time; the account in use only had access to GCUSD, SIUSD, BZUSD and
 * ESUSD on 2026-10-27 (see `docs/FMP_COMMODITIES.md`).
 */
export const DEFAULT_COMMODITY_SYMBOLS = [
  "GCUSD",
  "SIUSD",
  "CLUSD",
  "BZUSD",
  "NGUSD",
  "HGUSD",
  "ALIUSD",
] as const;

/** The first vertical slice target. Wired, but plan-restricted on this account. */
export const WTI_SYMBOL = "CLUSD";
