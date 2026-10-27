import { autocompleteCommodities } from './services/commodities/commodityIntelligenceService.js';

async function main() {
  console.log('Testing autocompleteCommodities...');
  const results = await autocompleteCommodities('HGUSD', 5);
  console.log('Results:', JSON.stringify(results, null, 2));
}

main().catch(e => console.error('Error:', e));