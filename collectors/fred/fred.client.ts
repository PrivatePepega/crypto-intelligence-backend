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
  try {
    const { data } = await fredClient.get<T>(path, {
      params,
    });

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("FRED ERROR STATUS:", error.response?.status);
      console.error("FRED ERROR DATA:", error.response?.data);
      console.error("FRED ERROR PARAMS:", error.config?.params);
    }

    throw error;
  }
}