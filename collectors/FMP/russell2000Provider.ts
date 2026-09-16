import { fetchRussell2000History } from "../../utils/FMP/russell2000Fetcher.js";
import { normalizeRussell2000 } from "../../utils/FMP/russell2000Normalizer.js";
import { parseRussell2000 } from "../../utils/FMP/russell2000Parser.js";

export type Russell2000DataMode = "full" | "latest";

export async function getRussell2000(
  mode: Russell2000DataMode,
) {
  const rawData = await fetchRussell2000History();

  const parsedData = parseRussell2000(rawData);

  const normalizedData = normalizeRussell2000(parsedData);

  if (mode === "full") {
    return {
      ...normalizedData,
      historical: null,
    };
  }

  return {
    ...normalizedData,
    observations: normalizedData.observations.slice(-3),
    historical: normalizedData.observations.at(-1) ?? null,
  };
}