const FRED_BASE_URL = "https://api.stlouisfed.org/fred";
import "dotenv/config";


export async function fredFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path, FRED_BASE_URL + "/");

  url.searchParams.set("api_key", process.env.FRED_API_KEY!);
  url.searchParams.set("file_type", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `FRED API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}