export type NormalizedGdeltEvent = {
  id: string | null;
  family: string | null;
  title: string | null;
  summary: string | null;
  category: string | null;
  region: string | null;
  significance: number | null;
};

type RawGdeltEvent = {
  id?: string | null;
  family?: string | null;
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  geo?: {
    region?: string | null;
  } | null;
  metrics?: {
    significance?: number | null;
  } | null;
};

export const normalizeGdeltEvent = (
  rawResponse: unknown,
): NormalizedGdeltEvent => {
  const response = rawResponse as {
    response?: {
      _gdelt?: {
        payload?: {
          data?: RawGdeltEvent;
        };
      };
    };
  };

  const data = response.response?._gdelt?.payload?.data;

  if (!data) {
    throw new Error("GDELT event data not found in raw response.");
  }

  return {
    id: data.id ?? null,
    family: data.family ?? null,
    title: data.title ?? null,
    summary: data.summary ?? null,
    category: data.category ?? null,
    region: data.geo?.region ?? null,
    significance: data.metrics?.significance ?? null,
  };
};