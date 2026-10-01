import { tavily } from "@tavily/core";

const apiKey = process.env.TAVILY_API_KEY;

if (!apiKey) {
  throw new Error("TAVILY_API_KEY is not configured.");
}

const client = tavily({ apiKey });

export const searchTavily = async (
  query: string,
  maxResults = 8,
) => {
  const response = await client.search(query, {
    maxResults,
  });

  return response;
};