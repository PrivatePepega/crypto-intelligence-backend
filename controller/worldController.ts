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













const test = async(req: Request, res: Response) => {
    try {


      const data = await getCftcTff("latest")

  
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