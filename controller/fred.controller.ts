import type { Request, Response, NextFunction, Errback } from 'express'
import { getAverageHourlyEarnings } from '../collectors/fred/Employment/AverageHourlyEarnings.js';
import { getInitialJoblessClaims } from '../collectors/fred/Employment/InitialJoblessClaims.js';
import { getJobOpenings } from '../collectors/fred/Employment/JobOpenings.js';
import { getLaborForceParticipation } from '../collectors/fred/Employment/LaborForceParticipation.js';
import { getNonfarmPayrolls } from '../collectors/fred/Employment/NonfarmPayrolls.js';
import { getUnemploymentRate } from '../collectors/fred/Employment/UnemploymentRate.js';
import { getIndustrialProduction } from '../collectors/fred/Growth Economy/IndustrialProduction.js';
import { getPersonalIncome } from '../collectors/fred/Growth Economy/personalIncome.js';
import { getRealGdp } from '../collectors/fred/Growth Economy/RealGdp.js';
import { getRealGdpGrowth } from '../collectors/fred/Growth Economy/RealGdpGrowth.js';
import { getRetailSales } from '../collectors/fred/Growth Economy/retailSales.js';
import { getBuildingPermits } from '../collectors/fred/Housing/BuildingPermits.js';
import { getExistingHomeSales } from '../collectors/fred/Housing/ExistingHomeSales.js';
import { getHomePriceIndex } from '../collectors/fred/Housing/HomePriceIndex.js';
import { getHousingStarts } from '../collectors/fred/Housing/HousingStarts.js';
import { getMortgageRate } from '../collectors/fred/Housing/MortgageRate.js';
import { getFiveYearInflationExpectations } from '../collectors/fred/Inflation/5YInflationExpectations.js';
import { getTenYearInflationExpectations } from '../collectors/fred/Inflation/10YInflationExpectations.js';
import { getCoreCpi } from '../collectors/fred/Inflation/coreCPI.js';
import { getCorePce } from '../collectors/fred/Inflation/corePCE.js';
import { getCpi } from '../collectors/fred/Inflation/cpi.js';
import { getPce } from '../collectors/fred/Inflation/PCE.js';
import { getPpi } from '../collectors/fred/Inflation/ppi.js';
import { getFedTotalAssets } from '../collectors/fred/Liquidity Financial Conditions/FedTotalAssets.js';
import { getM2MoneySupply } from '../collectors/fred/Liquidity Financial Conditions/M2MoneySupply.js';
import { getReserveBalances } from '../collectors/fred/Liquidity Financial Conditions/ReserveBalances.js';
import { getReverseRepoUsage } from '../collectors/fred/Liquidity Financial Conditions/ReverseRepoUsage.js';
import { get3mTreasury } from '../collectors/fred/Market Health/3M Treasury.js';
import { get5yTreasury } from '../collectors/fred/Market Health/5Y Treasury.js';
import { getAdvancedEconomyUsdIndex } from '../collectors/fred/Market Health/Advanced Economy USD Index.js';
import { getBroadUsdIndex } from '../collectors/fred/Market Health/Broad USD Index.js';
import { getDowJones } from '../collectors/fred/Market Health/DowJones.js';
import { getEmergingMarketUsdIndex } from '../collectors/fred/Market Health/Emerging Market USD Index.js';
import { getNasdaqComposite } from '../collectors/fred/Market Health/NASDAQComposite.js';
import { getRealBroadUsdIndex } from '../collectors/fred/Market Health/Real Broad USD Index.js';
import { getSp500 } from '../collectors/fred/Market Health/snp500.js';
import { getTwoYearTreasuryYield } from '../collectors/fred/Monetary Policy/2yTreasuryYield.js';
import { getTenTwoYearYieldSpread } from '../collectors/fred/Monetary Policy/10Y–2Y Yield Spread.js';
import { getTenYearBreakevenInflation } from '../collectors/fred/Monetary Policy/10YBreakEvenInflation.js';
import { getTenYearTreasuryYield } from '../collectors/fred/Monetary Policy/10yTreasuryYield.js';
import { getFederalFundsRate } from '../collectors/fred/Monetary Policy/federalFundsRates.js';
import { getRealTenYearTreasuryYield } from '../collectors/fred/Monetary Policy/Real10YTreasuryYield.js';
import { getConsumerSentiment } from '../collectors/fred/Risk Sentiment/ConsumerSentiment.js';
import { getHighYieldCreditSpread } from '../collectors/fred/Risk Sentiment/High-YieldCreditSpread.js';
import { getInvestmentGradeCreditSpread } from '../collectors/fred/Risk Sentiment/Investment-GradeCreditSpread.js';
import { getVix } from '../collectors/fred/Risk Sentiment/VIX.js';









const fredMacro = async(req: Request, res: Response) => {
    try {


      const data = await getVix("latest")

  
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