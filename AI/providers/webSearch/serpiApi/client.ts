const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

if (!SERPAPI_API_KEY) {
  throw new Error("SERPAPI_API_KEY is not configured.");
}

const SERPAPI_URL = "https://serpapi.com/search.json";

export const searchGoogle = async (
  query: string,
  count: number,
) => {
  const url = new URL(SERPAPI_URL);

  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  url.searchParams.set("api_key", SERPAPI_API_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `SerpApi Google Search error (${response.status}): ${error}`,
    );
  }

  return await response.json();
};