type ExaSearchResult = {
  title: string | null;
  highlights?: string[];
};

type ExaSearchResponse = {
  results: ExaSearchResult[];
};

// --------------------------------------------------
// Text cleanup
// --------------------------------------------------

const cleanText = (text: string) => {
  return text
    // Remove escaped forward slashes.
    .replace(/\\\//g, "/")

    // Remove Markdown heading markers.
    .replace(/^#{1,6}\s*/gm, "")

    // Remove Exa truncation markers.
    .replace(/\.\.\./g, "")

    // Convert newlines into spaces.
    .replace(/\r?\n/g, " ")

    // Normalize repeated whitespace.
    .replace(/\s+/g, " ")

    .trim();
};

// --------------------------------------------------
// Exa normalizer
// --------------------------------------------------

export const normalizeExaResults = (
  response: ExaSearchResponse,
  
) => {
  return {
    results: response.results.map((result) => ({
      title: cleanText(result.title ?? ""),
      highlights: (result.highlights ?? []).map(cleanText),
    })),
  };
};