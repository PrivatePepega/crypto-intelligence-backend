import { alphaVantageClient } from "./alphaVantage.client.js";

export async function alphaVantageFetch<T>(
  params: Record<string, string>,
): Promise<T> {
  const { data } = await alphaVantageClient.get<T>("", {
    params,
  });

  return data;
}