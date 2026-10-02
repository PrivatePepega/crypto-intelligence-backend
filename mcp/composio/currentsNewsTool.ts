import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type {
  CurrentsClient,
  CurrentsLatestNewsOptions,
  CurrentsSearchNewsOptions,
} from "./currents.client.js";

const newsArticleSchema = z.object({
  author: z.string(),
  category: z.array(z.string()),
  description: z.string(),
  id: z.string(),
  image: z.string(),
  language: z.string(),
  published: z.string(),
  source_category: z.array(z.string()),
  title: z.string(),
  url: z.string(),
});

const newsResponseSchema = z.object({
  news: z.array(newsArticleSchema),
  page: z.number(),
  status: z.string(),
});

const latestNewsInputSchema = z.object({
  language: z
    .string()
    .default("en")
    .describe(
      "Language code for the news, for example en or es.",
    ),

  page_number: z
    .number()
    .int()
    .min(1)
    .max(180)
    .default(1)
    .describe("1-based page number."),

  page_size: z
    .number()
    .int()
    .min(1)
    .max(300)
    .default(30)
    .describe("Number of articles to return."),
});

const searchNewsInputSchema = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "News category or comma-separated categories, for example business, technology, sports, entertainment, or politics.",
    ),

  country: z
    .string()
    .optional()
    .describe(
      "Country code, for example US, GB, or CA.",
    ),

  end_date: z
    .string()
    .optional()
    .describe(
      "RFC3339 end date, for example 2026-10-02T23:59:59Z.",
    ),

  keywords: z
    .string()
    .optional()
    .describe(
      "Keywords or phrases to search for in news articles.",
    ),

  language: z
    .string()
    .default("en")
    .describe(
      "Language code for the news, for example en or es.",
    ),

  page_number: z
    .number()
    .int()
    .min(1)
    .max(180)
    .default(1)
    .describe("1-based page number."),

  page_size: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(30)
    .describe("Number of articles to return."),

  start_date: z
    .string()
    .optional()
    .describe(
      "RFC3339 start date, for example 2026-10-02T00:00:00Z.",
    ),
});

export class CurrentsNewsTool {
  constructor(
    private readonly client: CurrentsClient,
  ) {}

  public register(server: McpServer): void {
    server.registerTool(
      "currents_latest_news",
      {
        title: "Get latest Currents news",

        description:
          "Get the latest news articles from Currents. Use this for a broad current-news feed when no specific topic or search query is required.",

        inputSchema: latestNewsInputSchema,

        outputSchema: newsResponseSchema,

        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },

      async (input) => {
        const result = await this.client.getLatestNews(
          input as CurrentsLatestNewsOptions,
        );

        return buildToolResult(result);
      },
    );

    server.registerTool(
      "currents_search_news",
      {
        title: "Search Currents news",

        description:
          "Search Currents news using keywords and optional category, country, language, and date filters. Use this for targeted research on a topic, event, company, market, or narrative.",

        inputSchema: searchNewsInputSchema,

        outputSchema: newsResponseSchema,

        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },

      async (input) => {
        const result = await this.client.searchNews(
          input as CurrentsSearchNewsOptions,
        );

        return buildToolResult(result);
      },
    );
  }
}

function buildToolResult(result: unknown) {
  if (hasError(result)) {
    throw new Error(result.error);
  }

  const normalized = normalizeResponse(result);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(normalized, null, 2),
      },
    ],

    structuredContent: normalized,
  };
}

function hasError(
  result: unknown,
): result is { error: string } {
  if (
    typeof result !== "object" ||
    result === null
  ) {
    return false;
  }

  const record = result as Record<string, unknown>;

  return (
    typeof record.error === "string" &&
    record.error.length > 0
  );
}

function normalizeResponse(result: unknown) {
  if (
    typeof result !== "object" ||
    result === null
  ) {
    throw new Error(
      "Currents returned an unexpected response.",
    );
  }

  const record = result as Record<string, unknown>;

  const data =
    typeof record.data === "object" &&
    record.data !== null
      ? (record.data as Record<string, unknown>)
      : null;

  if (!data) {
    throw new Error(
      "Currents returned no response data.",
    );
  }

  const news = Array.isArray(data.news)
    ? data.news.map(normalizeArticle)
    : [];

  const page =
    typeof data.page === "number"
      ? data.page
      : 1;

  const status =
    typeof data.status === "string"
      ? data.status
      : "unknown";

  return {
    news,
    page,
    status,
  };
}

function normalizeArticle(article: unknown) {
  if (
    typeof article !== "object" ||
    article === null
  ) {
    throw new Error(
      "Currents returned an invalid news article.",
    );
  }

  const record = article as Record<string, unknown>;

  return {
    author: stringValue(record.author),
    category: stringArrayValue(record.category),
    description: stringValue(record.description),
    id: stringValue(record.id),
    image: stringValue(record.image),
    language: stringValue(record.language),
    published: stringValue(record.published),
    source_category: stringArrayValue(
      record.source_category,
    ),
    title: stringValue(record.title),
    url: stringValue(record.url),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}