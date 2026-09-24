import "dotenv/config";

import { getUnemploymentRate } from "../../../collectors/fred/Employment/UnemploymentRate.js";
import { getFiveYearInflationExpectations } from "../../../collectors/fred/Inflation/5YInflationExpectations.js";
import { getCoreCpi } from "../../../collectors/fred/Inflation/coreCPI.js";
import { getCorePce } from "../../../collectors/fred/Inflation/corePCE.js";
import { getCpi } from "../../../collectors/fred/Inflation/cpi.js";
import { getPce } from "../../../collectors/fred/Inflation/PCE.js";
import { getPpi } from "../../../collectors/fred/Inflation/ppi.js";
import { getTenYearBreakevenInflation } from "../../../collectors/fred/Monetary Policy/10YBreakEvenInflation.js";
import { getTenYearTreasuryYield } from "../../../collectors/fred/Monetary Policy/10yTreasuryYield.js";
import { getTwoYearTreasuryYield } from "../../../collectors/fred/Monetary Policy/2yTreasuryYield.js";
import { getFederalFundsRate } from "../../../collectors/fred/Monetary Policy/federalFundsRates.js";
import { getRealTenYearTreasuryYield } from "../../../collectors/fred/Monetary Policy/Real10YTreasuryYield.js";
import { injectConsumerPriceIndexFull } from "../../injection/historical/consumer_price_index.js";
import { injectCoreConsumerPriceIndexFull } from "../../injection/historical/core_consumer_price_index.js";
import { injectCorePersonalConsumptionExpendituresFull } from "../../injection/historical/core_personal_consumption_expenditures.js";
import { injectFederalFundsRateFull } from "../../injection/historical/federal_funds_rate.js";
import { injectFiveYearInflationExpectationsFull } from "../../injection/historical/five_year_inflation_expectations.js";
import { injectPersonalConsumptionExpendituresFull } from "../../injection/historical/personal_consumption_expenditures.js";
import { injectProducerPriceIndexFull } from "../../injection/historical/producer_price_index.js";
import { injectRealTenYearTreasuryYieldFull } from "../../injection/historical/real_ten_year_treasury_yield.js";
import { injectTenYearBreakevenInflationFull } from "../../injection/historical/ten_year_breakeven_inflation.js";
import { injectTenYearTreasuryYieldFull } from "../../injection/historical/ten_year_treasury_yield.js";
import { injectTwoYearTreasuryYieldFull } from "../../injection/historical/two_year_treasury_yield.js";
import { injectUnemploymentRateFull } from "../../injection/historical/unemployment_rate.js";
import { getLaborForceParticipation } from "../../../collectors/fred/Employment/LaborForceParticipation.js";
import { injectLaborForceParticipationFull } from "../../injection/historical/labor_force_participation.js";
import { getNonfarmPayrolls } from "../../../collectors/fred/Employment/NonfarmPayrolls.js";
import { injectNonfarmPayrollsFull } from "../../injection/historical/nonfarm_payrolls.js";
import { getAverageHourlyEarnings } from "../../../collectors/fred/Employment/AverageHourlyEarnings.js";
import { injectAverageHourlyEarningsFull } from "../../injection/historical/average_hourly_earnings.js";
import { getJobOpenings } from "../../../collectors/fred/Employment/JobOpenings.js";
import { injectJobOpeningsFull } from "../../injection/historical/job_openings.js";
import { getInitialJoblessClaims } from "../../../collectors/fred/Employment/InitialJoblessClaims.js";
import { injectInitialJoblessClaimsFull } from "../../injection/historical/initial_jobless_claims.js";
import { getRealGdp } from "../../../collectors/fred/Growth Economy/RealGdp.js";
import { injectRealGdpFull } from "../../injection/historical/real_gdp.js";
import { getRealGdpGrowth } from "../../../collectors/fred/Growth Economy/RealGdpGrowth.js";
import { injectRealGdpGrowthFull } from "../../injection/historical/real_gdp_growth.js";
import { getIndustrialProduction } from "../../../collectors/fred/Growth Economy/IndustrialProduction.js";
import { injectIndustrialProductionFull } from "../../injection/historical/industrial_production.js";
import { getRetailSales } from "../../../collectors/fred/Growth Economy/retailSales.js";
import { injectRetailSalesFull } from "../../injection/historical/retail_sales.js";




const runFullInjection = async () => {
    console.log("Full Injection initialized");

    // const fedRates = await getFederalFundsRate("full")
    // await injectFederalFundsRateFull(fedRates)


    // const twoYearTYields = await getTwoYearTreasuryYield("full")
    // await injectTwoYearTreasuryYieldFull(twoYearTYields)

    // const tenYeatTYields = await getTenYearTreasuryYield("full")
    // await injectTenYearTreasuryYieldFull(tenYeatTYields)

    // const tenYearBreakevenInflation = await getTenYearBreakevenInflation("full")
    // await injectTenYearBreakevenInflationFull(tenYearBreakevenInflation)

    // const realTenYearTreasuryYield = await getRealTenYearTreasuryYield("full")
    // await injectRealTenYearTreasuryYieldFull(realTenYearTreasuryYield)

    // const consumerPriceIndex = await getCpi("full")
    // await injectConsumerPriceIndexFull(consumerPriceIndex)

    // const coreCPI = await getCoreCpi("full")
    // await injectCoreConsumerPriceIndexFull(coreCPI)

    // const pce = await getPce("full")
    // await injectPersonalConsumptionExpendituresFull(pce)

    // const corePce = await getCorePce("full")
    // await injectCorePersonalConsumptionExpendituresFull(corePce)

    // const ppi = await getPpi("full")
    // await injectProducerPriceIndexFull(ppi)

    // const fiveYearInflationExpectations = await getFiveYearInflationExpectations("full")
    // await injectFiveYearInflationExpectationsFull(fiveYearInflationExpectations)

    // const unemploymentRate = await getUnemploymentRate("full")
    // await injectUnemploymentRateFull(unemploymentRate)

    // const laborForceParticipation = await getLaborForceParticipation("full")
    // await injectLaborForceParticipationFull(laborForceParticipation)

    // const nonFarmPayRolls = await getNonfarmPayrolls("full")
    // await injectNonfarmPayrollsFull(nonFarmPayRolls)

    // const averageHourlyEarning = await getAverageHourlyEarnings("full")
    // await injectAverageHourlyEarningsFull(averageHourlyEarning)

    // const jobOpenings = await getJobOpenings("full")
    // await injectJobOpeningsFull(jobOpenings)
  
    // const initialJoblessClaims = await getInitialJoblessClaims("full")
    // await injectInitialJoblessClaimsFull(initialJoblessClaims)

    // const realGDP = await getRealGdp("full")
    // await injectRealGdpFull(realGDP)

    // const realGDPGrowth = await getRealGdpGrowth("full")
    // await injectRealGdpGrowthFull(realGDPGrowth)

    // const industrialProduction = await getIndustrialProduction("full")
    // await injectIndustrialProductionFull(industrialProduction)

    const retailSales = await getRetailSales("full")
    await injectRetailSalesFull(retailSales)










    console.log("Full Injection complete");
  };
  

  runFullInjection()
  .catch((error) => {
    console.error("Full Injection failed:", error);
    process.exitCode = 1;
  })