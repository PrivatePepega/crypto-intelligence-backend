type TavilySearchResult = {
  title: string;
  content: string;
};

type TavilySearchResponse = {
  results: TavilySearchResult[];
};

// --------------------------------------------------
// Text cleanup
// --------------------------------------------------

const cleanText = (text: string) => {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// --------------------------------------------------
// Tavily normalizer
// --------------------------------------------------

export const normalizeTavilyResults = (
  response: TavilySearchResponse,
) => {
  return {
    results: response.results.map((result) => ({
      title: cleanText(result.title),
      content: cleanText(result.content),
    })),
  };
};
