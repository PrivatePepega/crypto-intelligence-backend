import { marketauxClient } from "./client.js";

export async function callMarketauxNews() {
  const result = await marketauxClient.callTool({
    name: "market_aux_news_search",
    arguments: {
        search: "bitcoin OR ethereum OR crypto regulation OR ETF OR hack OR exploit",
        entity_types: "cryptocurrency",
        must_have_entities: true,
        group_similar: true,
        sort: "relevance_score",
        limit: 20
    },
  });

  return result;
}