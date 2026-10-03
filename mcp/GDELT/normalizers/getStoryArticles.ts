export type NormalizedGdeltStoryArticle = {
    id: string | null;
    title: string | null;
  };
  
  type RawGdeltStoryArticle = {
    id?: string | null;
    title?: string | null;
  };
  
  export const normalizeGdeltStoryArticles = (
    articles: RawGdeltStoryArticle[],
  ): NormalizedGdeltStoryArticle[] => {
    return articles.map((article) => ({
      id: article.id ?? null,
      title: article.title ?? null,
    }));
  };