import { fetchCftcTff } from "../../utils/CFTC/cftcFetcher.js";
import { parseCftcTff } from "../../utils/CFTC/cftcParser.js";


type CftcDataMode = "full" | "latest";

export async function getCftcTff(mode: CftcDataMode) {
  const rawData = await fetchCftcTff();
  const normalizedData = parseCftcTff(rawData);

  if (mode === "full") {
    return {
      indicator: "cftc_tff",
      observations: normalizedData,
      historical: null,
    };
  }

  const grouped = Object.groupBy(
    normalizedData,
    (observation) => observation.contract,
  );
  
  const observations = Object.values(grouped)
    .flatMap((contractObservations) => contractObservations?.slice(0, 3) ?? []);
  
  const historical = Object.values(grouped)
    .flatMap((contractObservations) => contractObservations?.slice(0, 1) ?? []);
  
  return {
    indicator: "cftc_tff",
    observations,
    historical,
  };
}