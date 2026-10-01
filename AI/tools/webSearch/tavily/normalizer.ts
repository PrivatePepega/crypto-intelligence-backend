type TavilySearchResult = {
    title: string;
    content: string;
  };
  
  type TavilySearchResponse = {
    results: TavilySearchResult[];
  };
  
  export const normalizeTavilyResults = (
    response: TavilySearchResponse,
  ) => {
    return {
      results: response.results.map((result) => ({
        title: result.title,
        content: result.content
          .replace(/\s+/g, " ")
          .trim(),
      })),
    };
  };