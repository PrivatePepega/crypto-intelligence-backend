const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

if (!BRAVE_SEARCH_API_KEY) {
  throw new Error("BRAVE_SEARCH_API_KEY is not configured.");
}

const BRAVE_SEARCH_URL =
  "https://api.search.brave.com/res/v1/web/search";

export const searchBrave = async (
  query: string,
  count: number,
) => {
  const url = new URL(BRAVE_SEARCH_URL);

  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Brave Search API error (${response.status}): ${error}`,
    );
  }

  return await response.json();
};