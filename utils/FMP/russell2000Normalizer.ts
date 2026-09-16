import { parseRussell2000 } from "./russell2000Parser.js";

export function normalizeRussell2000(
    data: ReturnType<typeof parseRussell2000>,
  ) {
    const observations = [...data].sort(
      (a, b) => a.date.localeCompare(b.date),
    );
  
    return {
      indicator: "russell_2000",
      symbol: "^RUT",
      frequency: "Daily",
      aggregation: "none",
      unit: "index_points",
      observations,
      historical: observations.at(-1) ?? null,
    };
  }

