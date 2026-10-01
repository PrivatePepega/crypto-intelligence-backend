const YOU_API_KEY = process.env.YOU_API_KEY;

if (!YOU_API_KEY) {
  throw new Error("YOU_API_KEY is not configured.");
}

const YOU_SEARCH_URL = "https://ydc-index.io/v1/search";

export const searchYou = async (
  query: string,
  count: number,
) => {
  const url = new URL(YOU_SEARCH_URL);

  url.searchParams.set("query", query);
  url.searchParams.set("count", String(count));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-Key": YOU_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `You.com Search API error (${response.status}): ${error}`,
    );
  }

  return await response.json();
};
