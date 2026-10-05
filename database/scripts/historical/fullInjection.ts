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
import { getRussell2000 } from "../../../collectors/FMP/russell2000Provider.js";
import { injectRussell2000Full } from "../../injection/historical/russell_2000.js";
import { getIgSentiment } from "../../../collectors/IG/getIgSentiment.js";
import { injectIgHistorical } from "../../injection/config/igSentimentHistorical.js";
import { IG_SENTIMENT_MARKETS } from "../../injection/config/igSentiment.js";
import { fetchBinancePositioning } from "../../../collectors/binance/binanceFetcher.js";
import { injectBinancePositioningFull } from "../../injection/config/binancePositioningHistorical.js";
import { BINANCE_POSITIONING_MARKETS } from "../../injection/config/binancePositioning.js";
import { fetchFearGreed } from "../../../collectors/alternative.me/fearGreedIndex.js";
import { injectAlternativeCryptoFearGreedHistorical } from "../../injection/historical/alternative_crypto_fear_greed.js";
import { fetchAltcoinSeason } from "../../../collectors/coinMarketCap/altSeasonIndex.js";
import { injectCoinMarketCapAltcoinSeasonHistorical } from "../../injection/historical/coinmarketcap_altcoin_season.js";
import { fetchCoinMarketCapGlobalMetrics } from "../../../collectors/coinMarketCap/cryptoMarketStats.js";
import { injectCoinMarketCapCryptoMarketMetricsHistorical } from "../../injection/historical/coinmarketcap_crypto_market_metrics.js";
import { collectAllSosoValueEtfs } from "../../../collectors/sosoValue/spotETFfetcher.js";
import { injectSpotEtfHistorical } from "../../injection/config/spotEtfHistorical.js";
import { SPOT_ETF_MARKETS } from "../../injection/config/spotEtf.js";
import { withRetry } from "../../../utils/retry.js";
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
import { getCnnFearGreed } from "../../../collectors/cnn/cnnFearGreed.js";
import { getAaiiSentiment } from "../../../collectors/aaii/aaiiSentiment.js";
import { getCftcTff } from "../../../collectors/CFTC/getCftc.js";
import { injectEurUsdFull } from "../../injection/historical/eur_usd.js";
import { injectGbpUsdFull } from "../../injection/historical/gbp_usd.js";
import { injectUsdJpyFull } from "../../injection/historical/usd_jpy.js";
import { injectUsdChfFull } from "../../injection/historical/usd_chf.js";
import { injectAudUsdFull } from "../../injection/historical/aud_usd.js";
import { injectUsdCadFull } from "../../injection/historical/usd_cad.js";
import { injectNzdUsdFull } from "../../injection/historical/nzd_usd.js";
import { injectGoldFull } from "../../injection/historical/gold.js";
import { injectSilverFull } from "../../injection/historical/silver.js";
import { injectWtiFull } from "../../injection/historical/wti.js";
import { injectBrentFull } from "../../injection/historical/brent.js";
import { injectNaturalGasFull } from "../../injection/historical/natural_gas.js";
import { injectCopperFull } from "../../injection/historical/copper.js";
import { injectAluminumFull } from "../../injection/historical/aluminum.js";
import { injectCnnFearGreedFull } from "../../injection/historical/cnn_fear_greed.js";
import { injectCnnMarketMomentumSp125Full } from "../../injection/historical/cnn_market_momentum_sp125.js";
import { injectCnnStockPriceBreadthFull } from "../../injection/historical/cnn_stock_price_breadth.js";
import { injectCnnPutCallOptionsFull } from "../../injection/historical/cnn_put_call_options.js";
import { injectCnnMarketVolatilityVix50Full } from "../../injection/historical/cnn_market_volatility_vix_50.js";
import { injectCnnSafeHavenDemandFull } from "../../injection/historical/cnn_safe_haven_demand.js";
import { injectAaiiSentimentFull } from "../../injection/historical/aaii_sentiment.js";
import { injectCftcBitcoinFull } from "../../injection/historical/cftc_bitcoin.js";
import { injectCftcSp500Full } from "../../injection/historical/cftc_sp500.js";
import { injectCftcNasdaqFull } from "../../injection/historical/cftc_nasdaq.js";
import { injectCftcUst2yNoteFull } from "../../injection/historical/cftc_ust_2y_note.js";
import { injectCftcUst10yNoteFull } from "../../injection/historical/cftc_ust_10y_note.js";
import { injectCftcEuroFxFull } from "../../injection/historical/cftc_euro_fx.js";
import { injectCftcJapaneseYenFull } from "../../injection/historical/cftc_japanese_yen.js";
import { injectCftcUsdIndexFull } from "../../injection/historical/cftc_usd_index.js";
import { injectCftcEthereumFull } from "../../injection/historical/cftc_ethereum.js";
import { injectCftcMicroEthereumFull } from "../../injection/historical/cftc_micro_ethereum.js";




const runFullInjection = async () => {
    console.log("Full Injection initialized");

    const fedRates = await getFederalFundsRate("full")
    await injectFederalFundsRateFull(fedRates)

    const twoYearTYields = await getTwoYearTreasuryYield("full")
    await injectTwoYearTreasuryYieldFull(twoYearTYields)

    const tenYeatTYields = await getTenYearTreasuryYield("full")
    await injectTenYearTreasuryYieldFull(tenYeatTYields)

    const tenYearBreakevenInflation = await getTenYearBreakevenInflation("full")
    await injectTenYearBreakevenInflationFull(tenYearBreakevenInflation)

    const realTenYearTreasuryYield = await getRealTenYearTreasuryYield("full")
    await injectRealTenYearTreasuryYieldFull(realTenYearTreasuryYield)

    const consumerPriceIndex = await getCpi("full")
    await injectConsumerPriceIndexFull(consumerPriceIndex)

    const coreCPI = await getCoreCpi("full")
    await injectCoreConsumerPriceIndexFull(coreCPI)

    const pce = await getPce("full")
    await injectPersonalConsumptionExpendituresFull(pce)

    const corePce = await getCorePce("full")
    await injectCorePersonalConsumptionExpendituresFull(corePce)

    const ppi = await getPpi("full")
    await injectProducerPriceIndexFull(ppi)

    const fiveYearInflationExpectations = await getFiveYearInflationExpectations("full")
    await injectFiveYearInflationExpectationsFull(fiveYearInflationExpectations)

    const unemploymentRate = await getUnemploymentRate("full")
    await injectUnemploymentRateFull(unemploymentRate)

    const laborForceParticipation = await getLaborForceParticipation("full")
    await injectLaborForceParticipationFull(laborForceParticipation)

    const nonFarmPayRolls = await getNonfarmPayrolls("full")
    await injectNonfarmPayrollsFull(nonFarmPayRolls)

    const averageHourlyEarning = await getAverageHourlyEarnings("full")
    await injectAverageHourlyEarningsFull(averageHourlyEarning)

    const jobOpenings = await getJobOpenings("full")
    await injectJobOpeningsFull(jobOpenings)
  
    const initialJoblessClaims = await getInitialJoblessClaims("full")
    await injectInitialJoblessClaimsFull(initialJoblessClaims)

    const realGDP = await getRealGdp("full")
    await injectRealGdpFull(realGDP)

    const realGDPGrowth = await getRealGdpGrowth("full")
    await injectRealGdpGrowthFull(realGDPGrowth)

    const industrialProduction = await getIndustrialProduction("full")
    await injectIndustrialProductionFull(industrialProduction)

    const retailSales = await getRetailSales("full")
    await injectRetailSalesFull(retailSales)

    const personalIncome = await getPersonalIncome("full")
    await injectPersonalIncomeFull(personalIncome)

    const m2MoneySupply = await getM2MoneySupply("full")
    await injectM2MoneySupplyFull(m2MoneySupply)

    const fedTotalAssets = await getFedTotalAssets("full")
    await injectFedTotalAssetsFull(fedTotalAssets)

    const reserveBalances = await getReserveBalances("full")
    await injectReserveBalancesFull(reserveBalances)

    const reverseRepoUsage = await getReverseRepoUsage("full")
    await injectReverseRepoUsageFull(reverseRepoUsage)

    const vix = await getVix("full")
    await injectVixFull(vix)

    const highYieldCreditSpread = await getHighYieldCreditSpread("full")
    await injectHighYieldCreditSpreadFull(highYieldCreditSpread)

    const investmentGradeCreditSpread = await getInvestmentGradeCreditSpread("full")
    await injectInvestmentGradeCreditSpreadFull(investmentGradeCreditSpread)

    const consumerSentiment = await getConsumerSentiment("full")
    await injectConsumerSentimentFull(consumerSentiment)

    const housingStarts = await getHousingStarts("full")
    await injectHousingStartsFull(housingStarts)

    const buildingPermits = await getBuildingPermits("full")
    await injectBuildingPermitsFull(buildingPermits)

    const existingHomeSales = await getExistingHomeSales("full")
    await injectExistingHomeSalesFull(existingHomeSales)

    const mortgageRate = await getMortgageRate("full")
    await injectMortgageRateFull(mortgageRate)

    const homePriceIndex = await getHomePriceIndex("full")
    await injectHomePriceIndexFull(homePriceIndex)

    const sp500 = await getSp500("full")
    await injectSp500Full(sp500)

    const nasdaqComposite = await getNasdaqComposite("full")
    await injectNasdaqCompositeFull(nasdaqComposite)

    const dowJones = await getDowJones("full")
    await injectDowJonesFull(dowJones)

    const broadUsdIndex = await getBroadUsdIndex("full")
    await injectBroadUsdIndexFull(broadUsdIndex)

    const realBroadUsdIndex = await getRealBroadUsdIndex("full")
    await injectRealBroadUsdIndexFull(realBroadUsdIndex)

    const advancedEconomyUsdIndex = await getAdvancedEconomyUsdIndex("full")
    await injectAdvancedEconomyUsdIndexFull(advancedEconomyUsdIndex)

    const emergingMarketUsdIndex = await getEmergingMarketUsdIndex("full")
    await injectEmergingMarketUsdIndexFull(emergingMarketUsdIndex)

    const threeMonthTreasury = await get3mTreasury("full")
    await injectThreeMonthTreasuryFull(threeMonthTreasury)

    const fiveYearTreasury = await get5yTreasury("full")
    await injectFiveYearTreasuryFull(fiveYearTreasury)

    const { full: fullFxData } = await getFxData();

    const eurUsdObservations = fullFxData.filter(
      (observation) => observation.pair === "EUR/USD",
    )
    await injectEurUsdFull({
      indicator: "eur_usd",
      seriesId: "EURUSD",
      observations: eurUsdObservations,
    })

    const gbpUsdObservations = fullFxData.filter(
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

    const usdJpyObservations = fullFxData.filter(
      (observation) => observation.pair === "USD/JPY",
    )
    if (usdJpyObservations.length === 0) {
      throw new Error("No USD/JPY observations found")
    }
    await injectUsdJpyFull({
      indicator: "usd_jpy",
      seriesId: "USDJPY",
      observations: usdJpyObservations,
    })

    const usdChfObservations = fullFxData.filter(
      (observation) => observation.pair === "USD/CHF",
    )
    if (usdChfObservations.length === 0) {
      throw new Error("No USD/CHF observations found")
    }
    await injectUsdChfFull({
      indicator: "usd_chf",
      seriesId: "USDCHF",
      observations: usdChfObservations,
    })

    const audUsdObservations = fullFxData.filter(
      (observation) => observation.pair === "AUD/USD",
    )
    if (audUsdObservations.length === 0) {
      throw new Error("No AUD/USD observations found")
    }
    await injectAudUsdFull({
      indicator: "aud_usd",
      seriesId: "AUDUSD",
      observations: audUsdObservations,
    })

    const usdCadObservations = fullFxData.filter(
      (observation) => observation.pair === "USD/CAD",
    )
    if (usdCadObservations.length === 0) {
      throw new Error("No USD/CAD observations found")
    }
    await injectUsdCadFull({
      indicator: "usd_cad",
      seriesId: "USDCAD",
      observations: usdCadObservations,
    })

    const nzdUsdObservations = fullFxData.filter(
      (observation) => observation.pair === "NZD/USD",
    )
    if (nzdUsdObservations.length === 0) {
      throw new Error("No NZD/USD observations found")
    }
    await injectNzdUsdFull({
      indicator: "nzd_usd",
      seriesId: "NZDUSD",
      observations: nzdUsdObservations,
    })

    const { full: fullCommodityData } = await getCommodityData();

    const goldObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "gold",
    )
    if (goldObservations.length === 0) {
      throw new Error("No gold observations found")
    }
    await injectGoldFull({
      indicator: "gold",
      seriesId: "GOLD",
      observations: goldObservations,
    })

    const silverObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "silver",
    )
    if (silverObservations.length === 0) {
      throw new Error("No silver observations found")
    }
    await injectSilverFull({
      indicator: "silver",
      seriesId: "SILVER",
      observations: silverObservations,
    })

    const wtiObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "wti",
    )
    if (wtiObservations.length === 0) {
      throw new Error("No WTI observations found")
    }
    await injectWtiFull({
      indicator: "wti",
      seriesId: "WTI",
      observations: wtiObservations,
    })

    const brentObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "brent",
    )
    if (brentObservations.length === 0) {
      throw new Error("No Brent observations found")
    }
    await injectBrentFull({
      indicator: "brent",
      seriesId: "BRENT",
      observations: brentObservations,
    })

    const naturalGasObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "natural_gas",
    )
    if (naturalGasObservations.length === 0) {
      throw new Error("No natural gas observations found")
    }
    await injectNaturalGasFull({
      indicator: "natural_gas",
      seriesId: "NATURAL_GAS",
      observations: naturalGasObservations,
    })

    const copperObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "copper",
    )
    if (copperObservations.length === 0) {
      throw new Error("No copper observations found")
    }
    await injectCopperFull({
      indicator: "copper",
      seriesId: "COPPER",
      observations: copperObservations,
    })

    const aluminumObservations = fullCommodityData.filter(
      (observation) => observation.commodity === "aluminum",
    )
    if (aluminumObservations.length === 0) {
      throw new Error("No aluminum observations found")
    }
    await injectAluminumFull({
      indicator: "aluminum",
      seriesId: "ALUMINUM",
      observations: aluminumObservations,
    })

    const cnnIndicators = await getCnnFearGreed("full");

    const cnnFearGreed = cnnIndicators.cnn_fear_greed;
    if (!cnnFearGreed || cnnFearGreed.observations.length === 0) {
      throw new Error("No CNN Fear & Greed observations found");
    }
    await injectCnnFearGreedFull(cnnFearGreed);

    const cnnMarketMomentumSp125 =
      cnnIndicators.cnn_market_momentum_sp125;
    if (
      !cnnMarketMomentumSp125 ||
      cnnMarketMomentumSp125.observations.length === 0
    ) {
      throw new Error(
        "No CNN Market Momentum S&P 125 observations found",
      );
    }
    await injectCnnMarketMomentumSp125Full(cnnMarketMomentumSp125);

    const cnnStockPriceBreadth = cnnIndicators.cnn_stock_price_breadth;
    if (
      !cnnStockPriceBreadth ||
      cnnStockPriceBreadth.observations.length === 0
    ) {
      throw new Error(
        "No CNN Stock Price Breadth observations found",
      );
    }
    await injectCnnStockPriceBreadthFull(cnnStockPriceBreadth);

    const cnnPutCallOptions = cnnIndicators.cnn_put_call_options;
    if (
      !cnnPutCallOptions ||
      cnnPutCallOptions.observations.length === 0
    ) {
      throw new Error(
        "No CNN Put/Call Options observations found",
      );
    }
    await injectCnnPutCallOptionsFull(cnnPutCallOptions);

    const cnnMarketVolatilityVix50 =
      cnnIndicators.cnn_market_volatility_vix_50;
    if (
      !cnnMarketVolatilityVix50 ||
      cnnMarketVolatilityVix50.observations.length === 0
    ) {
      throw new Error(
        "No CNN Market Volatility VIX 50 observations found",
      );
    }
    await injectCnnMarketVolatilityVix50Full(cnnMarketVolatilityVix50);

    const cnnSafeHavenDemand = cnnIndicators.cnn_safe_haven_demand;
    if (
      !cnnSafeHavenDemand ||
      cnnSafeHavenDemand.observations.length === 0
    ) {
      throw new Error(
        "No CNN Safe Haven Demand observations found",
      );
    }
    await injectCnnSafeHavenDemandFull(cnnSafeHavenDemand);

    const aaiiSentiment = await getAaiiSentiment("full");

    if (aaiiSentiment.observations.length === 0) {
      throw new Error("No AAII Sentiment observations found");
    }

    await injectAaiiSentimentFull(aaiiSentiment);

    const cftcTff = await getCftcTff("full");

    if (cftcTff.observations.length === 0) {
      throw new Error("No CFTC TFF observations found");
    }

    await injectCftcBitcoinFull(cftcTff);
    await injectCftcSp500Full(cftcTff);
    await injectCftcNasdaqFull(cftcTff);
    await injectCftcUst2yNoteFull(cftcTff);
    await injectCftcUst10yNoteFull(cftcTff);
    await injectCftcEuroFxFull(cftcTff);
    await injectCftcJapaneseYenFull(cftcTff);
    await injectCftcUsdIndexFull(cftcTff);
    await injectCftcEthereumFull(cftcTff);
    await injectCftcMicroEthereumFull(cftcTff);

    const russell2000 = await getRussell2000("full");
    await injectRussell2000Full(russell2000);

    const igSentiment = await getIgSentiment("full");
    await injectIgHistorical(IG_SENTIMENT_MARKETS.sp500, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.gold, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.nasdaq, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.dowJones, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.silver, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.wti, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.brent, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.eurUsd, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.gbpUsd, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.usdJpy, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.audUsd, igSentiment);
    await injectIgHistorical(IG_SENTIMENT_MARKETS.usdCad, igSentiment);

    const binancePositioning = await fetchBinancePositioning("full");
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.btcusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.ethusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.solusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.bnbusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.xrpusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.dogeusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.linkusdt, binancePositioning);
    await injectBinancePositioningFull(BINANCE_POSITIONING_MARKETS.aaveusdt, binancePositioning);

    const alternativeFearGreed = await fetchFearGreed();
    await injectAlternativeCryptoFearGreedHistorical({
      observations: [alternativeFearGreed],
    });

    const altcoinSeason = await withRetry(
      () => fetchAltcoinSeason("full"),
      {
        label: "CoinMarketCap altcoin season (historical)",
        attempts: 5,
        delayMs: 5000,
        isEmptyResult: (result) => result.observations.length === 0,
      },
    );

    await injectCoinMarketCapAltcoinSeasonHistorical({
      observations: altcoinSeason.observations,
      source: altcoinSeason.source,
    });

    const cmcMarketMetrics = await withRetry(
      () => fetchCoinMarketCapGlobalMetrics(),
      {
        label: "CoinMarketCap crypto market metrics (historical)",
        attempts: 5,
        delayMs: 5000,
        isEmptyResult: (result) => !Number.isFinite(result.totalMarketCap),
      },
    );

    await injectCoinMarketCapCryptoMarketMetricsHistorical({
      observations: [
        {
          ...cmcMarketMetrics,
          date: cmcMarketMetrics.observedAt.slice(0, 10),
        },
      ],
      source: cmcMarketMetrics.source,
    });

    const spotEtfs = await withRetry(
      () => collectAllSosoValueEtfs("full"),
      {
        label: "SoSoValue spot ETF (historical)",
        attempts: 5,
        delayMs: 5000,
        isEmptyResult: (result) =>
          result.every((etf) => etf.history.length === 0),
      },
    );

    for (const market of Object.values(SPOT_ETF_MARKETS)) {
      const payload = spotEtfs.find((etf) => etf.asset === market.symbol);

      if (!payload) {
        throw new Error(
          `SoSoValue returned no ${market.symbol} spot ETF data`,
        );
      }

      await injectSpotEtfHistorical(market, payload.history);
    }









    console.log("Full Injection complete");
  };
  

  runFullInjection()
  .catch((error) => {
    console.error("Full Injection failed:", error);
    process.exitCode = 1;
  })