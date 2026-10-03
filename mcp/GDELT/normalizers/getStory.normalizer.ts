export type NormalizedGdeltStory = {
    id: string | null;
    title: string | null;
    category: string | null;
    region: string | null;
  };
  
  type RawGdeltStory = {
    id?: string | null;
    title?: string | null;
    category?: string | null;
  
    geo?: {
      region?: string | null;
    } | null;
  };
  
  export const normalizeGdeltStory = (
    rawResponse: unknown,
  ): NormalizedGdeltStory => {
    const response = rawResponse as {
      response?: {
        _gdelt?: {
          payload?: {
            data?: RawGdeltStory;
          };
        };
      };
    };
  
    const data = response.response?._gdelt?.payload?.data;
  
    if (!data) {
      throw new Error("GDELT story data not found in raw response.");
    }
  
    return {
      id: data.id ?? null,
      title: data.title ?? null,
      category: data.category ?? null,
      region: data.geo?.region ?? null,
    };
  };