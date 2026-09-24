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
import { injectConsumerPriceIndexLatest } from "../../injection/current/consumer_price_index.js";
import { injectCoreConsumerPriceIndexLatest } from "../../injection/current/core_consumer_price_index.js";
import { injectCorePersonalConsumptionExpendituresLatest } from "../../injection/current/core_personal_consumption_expenditures.js";
import { injectFederalFundsRateLatest } from "../../injection/current/federal_funds_rate.js";
import { injectFiveYearInflationExpectationsLatest } from "../../injection/current/five_year_inflation_expectations.js";
import { injectPersonalConsumptionExpendituresLatest } from "../../injection/current/personal_consumption_expenditures.js";
import { injectProducerPriceIndexLatest } from "../../injection/current/producer_price_index.js";
import { injectRealTenYearTreasuryYieldLatest } from "../../injection/current/real_ten_year_treasury_yield.js";
import { injectTenYearBreakevenInflationLatest } from "../../injection/current/ten_year_breakeven_inflation.js";
import { injectTenYearTreasuryYieldLatest } from "../../injection/current/ten_year_treasury_yield.js";
import { injectTwoYearTreasuryYieldLatest } from "../../injection/current/two_year_treasury_yield.js";
import { injectUnemploymentRateLatest } from "../../injection/current/unemployment_rate.js";
import { getLaborForceParticipation } from "../../../collectors/fred/Employment/LaborForceParticipation.js";
import { injectLaborForceParticipationLatest } from "../../injection/current/labor_force_participation.js";
import { getNonfarmPayrolls } from "../../../collectors/fred/Employment/NonfarmPayrolls.js";
import { injectNonfarmPayrollsLatest } from "../../injection/current/nonfarm_payrolls.js";
import { getAverageHourlyEarnings } from "../../../collectors/fred/Employment/AverageHourlyEarnings.js";
import { injectAverageHourlyEarningsLatest } from "../../injection/current/average_hourly_earnings.js";
import { getJobOpenings } from "../../../collectors/fred/Employment/JobOpenings.js";
import { injectJobOpeningsLatest } from "../../injection/current/job_openings.js";
import { getInitialJoblessClaims } from "../../../collectors/fred/Employment/InitialJoblessClaims.js";
import { injectInitialJoblessClaimsLatest } from "../../injection/current/initial_jobless_claims.js";
import { getRealGdp } from "../../../collectors/fred/Growth Economy/RealGdp.js";
import { injectRealGdpLatest } from "../../injection/current/real_gdp.js";
import { getRealGdpGrowth } from "../../../collectors/fred/Growth Economy/RealGdpGrowth.js";
import { injectRealGdpGrowthLatest } from "../../injection/current/real_gdp_growth.js";
import { getIndustrialProduction } from "../../../collectors/fred/Growth Economy/IndustrialProduction.js";
import { injectIndustrialProductionLatest } from "../../injection/current/industrial_production.js";
import { getRetailSales } from "../../../collectors/fred/Growth Economy/retailSales.js";
import { injectRetailSalesLatest } from "../../injection/current/retail_sales.js";







const runLatestInjection = async () => {
  console.log("Latest injection initialized");

  // const fedRates = await getFederalFundsRate("latest");
  // await injectFederalFundsRateLatest(fedRates);

  // const twoYearTYields = await getTwoYearTreasuryYield("latest");
  // await injectTwoYearTreasuryYieldLatest(twoYearTYields);

  // const tenYeatTYields = await getTenYearTreasuryYield("latest")
  // await injectTenYearTreasuryYieldLatest(tenYeatTYields)

  // const tenYearBreakevenInflation = await getTenYearBreakevenInflation("latest")
  // await injectTenYearBreakevenInflationLatest(tenYearBreakevenInflation)

  // const realTenYearTreasuryYield = await getRealTenYearTreasuryYield("latest")
  // await injectRealTenYearTreasuryYieldLatest(realTenYearTreasuryYield)

  // const consumerPriceIndex = await getCpi("latest")
  // await injectConsumerPriceIndexLatest(consumerPriceIndex)

  // const coreCPI = await getCoreCpi("latest")
  // await injectCoreConsumerPriceIndexLatest(coreCPI)

  // const pce = await getPce("latest")
  // await injectPersonalConsumptionExpendituresLatest(pce)

  // const corePce = await getCorePce("latest")
  // await injectCorePersonalConsumptionExpendituresLatest(corePce)

  // const ppi = await getPpi("latest")
  // await injectProducerPriceIndexLatest(ppi)

  // const fiveYearInflationExpectations = await getFiveYearInflationExpectations("latest")
  // await injectFiveYearInflationExpectationsLatest(fiveYearInflationExpectations)

  // const unemploymentRate = await getUnemploymentRate("latest")
  // await injectUnemploymentRateLatest(unemploymentRate)

  // const laborForceParticipation = await getLaborForceParticipation("latest")
  // await injectLaborForceParticipationLatest(laborForceParticipation)

  // const nonFarmPayRolls = await getNonfarmPayrolls("latest")
  // await injectNonfarmPayrollsLatest(nonFarmPayRolls)

  // const averageHourlyEarning = await getAverageHourlyEarnings("latest")
  // await injectAverageHourlyEarningsLatest(averageHourlyEarning)

  // const jobOpenings = await getJobOpenings("latest")
  // await injectJobOpeningsLatest(jobOpenings)

  // const initialJoblessClaims = await getInitialJoblessClaims("latest")
  // await injectInitialJoblessClaimsLatest(initialJoblessClaims)

  // const realGDP = await getRealGdp("latest")
  // await injectRealGdpLatest(realGDP)

  // const realGDPGrowth = await getRealGdpGrowth("latest")
  // await injectRealGdpGrowthLatest(realGDPGrowth)

  // const industrialProduction = await getIndustrialProduction("latest")
  // await injectIndustrialProductionLatest(industrialProduction)

  const retailSales = await getRetailSales("latest")
  await injectRetailSalesLatest(retailSales)
















  // console.log("Result:", result);
  console.log("Latest injection complete");
};

runLatestInjection()
  .catch((error) => {
    console.error("Latest injection failed:", error);
    process.exitCode = 1;
  });