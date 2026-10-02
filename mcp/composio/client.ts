import { Composio } from "@composio/core";
import "dotenv/config";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY ?? null,
});

const userId = process.env.COMPOSIO_USER_ID;

export interface CurrentsLatestNewsOptions {
  language?: string;
  page_number?: number;
  page_size?: number;
}

export interface CurrentsSearchNewsOptions {
  category?: string;
  country?: string;
  end_date?: string;
  keywords?: string;
  language?: string;
  page_number?: number;
  page_size?: number;
  start_date?: string;
}

export interface CurrentsClient {
  getLatestNews(
    options?: CurrentsLatestNewsOptions,
  ): Promise<unknown>;

  searchNews(
    options?: CurrentsSearchNewsOptions,
  ): Promise<unknown>;
}

export const createCurrentsClient = (): CurrentsClient => {
  if (!process.env.COMPOSIO_API_KEY) {
    throw new Error("Missing COMPOSIO_API_KEY");
  }

  if (!userId) {
    throw new Error("Missing COMPOSIO_USER_ID");
  }

  let sessionPromise: ReturnType<typeof composio.create> | null = null;

  const getSession = async () => {
    if (!sessionPromise) {
      sessionPromise = composio.create(userId, {
        toolkits: ["currents_api"],
        manageConnections: {
          waitForConnections: true,
        },
      });
    }

    return sessionPromise;
  };

  const execute = async (
    toolSlug: string,
    arguments_: Record<string, unknown> = {},
  ) => {
    const session = await getSession();

    return session.execute(toolSlug, arguments_);
  };

  return {
    getLatestNews(options = {}) {
      return execute("CURRENTS_API_ACTIVITIES_LIST", {
        language: options.language ?? "en",
        page_number: options.page_number ?? 1,
        page_size: options.page_size ?? 30,
      });
    },

    searchNews(options = {}) {
      const arguments_: Record<string, unknown> = {
        language: options.language ?? "en",
        page_number: options.page_number ?? 1,
        page_size: options.page_size ?? 30,
      };

      if (options.category !== undefined) {
        arguments_.category = options.category;
      }

      if (options.country !== undefined) {
        arguments_.country = options.country;
      }

      if (options.end_date !== undefined) {
        arguments_.end_date = options.end_date;
      }

      if (options.keywords !== undefined) {
        arguments_.keywords = options.keywords;
      }

      if (options.start_date !== undefined) {
        arguments_.start_date = options.start_date;
      }

      return execute(
        "CURRENTS_API_USER_USAGE_REPORT_GET",
        arguments_,
      );
    },
  };
};