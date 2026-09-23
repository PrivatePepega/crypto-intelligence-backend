import { fetchAaiiSentimentFile } from "../../utils/aaii/fetchAaiiSentiment.js";
import { parseAaiiSentiment } from "../../utils/aaii/parseAaiiSentiment.js";
import { normalizeAaiiSentiment } from "../../utils/aaii/normalizeAaiiSentiment.js";

type AaiiDataMode = "full" | "latest";

export async function getAaiiSentiment(mode: AaiiDataMode) {
  const buffer = await fetchAaiiSentimentFile();

  const rawData = parseAaiiSentiment(buffer);

  const normalizedData = normalizeAaiiSentiment(rawData);

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