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

/** Normalized entity returned to MCP clients. */
export interface NewsEntity {
  name?: string | undefined;
  sentimentScore?: number | undefined;
}

export interface NewsArticle {
  title: string;
  description?: string | undefined;
  snippet?: string | undefined;
  /**
   * Entities Marketaux identified, with sentiment scores.
   *
   * Still produced by the `marketaux_news_search` MCP tool for any client that
   * wants them. The AI-facing path strips this in
   * `mcp/marketaux/newsSearch.normalizer.ts` - it is not removed at the source.
   */
  entities: NewsEntity[];
}

export interface NewsSearchResult {
  articles: NewsArticle[];
}
