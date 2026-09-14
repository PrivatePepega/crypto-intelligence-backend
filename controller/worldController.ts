import type { Request, Response, NextFunction, Errback } from 'express'
import { getFundingConditions, getInflation, getInflationExpectations, getLaborMarket, getTreasuryYields } from '../collectors/massive/massive.fetch.js';
import { fredObservations, fredSearch, fredSeries } from '../collectors/fred/fred.fetch.js';
import { getFederalFundsRate } from '../utils/fred/federalFundsRates.js';
import { getTwoYearTreasuryYield } from '../utils/fred/2yTreasuryYield.js';
import { getTenYearTreasuryYield } from '../utils/fred/10yTreasuryYield.js';
import { getTenTwoYearYieldSpread } from '../utils/fred/10Y–2Y Yield Spread.js';
import { getTenYearBreakevenInflation } from '../utils/fred/10YBreakEvenInflation.js';
import { getRealTenYearTreasuryYield } from '../utils/fred/Real10YTreasuryYield.js';
import { getCpi } from '../utils/fred/cpi.js';
import { getCoreCpi } from '../utils/fred/coreCPI.js';
import { getPce } from '../utils/fred/PCE.js';
import { getCorePce } from '../utils/fred/corePCE.js';
import { getPpi } from '../utils/fred/ppi.js';
import { getFiveYearInflationExpectations } from '../utils/fred/5YInflationExpectations.js';
import { getTenYearInflationExpectations } from '../utils/fred/10YInflationExpectations.js';
import { getUnemploymentRate } from '../utils/fred/UnemploymentRate.js';
import { getLaborForceParticipation } from '../utils/fred/LaborForceParticipation.js';
import { getNonfarmPayrolls } from '../utils/fred/NonfarmPayrolls.js';
import { getAverageHourlyEarnings } from '../utils/fred/AverageHourlyEarnings.js';







const fredMacro = async(req: Request, res: Response) => {
    try {
    //   const search = await fredSearch("inflation");
    //   const series = await fredSeries("CPIAUCSL");
    // const observations = await fredObservations("CPIAUCSL", "10");

      const data = await getAverageHourlyEarnings()

  
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







const massiveMacro = async (req:Request, res:Response) => {
try{

    const [
        dataTreasuryYields,
        dataInflation,
        dataInflationExpectations,
        dataLaborMarket,
        dataFundingConditions,
      ] = await Promise.all([
        getTreasuryYields({
          limit: "1",
          sort: "date.desc",
        }),
      
        getInflation({
          limit: "2",
          sort: "date.desc",
        }),
      
        getInflationExpectations({
          limit: "2",
          sort: "date.desc",
        }),
      
        getLaborMarket({
          limit: "2",
          sort: "date.desc",
        }),
      
        getFundingConditions({
          limit: "2",
          sort: "date.desc",
        }),
      ]);

        const treasury = dataTreasuryYields.results[0]!;
        const inflation = dataInflation.results;
        const inflationExpectations = dataInflationExpectations.results;
        const laborMarket = dataLaborMarket.results;
        const fundingConditions = dataFundingConditions.results;

        if (!inflationExpectations) {
            throw new Error("Inflation expectations data is missing");
          }
        if (!laborMarket) {
        throw new Error("Inflation expectations data is missing");
        }



        const normalizedData = {
            treasuryYields: {
              date: treasury.date,
              oneYear: treasury.yield_1_year,
              twoYear: treasury.yield_2_year,
              fiveYear: treasury.yield_5_year,
              tenYear: treasury.yield_10_year,
              thirtyYear: treasury.yield_30_year,
            },
          
            inflation: {
              cpi: inflation.find(item => item.cpi !== undefined)?.cpi,
              cpiCore: inflation.find(item => item.cpi_core !== undefined)?.cpi_core,
              pce: inflation.find(item => item.pce !== undefined)?.pce,
            },
          
            inflationExpectations: {
              date: inflationExpectations[0]?.date,
              marketFiveYear: inflationExpectations.find(
                item => item.market_5_year !== undefined
              )?.market_5_year,
            },
          
            laborMarket: {
              date: laborMarket[0]?.date,
              unemploymentRate: laborMarket.find(
                item => item.unemployment_rate !== undefined
              )?.unemployment_rate,
          
              laborForceParticipationRate: laborMarket.find(
                item => item.labor_force_participation_rate !== undefined
              )?.labor_force_participation_rate,
          
              avgHourlyEarnings: laborMarket.find(
                item => item.avg_hourly_earnings !== undefined
              )?.avg_hourly_earnings,
          
              jobOpenings: laborMarket.find(
                item => item.job_openings !== undefined
              )?.job_openings,
            },
          
            fundingConditions: {
              date: fundingConditions.find(
                item =>
                  item.interest_on_reserve_balances !== undefined &&
                  item.sofr_volume !== undefined &&
                  item.obfr_volume !== undefined
              )?.date,
          
              interestOnReserveBalances: fundingConditions.find(
                item =>
                  item.interest_on_reserve_balances !== undefined &&
                  item.sofr_volume !== undefined &&
                  item.obfr_volume !== undefined
              )?.interest_on_reserve_balances,
          
              sofrVolume: fundingConditions.find(
                item =>
                  item.interest_on_reserve_balances !== undefined &&
                  item.sofr_volume !== undefined &&
                  item.obfr_volume !== undefined
              )?.sofr_volume,
          
              obfrVolume: fundingConditions.find(
                item =>
                  item.interest_on_reserve_balances !== undefined &&
                  item.sofr_volume !== undefined &&
                  item.obfr_volume !== undefined
              )?.obfr_volume,
            },
          };
          
          return res.json(normalizedData);
} catch (error) {
    console.error("Massive error:", error);

    return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : error,
    });
}

}



export {massiveMacro, fredMacro}