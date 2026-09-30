/**
 * Wire types for the Marketaux REST API, plus the camelCased shape this
 * server hands to MCP clients.
 *
 * See https://www.marketaux.com/documentation
 */

/** Query parameters accepted by `GET /v1/news/all`. */
export interface NewsAllQuery {
  symbols?: string;
  entity_types?: string;
  industries?: string;
  countries?: string;
  language?: string;
  search?: string;
  domains?: string;
  exclude_domains?: string;
  source_ids?: string;
  exclude_source_ids?: string;
  sentiment_gte?: number;
  sentiment_lte?: number;
  min_match_score?: number;
  filter_entities?: boolean;
  must_have_entities?: boolean;
  group_similar?: boolean;
  published_before?: string;
  published_after?: string;
  published_on?: string;
  sort?: string;
  sort_order?: string;
  limit?: number;
  page?: number;
}

/** Raw `meta` block returned by the search endpoints. */
export interface RawNewsMeta {
  found: number;
  returned: number;
  limit: number;
  page: number;
}

/** Raw entity record. Every field but `highlights` may be null upstream. */
export interface RawEntity {
  symbol: string | null;
  name: string | null;
  exchange: string | null;
  exchange_long: string | null;
  country: string | null;
  type: string | null;
  industry: string | null;
  match_score: number | null;
  sentiment_score: number | null;
  highlights?: RawHighlight[] | null;
}

export interface RawHighlight {
  highlight: string;
  sentiment: number | null;
  highlighted_in: string | null;
}

/** Raw article record. */
export interface RawArticle {
  uuid: string;
  title: string;
  description: string | null;
  keywords: string | null;
  snippet: string | null;
  url: string;
  image_url: string | null;
  language: string | null;
  published_at: string;
  source: string | null;
  relevance_score: number | null;
  entities?: RawEntity[] | null;
  similar?: unknown[] | null;
}

export interface RawNewsPage {
  meta: RawNewsMeta;
  data: RawArticle[] | null;
}

/**
 * Normalised entity. Absent rather than null, so the model never has to
 * distinguish "missing" from "explicitly empty" and the output schema stays
 * a plain `optional` field.
 */
export interface NewsEntity {
  // `| undefined` is explicit because this repo compiles with
  // exactOptionalPropertyTypes, and the shapers in SearchAllNewsTool assign
  // `?? undefined` rather than leaving the key out entirely.
  symbol?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  industry?: string | undefined;
  country?: string | undefined;
  exchange?: string | undefined;
  matchScore?: number | undefined;
  sentimentScore?: number | undefined;
  /** Only present when the caller opted in via `includeHighlights`. */
  highlights?: EntityHighlight[] | undefined;
}

export interface EntityHighlight {
  text: string;
  sentiment?: number | undefined;
  locatedIn?: string | undefined;
}

export interface NewsArticle {
  uuid: string;
  title: string;
  url: string;
  publishedAt: string;
  source?: string | undefined;
  language?: string | undefined;
  description?: string | undefined;
  snippet?: string | undefined;
  imageUrl?: string | undefined;
  relevanceScore?: number | undefined;
  entities: NewsEntity[];
}

export interface NewsSearchResult {
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
    /** True when `returned < limit`, i.e. this is the last page. */
    hasMore: boolean;
  };
  articles: NewsArticle[];
}
