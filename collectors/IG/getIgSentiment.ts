import { fetchIGSentiment } from "./sentimentFetcher.js";

export type IgSentimentDataMode = "full" | "latest";

export async function getIgSentiment(mode: IgSentimentDataMode) {
  const data = await fetchIGSentiment();

  if (data.length === 0) {
    throw new Error("No IG sentiment observations returned");
  }

  if (mode === "full") {
    return { data };
  }

  const grouped = Object.groupBy(data, (observation) => observation.asset);

  const latest = Object.values(grouped).flatMap(
    (observations) => observations?.slice(0, 3) ?? [],
  );

  return { data: latest };
}
