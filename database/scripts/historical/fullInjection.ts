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
import { getPersonalIncome } from "../../../collectors/fred/Growth Economy/personalIncome.js";
import { injectPersonalIncomeFull } from "../../injection/historical/personal_income.js";
import { getM2MoneySupply } from "../../../collectors/fred/Liquidity Financial Conditions/M2MoneySupply.js";
import { injectM2MoneySupplyFull } from "../../injection/historical/m2_money_supply.js";
import { getFedTotalAssets } from "../../../collectors/fred/Liquidity Financial Conditions/FedTotalAssets.js";
import { injectFedTotalAssetsFull } from "../../injection/historical/fed_total_assets.js";
import { getReserveBalances } from "../../../collectors/fred/Liquidity Financial Conditions/ReserveBalances.js";
import { injectReserveBalancesFull } from "../../injection/historical/reserve_balances.js";
import { getReverseRepoUsage } from "../../../collectors/fred/Liquidity Financial Conditions/ReverseRepoUsage.js";
import { injectReverseRepoUsageFull } from "../../injection/historical/reverse_repo_usage.js";
import { getVix } from "../../../collectors/fred/Risk Sentiment/VIX.js";
import { injectVixFull } from "../../injection/historical/vix.js";
import { getHighYieldCreditSpread } from "../../../collectors/fred/Risk Sentiment/High-YieldCreditSpread.js";
import { injectHighYieldCreditSpreadFull } from "../../injection/historical/high_yield_credit_spread.js";
import { getInvestmentGradeCreditSpread } from "../../../collectors/fred/Risk Sentiment/Investment-GradeCreditSpread.js";
import { injectInvestmentGradeCreditSpreadFull } from "../../injection/historical/investment_grade_credit_spread.js";
import { getConsumerSentiment } from "../../../collectors/fred/Risk Sentiment/ConsumerSentiment.js";
import { injectConsumerSentimentFull } from "../../injection/historical/consumer_sentiment.js";
import { getHousingStarts } from "../../../collectors/fred/Housing/HousingStarts.js";
import { injectHousingStartsFull } from "../../injection/historical/housing_starts.js";
import { getBuildingPermits } from "../../../collectors/fred/Housing/BuildingPermits.js";
import { injectBuildingPermitsFull } from "../../injection/historical/building_permits.js";
import { getExistingHomeSales } from "../../../collectors/fred/Housing/ExistingHomeSales.js";
import { injectExistingHomeSalesFull } from "../../injection/historical/existing_home_sales.js";
import { getMortgageRate } from "../../../collectors/fred/Housing/MortgageRate.js";
import { injectMortgageRateFull } from "../../injection/historical/mortgage_rate.js";
import { getHomePriceIndex } from "../../../collectors/fred/Housing/HomePriceIndex.js";
import { injectHomePriceIndexFull } from "../../injection/historical/home_price_index.js";
import { getSp500 } from "../../../collectors/fred/Market Health/snp500.js";
import { injectSp500Full } from "../../injection/historical/sp500.js";
import { getNasdaqComposite } from "../../../collectors/fred/Market Health/NASDAQComposite.js";
import { injectNasdaqCompositeFull } from "../../injection/historical/nasdaq_composite.js";
import { getDowJones } from "../../../collectors/fred/Market Health/DowJones.js";
import { injectDowJonesFull } from "../../injection/historical/dow_jones.js";
import { getBroadUsdIndex } from "../../../collectors/fred/Market Health/Broad USD Index.js";
import { injectBroadUsdIndexFull } from "../../injection/historical/broad_usd_index.js";
import { getRealBroadUsdIndex } from "../../../collectors/fred/Market Health/Real Broad USD Index.js";
import { injectRealBroadUsdIndexFull } from "../../injection/historical/real_broad_usd_index.js";
import { getAdvancedEconomyUsdIndex } from "../../../collectors/fred/Market Health/Advanced Economy USD Index.js";
import { injectAdvancedEconomyUsdIndexFull } from "../../injection/historical/advanced_economy_usd_index.js";
import { getEmergingMarketUsdIndex } from "../../../collectors/fred/Market Health/Emerging Market USD Index.js";
import { injectEmergingMarketUsdIndexFull } from "../../injection/historical/emerging_market_usd_index.js";
import { get3mTreasury } from "../../../collectors/fred/Market Health/3M Treasury.js";
import { injectThreeMonthTreasuryFull } from "../../injection/historical/three_month_treasury.js";
import { get5yTreasury } from "../../../collectors/fred/Market Health/5Y Treasury.js";
import { injectFiveYearTreasuryFull } from "../../injection/historical/five_year_treasury.js";
import { getFxData } from "../../../collectors/alpha vantage/fx/fx.js";
import { getCommodityData } from "../../../collectors/alpha vantage/commodities/commodities.js";
import { injectEurUsdFull } from "../../injection/historical/eur_usd.js";
import { injectGbpUsdFull } from "../../injection/historical/gbp_usd.js";
import { injectUsdJpyFull } from "../../injection/historical/usd_jpy.js";
import { injectUsdChfFull } from "../../injection/historical/usd_chf.js";
import { injectAudUsdFull } from "../../injection/historical/aud_usd.js";
import { injectUsdCadFull } from "../../injection/historical/usd_cad.js";
import { injectNzdUsdFull } from "../../injection/historical/nzd_usd.js";
import { injectGoldFull } from "../../injection/historical/gold.js";




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

    // const retailSales = await getRetailSales("full")
    // await injectRetailSalesFull(retailSales)

    // const personalIncome = await getPersonalIncome("full")
    // await injectPersonalIncomeFull(personalIncome)

    // const m2MoneySupply = await getM2MoneySupply("full")
    // await injectM2MoneySupplyFull(m2MoneySupply)

    // const fedTotalAssets = await getFedTotalAssets("full")
    // await injectFedTotalAssetsFull(fedTotalAssets)

    // const reserveBalances = await getReserveBalances("full")
    // await injectReserveBalancesFull(reserveBalances)

    // const reverseRepoUsage = await getReverseRepoUsage("full")
    // await injectReverseRepoUsageFull(reverseRepoUsage)

    // const vix = await getVix("full")
    // await injectVixFull(vix)

    // const highYieldCreditSpread = await getHighYieldCreditSpread("full")
    // await injectHighYieldCreditSpreadFull(highYieldCreditSpread)

    // const investmentGradeCreditSpread = await getInvestmentGradeCreditSpread("full")
    // await injectInvestmentGradeCreditSpreadFull(investmentGradeCreditSpread)

    // const consumerSentiment = await getConsumerSentiment("full")
    // await injectConsumerSentimentFull(consumerSentiment)

    // const housingStarts = await getHousingStarts("full")
    // await injectHousingStartsFull(housingStarts)

    // const buildingPermits = await getBuildingPermits("full")
    // await injectBuildingPermitsFull(buildingPermits)

    // const existingHomeSales = await getExistingHomeSales("full")
    // await injectExistingHomeSalesFull(existingHomeSales)

    // const mortgageRate = await getMortgageRate("full")
    // await injectMortgageRateFull(mortgageRate)

    // const homePriceIndex = await getHomePriceIndex("full")
    // await injectHomePriceIndexFull(homePriceIndex)

    // const sp500 = await getSp500("full")
    // await injectSp500Full(sp500)

    // const nasdaqComposite = await getNasdaqComposite("full")
    // await injectNasdaqCompositeFull(nasdaqComposite)

    // const dowJones = await getDowJones("full")
    // await injectDowJonesFull(dowJones)

    // const broadUsdIndex = await getBroadUsdIndex("full")
    // await injectBroadUsdIndexFull(broadUsdIndex)

    // const realBroadUsdIndex = await getRealBroadUsdIndex("full")
    // await injectRealBroadUsdIndexFull(realBroadUsdIndex)

    // const advancedEconomyUsdIndex = await getAdvancedEconomyUsdIndex("full")
    // await injectAdvancedEconomyUsdIndexFull(advancedEconomyUsdIndex)

    // const emergingMarketUsdIndex = await getEmergingMarketUsdIndex("full")
    // await injectEmergingMarketUsdIndexFull(emergingMarketUsdIndex)

    // const threeMonthTreasury = await get3mTreasury("full")
    // await injectThreeMonthTreasuryFull(threeMonthTreasury)

    // const fiveYearTreasury = await get5yTreasury("full")
    // await injectFiveYearTreasuryFull(fiveYearTreasury)

    const { full } = await getFxData();

    // const eurUsdObservations = full.filter(
    //   (observation) => observation.pair === "EUR/USD",
    // )
    // await injectEurUsdFull({
    //   indicator: "eur_usd",
    //   seriesId: "EURUSD",
    //   observations: eurUsdObservations,
    // })

    const gbpUsdObservations = full.filter(
      (observation) => observation.pair === "GBP/USD",
    )
    if (gbpUsdObservations.length === 0) {
      throw new Error("No GBP/USD observations found")
    }
    await injectGbpUsdFull({
      indicator: "gbp_usd",
      seriesId: "GBPUSD",
      observations: gbpUsdObservations,
    })

    // const usdJpyObservations = full.filter(
    //   (observation) => observation.pair === "USD/JPY",
    // )
    // if (usdJpyObservations.length === 0) {
    //   throw new Error("No USD/JPY observations found")
    // }
    // await injectUsdJpyFull({
    //   indicator: "usd_jpy",
    //   seriesId: "USDJPY",
    //   observations: usdJpyObservations,
    // })

    // const usdChfObservations = full.filter(
    //   (observation) => observation.pair === "USD/CHF",
    // )
    // if (usdChfObservations.length === 0) {
    //   throw new Error("No USD/CHF observations found")
    // }
    // await injectUsdChfFull({
    //   indicator: "usd_chf",
    //   seriesId: "USDCHF",
    //   observations: usdChfObservations,
    // })

    // const audUsdObservations = full.filter(
    //   (observation) => observation.pair === "AUD/USD",
    // )
    // if (audUsdObservations.length === 0) {
    //   throw new Error("No AUD/USD observations found")
    // }
    // await injectAudUsdFull({
    //   indicator: "aud_usd",
    //   seriesId: "AUDUSD",
    //   observations: audUsdObservations,
    // })

    // const usdCadObservations = full.filter(
    //   (observation) => observation.pair === "USD/CAD",
    // )
    // if (usdCadObservations.length === 0) {
    //   throw new Error("No USD/CAD observations found")
    // }
    // await injectUsdCadFull({
    //   indicator: "usd_cad",
    //   seriesId: "USDCAD",
    //   observations: usdCadObservations,
    // })

    // const nzdUsdObservations = full.filter(
    //   (observation) => observation.pair === "NZD/USD",
    // )
    // if (nzdUsdObservations.length === 0) {
    //   throw new Error("No NZD/USD observations found")
    // }
    // await injectNzdUsdFull({
    //   indicator: "nzd_usd",
    //   seriesId: "NZDUSD",
    //   observations: nzdUsdObservations,
    // })











    console.log("Full Injection complete");
  };
  

  runFullInjection()
  .catch((error) => {
    console.error("Full Injection failed:", error);
    process.exitCode = 1;
  })