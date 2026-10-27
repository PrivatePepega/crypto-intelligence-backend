import { fetchCommodityCatalog } from './collectors/assets/commodities/fmpCommodityFetchers.js';

async function main() {
  const catalog = await fetchCommodityCatalog();
  console.log('Catalog:', JSON.stringify(catalog, null, 2));
}

main().catch(console.error);