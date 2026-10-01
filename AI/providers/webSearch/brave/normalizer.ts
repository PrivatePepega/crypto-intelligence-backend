type BraveSearchResult = {
    title?: string;
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
  
  const cleanText = (text: string) => {
    return text
      .replace(/#{1,6}\s*/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  
  export const normalizeBraveResults = (
    response: BraveSearchResponse,
  ) => {
    return {
      results: (response.web?.results ?? []).map(
        (result) => ({
          title: cleanText(result.title ?? ""),
          description: cleanText(
            result.description ?? "",
          ),
          extraSnippets: (
            result.extra_snippets ?? []
          ).map(cleanText),
        }),
      ),
  
      faq: (response.faq?.results ?? []).map(
        (result) => ({
          question: cleanText(
            result.question ?? "",
          ),
          answer: cleanText(
            result.answer ?? "",
          ),
          title: cleanText(result.title ?? ""),
        }),
      ),
    };
  };