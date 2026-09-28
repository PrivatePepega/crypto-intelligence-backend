import type { Request, Response, NextFunction, Errback } from 'express'

import { getFederalFundsRate } from '../collectors/fred/Monetary Policy/federalFundsRates.js';
import { getTwoYearTreasuryYield } from '../collectors/fred/Monetary Policy/2yTreasuryYield.js';
import { getTenTwoYearYieldSpread } from '../collectors/fred/Monetary Policy/10Y–2Y Yield Spread.js';
import { getUnemploymentRate } from '../collectors/fred/Employment/UnemploymentRate.js';
import { getFxData } from '../collectors/alpha vantage/fx/fx.js';
import { getCommodityData } from '../collectors/alpha vantage/commodities/commodities.js';
import { getCnnFearGreed } from '../collectors/cnn/cnnFearGreed.js';
import { getAaiiSentiment } from '../collectors/aaii/aaiiSentiment.js';
import { getCftcTff } from '../collectors/CFTC/getCftc.js';
import { getRussell2000 } from '../collectors/FMP/russell2000Provider.js';
import { fetchIGSentiment } from '../collectors/IG/sentimentFetcher.js';
import { getIgSentiment } from '../collectors/IG/getIgSentiment.js';
import { fetchBinancePositioning } from '../collectors/binance/binanceFetcher.js';
import { fetchFearGreed } from '../collectors/alternative.me/fearGreedIndex.js';
import { fetchAltcoinSeason } from '../collectors/coinMarketCap/altSeasonIndex.js';
import { fetchCoinMarketCapGlobalMetrics } from '../collectors/coinMarketCap/cryptoMarketStats.js';
import { collectAllSosoValueEtfs } from '../collectors/sosoValue/spotETFfetcher.js';













const test = async(req: Request, res: Response) => {
    try {


      const data = await collectAllSosoValueEtfs("latest")

  
      res.json({
        data,
      });
    } catch (error) {
        console.error("macro error:", error);
      
        res.status(500).json({
          error: error instanceof Error ? error.message : error,
        });
      }
  }










export { test}