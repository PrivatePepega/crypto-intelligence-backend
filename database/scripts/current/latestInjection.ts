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
import { getPersonalIncome } from "../../../collectors/fred/Growth Economy/personalIncome.js";
import { injectPersonalIncomeLatest } from "../../injection/current/personal_income.js";
import { getM2MoneySupply } from "../../../collectors/fred/Liquidity Financial Conditions/M2MoneySupply.js";
import { injectM2MoneySupplyLatest } from "../../injection/current/m2_money_supply.js";
import { getFedTotalAssets } from "../../../collectors/fred/Liquidity Financial Conditions/FedTotalAssets.js";
import { injectFedTotalAssetsLatest } from "../../injection/current/fed_total_assets.js";
import { getReserveBalances } from "../../../collectors/fred/Liquidity Financial Conditions/ReserveBalances.js";
import { injectReserveBalancesLatest } from "../../injection/current/reserve_balances.js";
import { getReverseRepoUsage } from "../../../collectors/fred/Liquidity Financial Conditions/ReverseRepoUsage.js";
import { injectReverseRepoUsageLatest } from "../../injection/current/reverse_repo_usage.js";
import { getVix } from "../../../collectors/fred/Risk Sentiment/VIX.js";
import { injectVixLatest } from "../../injection/current/vix.js";
import { getHighYieldCreditSpread } from "../../../collectors/fred/Risk Sentiment/High-YieldCreditSpread.js";
import { injectHighYieldCreditSpreadLatest } from "../../injection/current/high_yield_credit_spread.js";
import { getInvestmentGradeCreditSpread } from "../../../collectors/fred/Risk Sentiment/Investment-GradeCreditSpread.js";
import { injectInvestmentGradeCreditSpreadLatest } from "../../injection/current/investment_grade_credit_spread.js";
import { getConsumerSentiment } from "../../../collectors/fred/Risk Sentiment/ConsumerSentiment.js";
import { injectConsumerSentimentLatest } from "../../injection/current/consumer_sentiment.js";
import { getHousingStarts } from "../../../collectors/fred/Housing/HousingStarts.js";
import { injectHousingStartsLatest } from "../../injection/current/housing_starts.js";
import { getBuildingPermits } from "../../../collectors/fred/Housing/BuildingPermits.js";
import { injectBuildingPermitsLatest } from "../../injection/current/building_permits.js";
import { getExistingHomeSales } from "../../../collectors/fred/Housing/ExistingHomeSales.js";
import { injectExistingHomeSalesLatest } from "../../injection/current/existing_home_sales.js";
import { getMortgageRate } from "../../../collectors/fred/Housing/MortgageRate.js";
import { injectMortgageRateLatest } from "../../injection/current/mortgage_rate.js";
import { getHomePriceIndex } from "../../../collectors/fred/Housing/HomePriceIndex.js";
import { injectHomePriceIndexLatest } from "../../injection/current/home_price_index.js";
import { getSp500 } from "../../../collectors/fred/Market Health/snp500.js";
import { injectSp500Latest } from "../../injection/current/sp500.js";
import { getNasdaqComposite } from "../../../collectors/fred/Market Health/NASDAQComposite.js";
import { injectNasdaqCompositeLatest } from "../../injection/current/nasdaq_composite.js";
import { getDowJones } from "../../../collectors/fred/Market Health/DowJones.js";
import { injectDowJonesLatest } from "../../injection/current/dow_jones.js";
import { getRussell2000 } from "../../../collectors/FMP/russell2000Provider.js";
import { injectRussell2000Latest } from "../../injection/current/russell_2000.js";
import { getIgSentiment } from "../../../collectors/IG/getIgSentiment.js";
import { injectIgCurrent } from "../../injection/config/igSentimentCurrent.js";
import { IG_SENTIMENT_MARKETS } from "../../injection/config/igSentiment.js";
import { fetchBinancePositioning } from "../../../collectors/binance/binanceFetcher.js";
import { injectBinancePositioningLatest } from "../../injection/config/binancePositioningCurrent.js";
import { BINANCE_POSITIONING_MARKETS } from "../../injection/config/binancePositioning.js";
import { fetchFearGreed } from "../../../collectors/alternative.me/fearGreedIndex.js";
import { injectAlternativeCryptoFearGreedCurrent } from "../../injection/current/alternative_crypto_fear_greed.js";
import { fetchAltcoinSeason } from "../../../collectors/coinMarketCap/altSeasonIndex.js";
import { injectCoinMarketCapAltcoinSeasonCurrent } from "../../injection/current/coinmarketcap_altcoin_season.js";
import { fetchCoinMarketCapGlobalMetrics } from "../../../collectors/coinMarketCap/cryptoMarketStats.js";
import { injectCoinMarketCapCryptoMarketMetricsCurrent } from "../../injection/current/coinmarketcap_crypto_market_metrics.js";
import { collectAllSosoValueEtfs } from "../../../collectors/sosoValue/spotETFfetcher.js";
import { injectSpotEtfCurrent } from "../../injection/config/spotEtfCurrent.js";
import { SPOT_ETF_MARKETS } from "../../injection/config/spotEtf.js";
import { withRetry } from "../../../utils/retry.js";
import { getBroadUsdIndex } from "../../../collectors/fred/Market Health/Broad USD Index.js";
import { injectBroadUsdIndexLatest } from "../../injection/current/broad_usd_index.js";
import { getRealBroadUsdIndex } from "../../../collectors/fred/Market Health/Real Broad USD Index.js";
import { injectRealBroadUsdIndexLatest } from "../../injection/current/real_broad_usd_index.js";
import { getAdvancedEconomyUsdIndex } from "../../../collectors/fred/Market Health/Advanced Economy USD Index.js";
import { injectAdvancedEconomyUsdIndexLatest } from "../../injection/current/advanced_economy_usd_index.js";
import { getEmergingMarketUsdIndex } from "../../../collectors/fred/Market Health/Emerging Market USD Index.js";
import { injectEmergingMarketUsdIndexLatest } from "../../injection/current/emerging_market_usd_index.js";
import { get3mTreasury } from "../../../collectors/fred/Market Health/3M Treasury.js";
import { injectThreeMonthTreasuryLatest } from "../../injection/current/three_month_treasury.js";
import { get5yTreasury } from "../../../collectors/fred/Market Health/5Y Treasury.js";
import { injectFiveYearTreasuryLatest } from "../../injection/current/five_year_treasury.js";
import { getFxData } from "../../../collectors/alpha vantage/fx/fx.js";
import { getCommodityData } from "../../../collectors/alpha vantage/commodities/commodities.js";
import { getCnnFearGreed } from "../../../collectors/cnn/cnnFearGreed.js";
import { getAaiiSentiment } from "../../../collectors/aaii/aaiiSentiment.js";
import { getCftcTff } from "../../../collectors/CFTC/getCftc.js";
import { injectEurUsdLatest } from "../../injection/current/eur_usd.js";
import { injectGbpUsdLatest } from "../../injection/current/gbp_usd.js";
import { injectUsdJpyLatest } from "../../injection/current/usd_jpy.js";
import { injectUsdChfLatest } from "../../injection/current/usd_chf.js";
import { injectAudUsdLatest } from "../../injection/current/aud_usd.js";
import { injectUsdCadLatest } from "../../injection/current/usd_cad.js";
import { injectNzdUsdLatest } from "../../injection/current/nzd_usd.js";
import { injectGoldLatest } from "../../injection/current/gold.js";
import { injectSilverLatest } from "../../injection/current/silver.js";
import { injectWtiLatest } from "../../injection/current/wti.js";
import { injectBrentLatest } from "../../injection/current/brent.js";
import { injectNaturalGasLatest } from "../../injection/current/natural_gas.js";
import { injectCopperLatest } from "../../injection/current/copper.js";
import { injectAluminumLatest } from "../../injection/current/aluminum.js";
import { injectCnnFearGreedLatest } from "../../injection/current/cnn_fear_greed.js";
import { injectCnnMarketMomentumSp125Latest } from "../../injection/current/cnn_market_momentum_sp125.js";
import { injectCnnStockPriceBreadthLatest } from "../../injection/current/cnn_stock_price_breadth.js";
import { injectCnnPutCallOptionsLatest } from "../../injection/current/cnn_put_call_options.js";
import { injectCnnMarketVolatilityVix50Latest } from "../../injection/current/cnn_market_volatility_vix_50.js";
import { injectCnnSafeHavenDemandLatest } from "../../injection/current/cnn_safe_haven_demand.js";
import { injectAaiiSentimentLatest } from "../../injection/current/aaii_sentiment.js";
import { injectCftcBitcoinLatest } from "../../injection/current/cftc_bitcoin.js";
import { injectCftcSp500Latest } from "../../injection/current/cftc_sp500.js";
import { injectCftcNasdaqLatest } from "../../injection/current/cftc_nasdaq.js";
import { injectCftcUst2yNoteLatest } from "../../injection/current/cftc_ust_2y_note.js";
import { injectCftcUst10yNoteLatest } from "../../injection/current/cftc_ust_10y_note.js";
import { injectCftcEuroFxLatest } from "../../injection/current/cftc_euro_fx.js";
import { injectCftcJapaneseYenLatest } from "../../injection/current/cftc_japanese_yen.js";
import { injectCftcUsdIndexLatest } from "../../injection/current/cftc_usd_index.js";
import { injectCftcEthereumLatest } from "../../injection/current/cftc_ethereum.js";
import { injectCftcMicroEthereumLatest } from "../../injection/current/cftc_micro_ethereum.js";







const runLatestInjection = async () => {
  console.log("Latest injection initialized");

  const fedRates = await getFederalFundsRate("latest");
  await injectFederalFundsRateLatest(fedRates);

  const twoYearTYields = await getTwoYearTreasuryYield("latest");
  await injectTwoYearTreasuryYieldLatest(twoYearTYields);

  const tenYeatTYields = await getTenYearTreasuryYield("latest")
  await injectTenYearTreasuryYieldLatest(tenYeatTYields)

  const tenYearBreakevenInflation = await getTenYearBreakevenInflation("latest")
  await injectTenYearBreakevenInflationLatest(tenYearBreakevenInflation)

  const realTenYearTreasuryYield = await getRealTenYearTreasuryYield("latest")
  await injectRealTenYearTreasuryYieldLatest(realTenYearTreasuryYield)

  const consumerPriceIndex = await getCpi("latest")
  await injectConsumerPriceIndexLatest(consumerPriceIndex)

  const coreCPI = await getCoreCpi("latest")
  await injectCoreConsumerPriceIndexLatest(coreCPI)

  const pce = await getPce("latest")
  await injectPersonalConsumptionExpendituresLatest(pce)

  const corePce = await getCorePce("latest")
  await injectCorePersonalConsumptionExpendituresLatest(corePce)

  const ppi = await getPpi("latest")
  await injectProducerPriceIndexLatest(ppi)

  const fiveYearInflationExpectations = await getFiveYearInflationExpectations("latest")
  await injectFiveYearInflationExpectationsLatest(fiveYearInflationExpectations)

  const unemploymentRate = await getUnemploymentRate("latest")
  await injectUnemploymentRateLatest(unemploymentRate)

  const laborForceParticipation = await getLaborForceParticipation("latest")
  await injectLaborForceParticipationLatest(laborForceParticipation)

  const nonFarmPayRolls = await getNonfarmPayrolls("latest")
  await injectNonfarmPayrollsLatest(nonFarmPayRolls)

  const averageHourlyEarning = await getAverageHourlyEarnings("latest")
  await injectAverageHourlyEarningsLatest(averageHourlyEarning)

  const jobOpenings = await getJobOpenings("latest")
  await injectJobOpeningsLatest(jobOpenings)

  const initialJoblessClaims = await getInitialJoblessClaims("latest")
  await injectInitialJoblessClaimsLatest(initialJoblessClaims)

  const realGDP = await getRealGdp("latest")
  await injectRealGdpLatest(realGDP)

  const realGDPGrowth = await getRealGdpGrowth("latest")
  await injectRealGdpGrowthLatest(realGDPGrowth)

  const industrialProduction = await getIndustrialProduction("latest")
  await injectIndustrialProductionLatest(industrialProduction)

  const retailSales = await getRetailSales("latest")
  await injectRetailSalesLatest(retailSales)

  const personalIncome = await getPersonalIncome("latest")
  await injectPersonalIncomeLatest(personalIncome)

  const m2MoneySupply = await getM2MoneySupply("latest")
  await injectM2MoneySupplyLatest(m2MoneySupply)

  const fedTotalAssets = await getFedTotalAssets("latest")
  await injectFedTotalAssetsLatest(fedTotalAssets)

  const reserveBalances = await getReserveBalances("latest")
  await injectReserveBalancesLatest(reserveBalances)

  const reverseRepoUsage = await getReverseRepoUsage("latest")
  await injectReverseRepoUsageLatest(reverseRepoUsage)

  const vix = await getVix("latest")
  await injectVixLatest(vix)

  const highYieldCreditSpread = await getHighYieldCreditSpread("latest")
  await injectHighYieldCreditSpreadLatest(highYieldCreditSpread)

  const investmentGradeCreditSpread = await getInvestmentGradeCreditSpread("latest")
  await injectInvestmentGradeCreditSpreadLatest(investmentGradeCreditSpread)

  const consumerSentiment = await getConsumerSentiment("latest")
  await injectConsumerSentimentLatest(consumerSentiment)

  const housingStarts = await getHousingStarts("latest")
  await injectHousingStartsLatest(housingStarts)

  const buildingPermits = await getBuildingPermits("latest")
  await injectBuildingPermitsLatest(buildingPermits)

  const existingHomeSales = await getExistingHomeSales("latest")
  await injectExistingHomeSalesLatest(existingHomeSales)

  const mortgageRate = await getMortgageRate("latest")
  await injectMortgageRateLatest(mortgageRate)

  const homePriceIndex = await getHomePriceIndex("latest")
  await injectHomePriceIndexLatest(homePriceIndex)

  const sp500 = await getSp500("latest")
  await injectSp500Latest(sp500)

  const nasdaqComposite = await getNasdaqComposite("latest")
  await injectNasdaqCompositeLatest(nasdaqComposite)

  const dowJones = await getDowJones("latest")
  await injectDowJonesLatest(dowJones)

  const broadUsdIndex = await getBroadUsdIndex("latest")
  await injectBroadUsdIndexLatest(broadUsdIndex)

  const realBroadUsdIndex = await getRealBroadUsdIndex("latest")
  await injectRealBroadUsdIndexLatest(realBroadUsdIndex)

  const advancedEconomyUsdIndex = await getAdvancedEconomyUsdIndex("latest")
  await injectAdvancedEconomyUsdIndexLatest(advancedEconomyUsdIndex)

  const emergingMarketUsdIndex = await getEmergingMarketUsdIndex("latest")
  await injectEmergingMarketUsdIndexLatest(emergingMarketUsdIndex)

  const threeMonthTreasury = await get3mTreasury("latest")
  await injectThreeMonthTreasuryLatest(threeMonthTreasury)

  const fiveYearTreasury = await get5yTreasury("latest")
  await injectFiveYearTreasuryLatest(fiveYearTreasury)

  const { latest: fxData } = await getFxData();

  const eurUsdObservation = fxData.find(
    (observation) => observation?.pair === "EUR/USD",
  )
  
  if (!eurUsdObservation) {
    throw new Error("No USD/JPY observation found")
  }

  await injectEurUsdLatest({
    indicator: "eur_usd",
    seriesId: "EURUSD",
    observations: [eurUsdObservation],
  })

  const gbpUsdObservation = fxData.find(
    (observation) => observation?.pair === "GBP/USD",
  )

  if (!gbpUsdObservation) {
    throw new Error("No USD/JPY observation found")
  }

  await injectGbpUsdLatest({
    indicator: "gbp_usd",
    seriesId: "GBPUSD",
    observations: [gbpUsdObservation],
  })

  const usdJpyObservation = fxData.find(
    (observation) => observation?.pair === "USD/JPY",
  )
  if (!usdJpyObservation) {
    throw new Error("No USD/JPY observation found")
  }
  await injectUsdJpyLatest({
    indicator: "usd_jpy",
    seriesId: "USDJPY",
    observations: [usdJpyObservation],
  })

  const usdChfObservation = fxData.find(
    (observation) => observation?.pair === "USD/CHF",
  )
  if (!usdChfObservation) {
    throw new Error("No USD/CHF observation found")
  }
  await injectUsdChfLatest({
    indicator: "usd_chf",
    seriesId: "USDCHF",
    observations: [usdChfObservation],
  })

  const audUsdObservation = fxData.find(
    (observation) => observation?.pair === "AUD/USD",
  )
  if (!audUsdObservation) {
    throw new Error("No AUD/USD observation found")
  }
  await injectAudUsdLatest({
    indicator: "aud_usd",
    seriesId: "AUDUSD",
    observations: [audUsdObservation],
  })

  const usdCadObservation = fxData.find(
    (observation) => observation?.pair === "USD/CAD",
  )
  if (!usdCadObservation) {
    throw new Error("No USD/CAD observation found")
  }
  await injectUsdCadLatest({
    indicator: "usd_cad",
    seriesId: "USDCAD",
    observations: [usdCadObservation],
  })

  const nzdUsdObservation = fxData.find(
    (observation) => observation?.pair === "NZD/USD",
  )
  if (!nzdUsdObservation) {
    throw new Error("No NZD/USD observation found")
  }
  await injectNzdUsdLatest({
    indicator: "nzd_usd",
    seriesId: "NZDUSD",
    observations: [nzdUsdObservation],
  })

  const { latest: commodityData } = await getCommodityData();

  const goldObservation = commodityData.find(
    (observation) => observation.commodity === "gold",
  )
  if (!goldObservation) {
    throw new Error("No gold observation found")
  }
  await injectGoldLatest({
    indicator: "gold",
    seriesId: "GOLD",
    observations: [goldObservation],
  })

  const silverObservation = commodityData.find(
    (observation) => observation.commodity === "silver",
  )
  if (!silverObservation) {
    throw new Error("No silver observation found")
  }
  await injectSilverLatest({
    indicator: "silver",
    seriesId: "SILVER",
    observations: [silverObservation],
  })

  const wtiObservation = commodityData.find(
    (observation) => observation.commodity === "wti",
  )
  if (!wtiObservation) {
    throw new Error("No WTI observation found")
  }
  await injectWtiLatest({
    indicator: "wti",
    seriesId: "WTI",
    observations: [wtiObservation],
  })

  const brentObservation = commodityData.find(
    (observation) => observation.commodity === "brent",
  )
  if (!brentObservation) {
    throw new Error("No Brent observation found")
  }
  await injectBrentLatest({
    indicator: "brent",
    seriesId: "BRENT",
    observations: [brentObservation],
  })

  const naturalGasObservation = commodityData.find(
    (observation) => observation.commodity === "natural_gas",
  )
  if (!naturalGasObservation) {
    throw new Error("No natural gas observation found")
  }
  await injectNaturalGasLatest({
    indicator: "natural_gas",
    seriesId: "NATURAL_GAS",
    observations: [naturalGasObservation],
  })

  const copperObservation = commodityData.find(
    (observation) => observation.commodity === "copper",
  )
  if (!copperObservation) {
    throw new Error("No copper observation found")
  }
  await injectCopperLatest({
    indicator: "copper",
    seriesId: "COPPER",
    observations: [copperObservation],
  })

  const aluminumObservation = commodityData.find(
    (observation) => observation.commodity === "aluminum",
  )
  if (!aluminumObservation) {
    throw new Error("No aluminum observation found")
  }
  await injectAluminumLatest({
    indicator: "aluminum",
    seriesId: "ALUMINUM",
    observations: [aluminumObservation],
  })

  const cnnIndicators = await getCnnFearGreed("latest");

  const cnnFearGreed = cnnIndicators.cnn_fear_greed;
  const cnnFearGreedCurrent = cnnFearGreed?.historical;
  if (!cnnFearGreed || !cnnFearGreedCurrent) {
    throw new Error("No CNN Fear & Greed current observation found");
  }
  await injectCnnFearGreedLatest({
    indicator: cnnFearGreed.indicator,
    observations: [cnnFearGreedCurrent],
  });

  const cnnMarketMomentumSp125 =
    cnnIndicators.cnn_market_momentum_sp125;
  const cnnMarketMomentumSp125Current =
    cnnMarketMomentumSp125?.historical;
  if (!cnnMarketMomentumSp125 || !cnnMarketMomentumSp125Current) {
    throw new Error(
      "No CNN Market Momentum S&P 125 current observation found",
    );
  }
  await injectCnnMarketMomentumSp125Latest({
    indicator: cnnMarketMomentumSp125.indicator,
    observations: [cnnMarketMomentumSp125Current],
  });

  const cnnStockPriceBreadth = cnnIndicators.cnn_stock_price_breadth;
  const cnnStockPriceBreadthCurrent = cnnStockPriceBreadth?.historical;
  if (!cnnStockPriceBreadth || !cnnStockPriceBreadthCurrent) {
    throw new Error(
      "No CNN Stock Price Breadth current observation found",
    );
  }
  await injectCnnStockPriceBreadthLatest({
    indicator: cnnStockPriceBreadth.indicator,
    observations: [cnnStockPriceBreadthCurrent],
  });

  const cnnPutCallOptions = cnnIndicators.cnn_put_call_options;
  const cnnPutCallOptionsCurrent = cnnPutCallOptions?.historical;
  if (!cnnPutCallOptions || !cnnPutCallOptionsCurrent) {
    throw new Error(
      "No CNN Put/Call Options current observation found",
    );
  }
  await injectCnnPutCallOptionsLatest({
    indicator: cnnPutCallOptions.indicator,
    observations: [cnnPutCallOptionsCurrent],
  });

  const cnnMarketVolatilityVix50 =
    cnnIndicators.cnn_market_volatility_vix_50;
  const cnnMarketVolatilityVix50Current =
    cnnMarketVolatilityVix50?.historical;
  if (!cnnMarketVolatilityVix50 || !cnnMarketVolatilityVix50Current) {
    throw new Error(
      "No CNN Market Volatility VIX 50 current observation found",
    );
  }
  await injectCnnMarketVolatilityVix50Latest({
    indicator: cnnMarketVolatilityVix50.indicator,
    observations: [cnnMarketVolatilityVix50Current],
  });

  const cnnSafeHavenDemand = cnnIndicators.cnn_safe_haven_demand;
  const cnnSafeHavenDemandCurrent = cnnSafeHavenDemand?.historical;
  if (!cnnSafeHavenDemand || !cnnSafeHavenDemandCurrent) {
    throw new Error(
      "No CNN Safe Haven Demand current observation found",
    );
  }
  await injectCnnSafeHavenDemandLatest({
    indicator: cnnSafeHavenDemand.indicator,
    observations: [cnnSafeHavenDemandCurrent],
  });

  const aaiiSentiment = await getAaiiSentiment("latest");
  const aaiiSentimentCurrent = aaiiSentiment.historical;

  if (!aaiiSentimentCurrent) {
    throw new Error("No AAII Sentiment current observation found");
  }

  await injectAaiiSentimentLatest(aaiiSentiment);

  const cftcTff = await getCftcTff("latest");

  if (cftcTff.observations.length === 0) {
    throw new Error("No CFTC TFF observations found");
  }

  await injectCftcBitcoinLatest(cftcTff);
  await injectCftcSp500Latest(cftcTff);
  await injectCftcNasdaqLatest(cftcTff);
  await injectCftcUst2yNoteLatest(cftcTff);
  await injectCftcUst10yNoteLatest(cftcTff);
  await injectCftcEuroFxLatest(cftcTff);
  await injectCftcJapaneseYenLatest(cftcTff);
  await injectCftcUsdIndexLatest(cftcTff);
  await injectCftcEthereumLatest(cftcTff);
  await injectCftcMicroEthereumLatest(cftcTff);


  const russell2000 = await getRussell2000("latest");
  await injectRussell2000Latest(russell2000);

  const igSentiment = await getIgSentiment("latest");
  await injectIgCurrent(IG_SENTIMENT_MARKETS.sp500, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.gold, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.nasdaq, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.dowJones, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.silver, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.wti, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.brent, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.eurUsd, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.gbpUsd, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.usdJpy, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.audUsd, igSentiment);
  await injectIgCurrent(IG_SENTIMENT_MARKETS.usdCad, igSentiment);

  const binancePositioning = await fetchBinancePositioning("latest");
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.btcusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.ethusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.solusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.bnbusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.xrpusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.dogeusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.linkusdt, binancePositioning);
  await injectBinancePositioningLatest(BINANCE_POSITIONING_MARKETS.aaveusdt, binancePositioning);

  const alternativeFearGreed = await fetchFearGreed();
  await injectAlternativeCryptoFearGreedCurrent({
    observation: alternativeFearGreed,
  });

  const altcoinSeason = await withRetry(
    () => fetchAltcoinSeason("latest"),
    {
      label: "CoinMarketCap altcoin season (current)",
      attempts: 5,
      delayMs: 5000,
      isEmptyResult: (result) => !Number.isFinite(result.index),
    },
  );

  await injectCoinMarketCapAltcoinSeasonCurrent(altcoinSeason);

  const cmcMarketMetrics = await withRetry(
    () => fetchCoinMarketCapGlobalMetrics(),
    {
      label: "CoinMarketCap crypto market metrics (current)",
      attempts: 5,
      delayMs: 5000,
      isEmptyResult: (result) => !Number.isFinite(result.totalMarketCap),
    },
  );

  await injectCoinMarketCapCryptoMarketMetricsCurrent(cmcMarketMetrics);

  const spotEtfs = await withRetry(
    () => collectAllSosoValueEtfs("latest"),
    {
      label: "SoSoValue spot ETF (current)",
      attempts: 5,
      delayMs: 5000,
      isEmptyResult: (result) =>
        result.every((etf) => !Number.isFinite(etf.current.netFlow)),
    },
  );

  for (const market of Object.values(SPOT_ETF_MARKETS)) {
    const payload = spotEtfs.find((etf) => etf.asset === market.symbol);

    if (!payload) {
      throw new Error(`SoSoValue returned no ${market.symbol} spot ETF data`);
    }

    await injectSpotEtfCurrent(market, payload.current);
  }














  // console.log("Result:", result);
  console.log("Latest injection complete");
};

runLatestInjection()
  .catch((error) => {
    console.error("Latest injection failed:", error);
    process.exitCode = 1;
  });