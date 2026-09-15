import axios from "axios";

export const fredClient = axios.create({
  baseURL: "https://api.stlouisfed.org/fred",
  params: {
    api_key: process.env.FRED_API_KEY,
    file_type: "json",
  },
});

export async function fredFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const { data } = await fredClient.get<T>(path, {
    params,
  });

  return data;
}