import { searchCommodities } from './services/commodities/commodityResolver.js';

async function main() {
  const results = await searchCommodities('HGUSD', 5);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch(console.error);