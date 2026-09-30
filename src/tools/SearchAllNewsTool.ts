import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { MarketauxApiError, type MarketauxClient } from '../marketaux/client.js';
import type {
  NewsArticle,
  NewsEntity,
  NewsSearchResult,
  RawArticle,
  RawEntity,
  RawHighlight,
} from '../marketaux/types.js';

/** API accepts Y, Y-m, Y-m-d, and each with an optional T[H[:i[:s]]] suffix. */
const PARTIAL_DATE =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/;

/** `published_on` is the one parameter the API only accepts in full Y-m-d. */
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * List parameters are comma-separated on the wire. Models produce either form
 * depending on the prompt, so both are accepted and `toCsv` normalises them.
 */
const csvParam = (description: string) =>
  z.union([z.string(), z.array(z.string())]).describe(description);

/**
 * The parameters the API expects as comma-separated lists. Both string and
 * array input are split, trimmed and rejoined, so `" TSLA , AMZN "` and
 * `['TSLA', 'AMZN']` produce identical requests.
 */
const LIST_PARAMS = new Set([
  'symbols',
  'entity_types',
  'industries',
  'countries',
  'language',
  'domains',
  'exclude_domains',
  'source_ids',
  'exclude_source_ids',
]);

export const newsSearchInputSchema = z.object({
  // --- Entity filters -------------------------------------------------
  symbols: csvParam(
    "Entity symbols identified in the article, e.g. 'TSLA,AMZN' or ['TSLA','AMZN']."
  ).optional(),
  entity_types: csvParam(
    "Types of entity to match, e.g. 'equity,index'. See the Marketaux entity types endpoint for the full list."
  ).optional(),
  industries: csvParam(
    "Industries of the entities identified in the article, e.g. 'Technology,Industrials'."
  ).optional(),
  countries: csvParam(
    "Two-letter country of the exchange the entity is listed in, e.g. 'us,ca'."
  ).optional(),

  // --- Free-text search ----------------------------------------------
  search: z
    .string()
    .describe(
      'Free-text query over article titles and bodies. Supports + (AND), | (OR), -token (NOT), "phrase", prefix*, and ( ) for precedence.'
    )
    .optional(),

  // --- Source filters -------------------------------------------------
  language: csvParam("Two-letter language codes, e.g. 'en,es'. Defaults to all.").optional(),
  domains: csvParam("Restrict to these publisher domains, e.g. 'reuters.com'.").optional(),
  exclude_domains: csvParam("Exclude these publisher domains.").optional(),
  source_ids: csvParam(
    "Restrict to Marketaux source ids, e.g. 'reuters.com-1'."
  ).optional(),
  exclude_source_ids: csvParam("Exclude these Marketaux source ids.").optional(),

  // --- Sentiment and match scoring -----------------------------------
  sentiment_gte: z
    .number()
    .min(-1)
    .max(1)
    .describe(
      "Only articles whose entities score at or above this sentiment, from -1 (negative) to 1 (positive). Use 0 for neutral-or-better."
    )
    .optional(),
  sentiment_lte: z
    .number()
    .min(-1)
    .max(1)
    .describe(
      "Only articles whose entities score at or below this sentiment, from -1 to 1. Use 0 for neutral-or-worse."
    )
    .optional(),
  min_match_score: z
    .number()
    .describe('Only entities matching the query at or above this score.')
    .optional(),

  // --- Result shaping flags -------------------------------------------
  filter_entities: z
    .boolean()
    .describe(
      'When true, return only the entities that matched the query instead of every entity found in the article.'
    )
    .optional(),
  must_have_entities: z
    .boolean()
    .describe('When true, drop articles in which no entity was identified.')
    .optional(),
  group_similar: z
    .boolean()
    .describe('When true (the API default), collapse duplicate coverage of one story.')
    .optional(),

  // --- Date range -----------------------------------------------------
  published_after: z
    .string()
    .regex(PARTIAL_DATE, 'Use YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DDThh:mm[:ss]')
    .describe('Published after this date. Partial dates widen the range.')
    .optional(),
  published_before: z
    .string()
    .regex(PARTIAL_DATE, 'Use YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DDThh:mm[:ss]')
    .describe('Published before this date. Partial dates widen the range.')
    .optional(),
  published_on: z
    .string()
    .regex(FULL_DATE, 'Use YYYY-MM-DD')
    .describe('Published on exactly this calendar day (UTC).')
    .optional(),

  // --- Ordering and pagination ---------------------------------------
  sort: z
    .enum([
      'published_at',
      'published_on',
      'entity_match_score',
      'entity_sentiment_score',
      'relevance_score',
    ])
    .describe(
      'Sort field. Defaults to published_at, or relevance_score when searching without an explicit published_at sort.'
    )
    .optional(),
  sort_order: z
    .enum(['asc', 'desc'])
    .describe(
      'Sort direction. The API only honours this for entity_match_score and entity_sentiment_score; anything else stays desc.'
    )
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe(
      'Articles per page. Defaults to 3. Your plan caps this: 3 on free, 20 basic, 50 standard, 100 pro.'
    )
    .optional(),
  page: z
    .number()
    .int()
    .min(1)
    .describe(
      'Page number, 1-based. The API will not page past 20,000 articles, so page * limit must stay at or under that.'
    )
    .optional(),

  /**
   * Local only — never sent upstream. Entity highlight snippets are the bulk
   * of the response payload, so they are opt-in.
   */
  include_highlights: z
    .boolean()
    .describe(
      'Include the matched text snippets for each entity. Off by default: they roughly double the response size.'
    )
    .optional(),
});

const entityOutputSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  exchange: z.string().optional(),
  matchScore: z.number().optional(),
  sentimentScore: z.number().optional(),
  highlights: z
    .array(
      z.object({
        text: z.string(),
        sentiment: z.number().optional(),
        locatedIn: z.string().optional(),
      })
    )
    .optional(),
});

const articleOutputSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string(),
  source: z.string().optional(),
  language: z.string().optional(),
  description: z.string().optional(),
  snippet: z.string().optional(),
  imageUrl: z.string().optional(),
  relevanceScore: z.number().optional(),
  entities: z.array(entityOutputSchema),
});

export const newsSearchOutputSchema = z.object({
  meta: z.object({
    found: z.number(),
    returned: z.number(),
    limit: z.number(),
    page: z.number(),
    hasMore: z.boolean(),
  }),
  articles: z.array(articleOutputSchema),
});

const TOOL_DESCRIPTION =
  'Search global financial and market news through the Marketaux API. Filter by stock symbol, entity type, industry, country, language, publisher, date range and sentiment, then page through the results. Each article comes back with the entities Marketaux identified in it, with match and sentiment scores, so it suits market research, investment analysis and tracking specific companies or sectors.';

/**
 * Exposes `GET /v1/news/all` as the `market_aux_news_search` MCP tool.
 *
 * Results are returned twice: as `structuredContent` matching
 * {@link newsSearchOutputSchema} for clients that want typed data, and as a
 * compact text digest for the model to read directly.
 */
export class SearchAllNewsTool {
  constructor(private readonly client: MarketauxClient) {}

  /**
   * @param toolName Override for the registered tool name. Defaults to the
   *   original upstream name; the backend passes a namespaced name
   *   (`marketaux_news_search`) so tools stay unique as more providers are
   *   added to the same server.
   */
  public register(
    server: McpServer,
    toolName: string = 'market_aux_news_search',
  ): void {
    server.registerTool(
      toolName,
      {
        title: 'Search Marketaux financial news',
        description: TOOL_DESCRIPTION,
        inputSchema: newsSearchInputSchema,
        outputSchema: newsSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          // Results come from the live web, not a closed corpus.
          openWorldHint: true,
        },
      },
      async (input, ctx) => {
        const {
          include_highlights: includeHighlights = false,
          limit = 3,
          page = 1,
          ...rest
        } = input;

        const query = { ...rest, limit, page };
        const page_ = await this.client.searchAllNews(
          toQuery(query),
          ctx.mcpReq.signal
        );

        const result = shapeResult(page_, includeHighlights);

        return {
          content: [{ type: 'text' as const, text: formatDigest(result) }],
          structuredContent: result,
        };
      }
    );
  }
}

/** Maps tool input onto the API's query parameters. */
function toQuery(
  input: Omit<z.infer<typeof newsSearchInputSchema>, 'include_highlights'>
): Parameters<MarketauxClient['searchAllNews']>[0] {
  const query: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;

    if (LIST_PARAMS.has(key)) {
      const csv = toCsv(value as string | string[]);
      // A list of only whitespace is no filter at all — drop the param rather
      // than send an empty value the API would reject.
      if (csv === '') continue;
      query[key] = csv;
      continue;
    }

    query[key] = value as string | number | boolean;
  }

  return query as Parameters<MarketauxClient['searchAllNews']>[0];
}

function toCsv(value: string | string[]): string {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',');
}

/** Strips the `<em>` markup Marketaux wraps around matched entity text. */
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function shapeEntity(
  entity: RawEntity,
  includeHighlights: boolean
): NewsEntity {
  const shaped: NewsEntity = {
    symbol: entity.symbol ?? undefined,
    name: entity.name ?? undefined,
    type: entity.type ?? undefined,
    industry: entity.industry ?? undefined,
    country: entity.country ?? undefined,
    exchange: entity.exchange ?? entity.exchange_long ?? undefined,
    matchScore: entity.match_score ?? undefined,
    sentimentScore: entity.sentiment_score ?? undefined,
  };

  if (includeHighlights && entity.highlights?.length) {
    shaped.highlights = entity.highlights.map(shapeHighlight);
  }

  return shaped;
}

function shapeHighlight(highlight: RawHighlight) {
  return {
    text: stripTags(highlight.highlight),
    sentiment: highlight.sentiment ?? undefined,
    locatedIn: highlight.highlighted_in ?? undefined,
  };
}

function shapeArticle(article: RawArticle, includeHighlights: boolean): NewsArticle {
  return {
    uuid: article.uuid,
    title: article.title,
    url: article.url,
    publishedAt: article.published_at,
    source: article.source ?? undefined,
    language: article.language ?? undefined,
    description: article.description || undefined,
    snippet: article.snippet || undefined,
    imageUrl: article.image_url ?? undefined,
    relevanceScore: article.relevance_score ?? undefined,
    entities: (article.entities ?? []).map((entity) =>
      shapeEntity(entity, includeHighlights)
    ),
  };
}

function shapeResult(
  page: { meta: { found: number; returned: number; limit: number; page: number }; data: unknown },
  includeHighlights: boolean
): NewsSearchResult {
  const articles = (page.data as RawArticle[] | null) ?? [];

  return {
    meta: {
      found: page.meta.found,
      returned: page.meta.returned,
      limit: page.meta.limit,
      page: page.meta.page,
      // A short page means the result set is exhausted.
      hasMore: page.meta.returned >= page.meta.limit,
    },
    articles: articles.map((article) => shapeArticle(article, includeHighlights)),
  };
}

function formatDigest(result: NewsSearchResult): string {
  const { meta, articles } = result;

  if (articles.length === 0) {
    return `No articles matched. The API reports ${meta.found} total matches for this query, so the filters were too narrow for page ${meta.page}.`;
  }

  const lines: string[] = [
    `${articles.length} of ${meta.found.toLocaleString('en-US')} matching articles (page ${meta.page}).`,
    '',
  ];

  articles.forEach((article, index) => {
    lines.push(`${index + 1}. ${article.title}`);
    lines.push(`   ${article.source ?? 'unknown source'} · ${article.publishedAt}${article.language ? ` · ${article.language}` : ''}`);

    if (article.relevanceScore !== undefined) {
      lines.push(`   relevance ${article.relevanceScore.toFixed(2)}`);
    }
    if (article.snippet) {
      lines.push(`   ${collapse(article.snippet)}`);
    }
    if (article.entities.length > 0) {
      lines.push(`   Entities: ${article.entities.map(formatEntity).join('; ')}`);
    }
    lines.push(`   ${article.url}`);
    lines.push('');
  });

  lines.push(
    meta.hasMore
      ? `More articles available — call again with page: ${meta.page + 1}.`
      : 'End of results.'
  );

  return lines.join('\n');
}

function formatEntity(entity: NewsEntity): string {
  const label = entity.symbol
    ? `${entity.symbol}${entity.name ? ` (${entity.name})` : ''}`
    : (entity.name ?? entity.industry ?? 'unnamed entity');

  const scores: string[] = [];
  if (entity.matchScore !== undefined) {
    scores.push(`match ${entity.matchScore.toFixed(2)}`);
  }
  if (entity.sentimentScore !== undefined) {
    const sign = entity.sentimentScore > 0 ? '+' : '';
    scores.push(`sentiment ${sign}${entity.sentimentScore.toFixed(2)}`);
  }

  return scores.length > 0 ? `${label} [${scores.join(', ')}]` : label;
}

function collapse(value: string): string {
  return stripTags(value);
}

/** Re-exported so the server can surface a useful message on startup. */
export { MarketauxApiError };
