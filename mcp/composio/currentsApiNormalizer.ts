export type NormalizedCurrentsNews = {
    category: string[];
    description: string;
    title: string;
  };
  
  type RawCurrentsNews = {
    category?: string[];
    description?: string;
    title?: string;
  };
  
  export const normalizeCurrentsNews = (
    articles: RawCurrentsNews[],
  ): NormalizedCurrentsNews[] => {
    return articles.map((article) => ({
      category: article.category ?? [],
      description: article.description ?? "",
      title: article.title ?? "",
    }));
  };