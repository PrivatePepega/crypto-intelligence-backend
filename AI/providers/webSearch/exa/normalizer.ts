type ExaSearchResult = {
  title: string | null;

  /** The page's address. Exa returns this on every result; it was never copied out. */
  url?: string;

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
    .replace(/\\\//g, "/")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\.\.\./g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// --------------------------------------------------
// Exa normalizer
// --------------------------------------------------

export const normalizeExaResults = (response: ExaSearchResponse) => {
  return {
    results: response.results.map((result) => ({
      title: cleanText(result.title ?? ""),
      highlights: (result.highlights ?? []).map(cleanText),

      // Not passed through `cleanText`, which collapses whitespace and would rewrite a
      // perfectly good address into a broken one.
      url: result.url ?? null,
    })),
  };
};
