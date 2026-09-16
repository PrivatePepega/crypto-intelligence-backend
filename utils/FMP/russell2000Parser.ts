import type { FmpRussell2000RawObservation } from "../../types/FMP/FMP.types.js";

export function parseRussell2000(
  data: FmpRussell2000RawObservation[],
) {
  return data.map((observation) => ({
    symbol: observation.symbol,
    date: observation.date.slice(0, 10),
    open: Number(observation.open),
    close: Number(observation.close),
    change: Number(observation.change),
    changePercent: Number(observation.changePercent),
  }));
}