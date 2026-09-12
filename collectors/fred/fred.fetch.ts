import { fredFetch } from "./fred.client.js";

export async function fredSearch<T>(searchText: string): Promise<T>  {
    return fredFetch<T>("series/search", {
        search_text: searchText,
        limit: "10",

    });
}

export async function fredSeries<T>(seriesId: string): Promise<T> {
    return fredFetch<T>("series", {
        series_id: seriesId,
    });
}

export async function fredObservations<T>(
    seriesId: string,
    limit: string,
    frequency?: string,
    aggregationMethod?: string,
  ): Promise<T> {
    return fredFetch<T>("series/observations", {
      series_id: seriesId,
      limit,
      sort_order: "desc",
      ...(frequency && { frequency }),
      ...(aggregationMethod && { aggregation_method: aggregationMethod }),
    });
  }