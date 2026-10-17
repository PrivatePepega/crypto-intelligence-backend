type YouSearchResult = {
  title?: string;

  /**
   * The page's address.
   *
   * You returns this under `url`. It was not copied out, which is why `favicon_url`
   * - also present, also full of the domain - was the only place the domain survived.
   */
  url?: string;

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

export const normalizeYouResults = (response: YouSearchResponse) => {
  return {
    results: (response.results?.web ?? []).map(({ title, url, description, snippets }) => ({
      title: cleanText(title ?? ""),
      description: cleanText(description ?? ""),
      snippets: (snippets ?? []).map(cleanText),

      // Not run through `cleanText`: that collapses whitespace, which is fine for
      // prose and wrong for an address.
      url: url ?? null,
    })),
  };
};
