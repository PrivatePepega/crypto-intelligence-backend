const MASSIVE_BASE_URL = "https://api.massive.com";
import "dotenv/config";

export async function massiveFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
//   console.log(
//     "Massive key loaded:",
//     process.env.MASSIVE_API_KEY ? "YES" : "NO"
// );
  const url = new URL(path, MASSIVE_BASE_URL);

  url.searchParams.set("apiKey", process.env.MASSIVE_API_KEY!);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Massive API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}