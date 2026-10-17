type BraveSearchResult = {
  title?: string;

  /**
   * The page's address.
   *
   * Brave has always returned this; it was simply never copied out. Every result the
   * pipeline used to hand an agent had no address at all, which left nothing to cite.
   */
  url?: string;

  description?: string;
  extra_snippets?: string[];
};

type BraveFaqResult = {
  question?: string;
  answer?: string;
  title?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };

  faq?: {
    results?: BraveFaqResult[];
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
// Brave normalizer
// --------------------------------------------------

export const normalizeBraveResults = (response: BraveSearchResponse) => {
  return {
    results: (response.web?.results ?? []).map((result) => ({
      title: cleanText(result.title ?? ""),
      description: cleanText(result.description ?? ""),
      extraSnippets: (result.extra_snippets ?? []).map(cleanText),

      // Left as the provider returned it rather than run through `cleanText`: a URL
      // that has been whitespace-normalised is no longer reliably the address it was.
      url: result.url ?? null,
    })),

    faq: (response.faq?.results ?? []).map((result) => ({
      question: cleanText(result.question ?? ""),
      answer: cleanText(result.answer ?? ""),
      title: cleanText(result.title ?? ""),
    })),
  };
};
