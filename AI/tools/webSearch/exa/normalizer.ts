type ExaSearchResult = {
    title: string | null;
    highlights?: string[];
  };
  
  type ExaSearchResponse = {
    results: ExaSearchResult[];
  };
  
  export const normalizeExaResults = (
    response: ExaSearchResponse,
  ) => {
    return {
      results: response.results.map((result) => ({
        title: result.title ?? "",
        highlights: result.highlights ?? [],
      })),
    };
  };