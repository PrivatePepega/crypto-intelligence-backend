export type NormalizedNewsflashEvent = {
    id: number;
    title: string;
    summary: string;
    category: string;
    firstSeenAt: string;
    lastSeenAt: string;
    articleCount: number;
    sourceCount: number;
    sources: string[];
    url: string;
    corroboration: number;
    confidence: number;
  };
  
  export type NormalizedNewsflashEvents = {
    count: number;
    events: NormalizedNewsflashEvent[];
    windowFrom: string;
  };
  
  export type NormalizedNewsflashEventArticle = {
    source: string;
    title: string;
    url: string;
    summary: string;
    publishedAt: string;
  };
  
  export type NormalizedNewsflashEventDetail =
    NormalizedNewsflashEvent & {
      articles: NormalizedNewsflashEventArticle[];
    };
  
  export type NormalizedNewsflashArticle = {
    id: number;
    source: string;
    category: string;
    title: string;
    url: string;
    summary: string;
    author: string;
    publishedAt: string;
    eventId: number | null;
  };
  
  export type NormalizedNewsflashArticles = {
    count: number;
    articles: NormalizedNewsflashArticle[];
    windowFrom: string;
  };
  
  export const normalizeNewsflashEvents = (
    result: unknown,
  ): NormalizedNewsflashEvents => {
    const payload = parseNewsflashResponse(result);
  
    const events = Array.isArray(payload.events)
      ? payload.events.map(normalizeEvent)
      : [];
  
    return {
      count: numberValue(payload.count),
      events,
      windowFrom: stringValue(
        objectValue(payload.window).from,
      ),
    };
  };
  
  export const normalizeNewsflashEvent = (
    result: unknown,
  ): NormalizedNewsflashEventDetail => {
    const payload = parseNewsflashResponse(result);
  
    return {
      ...normalizeEvent(payload),
      articles: Array.isArray(payload.articles)
        ? payload.articles.map(normalizeEventArticle)
        : [],
    };
  };
  
  export const normalizeNewsflashArticles = (
    result: unknown,
  ): NormalizedNewsflashArticles => {
    const payload = parseNewsflashResponse(result);
  
    const articles = Array.isArray(payload.articles)
      ? payload.articles.map(normalizeArticle)
      : [];
  
    return {
      count: numberValue(payload.count),
      articles,
      windowFrom: stringValue(
        objectValue(payload.window).from,
      ),
    };
  };
  
  const normalizeEvent = (
    value: unknown,
  ): NormalizedNewsflashEvent => {
    const event = objectValue(value);
  
    return {
      id: numberValue(event.id),
      title: stringValue(event.canonical_title),
      summary: stringValue(event.summary),
      category: stringValue(event.category),
      firstSeenAt: stringValue(event.first_seen_at),
      lastSeenAt: stringValue(event.last_seen_at),
      articleCount: numberValue(event.article_count),
      sourceCount: numberValue(event.source_count),
      sources: stringArrayValue(event.sources),
      url: stringValue(event.url),
      corroboration: numberValue(event.corroboration),
      confidence: numberValue(event.confidence),
    };
  };
  
  const normalizeEventArticle = (
    value: unknown,
  ): NormalizedNewsflashEventArticle => {
    const article = objectValue(value);
  
    return {
      source: stringValue(article.source),
      title: stringValue(article.title),
      url: stringValue(article.url),
      summary: stringValue(article.summary),
      publishedAt: stringValue(article.published_at),
    };
  };
  
  const normalizeArticle = (
    value: unknown,
  ): NormalizedNewsflashArticle => {
    const article = objectValue(value);
  
    return {
      id: numberValue(article.id),
      source: stringValue(article.source),
      category: stringValue(article.category),
      title: stringValue(article.title),
      url: stringValue(article.url),
      summary: stringValue(article.summary),
      author: stringValue(article.author),
      publishedAt: stringValue(article.published_at),
      eventId:
        typeof article.event_id === "number"
          ? article.event_id
          : null,
    };
  };
  
  const parseNewsflashResponse = (
    result: unknown,
  ): Record<string, unknown> => {
    if (typeof result === "string") {
      try {
        return objectValue(JSON.parse(result));
      } catch {
        throw new Error("Newsflash returned invalid JSON.");
      }
    }
  
    if (typeof result !== "object" || result === null) {
      throw new Error("Newsflash returned an invalid response.");
    }
  
    const record = result as Record<string, unknown>;
  
    if (Array.isArray(record.content)) {
      const text = record.content
        .filter(
          (item): item is { type: "text"; text: string } =>
            typeof item === "object" &&
            item !== null &&
            (item as Record<string, unknown>).type === "text" &&
            typeof (item as Record<string, unknown>).text ===
              "string",
        )
        .map((item) => item.text)
        .join("\n");
  
      if (!text) {
        throw new Error(
          "Newsflash returned no text content.",
        );
      }
  
      try {
        return objectValue(JSON.parse(text));
      } catch {
        throw new Error(
          "Newsflash returned invalid JSON content.",
        );
      }
    }
  
    return record;
  };
  
  const objectValue = (
    value: unknown,
  ): Record<string, unknown> => {
    if (typeof value !== "object" || value === null) {
      return {};
    }
  
    return value as Record<string, unknown>;
  };
  
  const stringValue = (value: unknown): string => {
    return typeof value === "string" ? value : "";
  };
  
  const numberValue = (value: unknown): number => {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : 0;
  };
  
  const stringArrayValue = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
  
    return value.filter(
      (item): item is string => typeof item === "string",
    );
  };













  export type NewsflashEventsAIOutput = {
    events: {
      title: string;
      summary: string;
      category: string;
    }[];
  };
  
  export type NewsflashEventAIOutput = {
    title: string;
    summary: string;
    category: string;
  };
  
  export type NewsflashArticlesAIOutput = {
    articles: {
      title: string;
      summary: string;
    }[];
  };
  
  export const normalizeNewsflashEventsForAI = (
    result: NormalizedNewsflashEvents,
  ): NewsflashEventsAIOutput => {
    return {
      events: result.events.map((event) => ({
        title: event.title,
        summary: event.summary,
        category: event.category,
      })),
    };
  };
  
  export const normalizeNewsflashEventForAI = (
    result: NormalizedNewsflashEventDetail,
  ): NewsflashEventAIOutput => {
    return {
      title: result.title,
      summary: result.summary,
      category: result.category,
    };
  };
  
  export const normalizeNewsflashArticlesForAI = (
    result: NormalizedNewsflashArticles,
  ): NewsflashArticlesAIOutput => {
    return {
      articles: result.articles.map((article) => ({
        title: article.title,
        summary: article.summary,
      })),
    };
  };