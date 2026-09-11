import { fredFetch } from "./fred.client.js";

export async function fredSearch(searchText: string) {
    return fredFetch("series/search", {
        search_text: searchText,
        limit: "10",

    });
}

export async function fredSeries(seriesId: string) {
    return fredFetch("series", {
        series_id: seriesId,
    });
}

export async function fredObservations(seriesId: string) {
    return fredFetch("series/observations", {
        series_id: seriesId,
        limit: "10",
        sort_order: "desc",
      });
}