import { getOrIngestStock } from './services/stocks/stockIntelligenceService.js';

async function main() {
  try {
    console.log("Testing getOrIngestStock directly with MSFT...");
    const result = await getOrIngestStock('MSFT', {
      refresh: false,
      include: ['profile', 'quote', 'history'],
      readOnly: false
    });
    console.log('Success:', !!result.profile, 'Candles:', result.history?.candles?.length);
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
  }
}

main();