type YouSearchResult = {
  title?: string;
  description?: string;
  snippets?: string[];
};

type YouSearchResponse = {
  results?: {
    web?: YouSearchResult[];
  };
};

// --------------------------------------------------
// Text cleanup
// --------------------------------------------------

const cleanText = (text: string) => {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// --------------------------------------------------
// You.com normalizer
// --------------------------------------------------

export const normalizeYouResults = (
  response: YouSearchResponse,
) => {
  return {
    results: (response.results?.web ?? []).map(
      ({ title, description, snippets }) => ({
        title: cleanText(title ?? ""),
        description: cleanText(description ?? ""),
        snippets: (snippets ?? []).map(cleanText),
      }),
    ),
  };
};
