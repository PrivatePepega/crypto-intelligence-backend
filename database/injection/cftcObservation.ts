import type { CftcTffObservation } from "../../types/cftc/ctfc.types.js";

/**
 * Every historical CFTC column is NOT NULL, but the parser runs Number() over
 * raw source cells, so a blank cell yields NaN. Injectors must skip such rows
 * rather than abort the transaction and roll back every prior insert.
 */
export function isCftcObservationComplete(
  observation: CftcTffObservation,
): boolean {
  return [
    observation.openInterest,
    observation.dealer.long,
    observation.dealer.short,
    observation.dealer.spread,
    observation.dealer.net,
    observation.assetManager.long,
    observation.assetManager.short,
    observation.assetManager.spread,
    observation.assetManager.net,
    observation.leveragedMoney.long,
    observation.leveragedMoney.short,
    observation.leveragedMoney.spread,
    observation.leveragedMoney.net,
    observation.otherReportables.long,
    observation.otherReportables.short,
    observation.otherReportables.spread,
    observation.otherReportables.net,
    observation.nonReportables.long,
    observation.nonReportables.short,
    observation.nonReportables.net,
  ].every((value) => Number.isFinite(value));
}
