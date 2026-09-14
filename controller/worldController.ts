import type { Request, Response, NextFunction, Errback } from 'express'
import { getFundingConditions, getInflation, getInflationExpectations, getLaborMarket, getTreasuryYields } from '../collectors/massive/massive.fetch.js';
import { getM2MoneySupply } from '../collectors/fred/Liquidity Financial Conditions/M2MoneySupply.js';
import { getSp500 } from '../collectors/fred/Market Health/snp500.js';
import { getNasdaqComposite } from '../collectors/fred/Market Health/NASDAQComposite.js';
import { getDowJones } from '../collectors/fred/Market Health/DowJones.js';
import { getBroadUsdIndex } from '../collectors/fred/Market Health/Broad USD Index.js';
import { getRealBroadUsdIndex } from '../collectors/fred/Market Health/Real Broad USD Index.js';
import { getAdvancedEconomyUsdIndex } from '../collectors/fred/Market Health/Advanced Economy USD Index.js';
import { getEmergingMarketUsdIndex } from '../collectors/fred/Market Health/Emerging Market USD Index.js';
import { get3mTreasury } from '../collectors/fred/Market Health/3M Treasury.js';
import { get5yTreasury } from '../collectors/fred/Market Health/5Y Treasury.js';









const fredMacro = async(req: Request, res: Response) => {
    try {


      const data = await get5yTreasury()

  
      res.json({
        data,
      });
    } catch (error) {
        console.error("FRED macro error:", error);
      
        res.status(500).json({
          error: error instanceof Error ? error.message : error,
        });
      }
  }










export { fredMacro}