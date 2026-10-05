export const observerConfigs = {
  geopolitics: {
    domain: "geopolitics",

    objective:
      "Observe major geopolitical, political, diplomatic, and China-related developments and identify meaningful events or changes happening today.",

    categories: [
      "Geopolitics",
      "US Politics",
      "Trump / US Administration",
      "China",
      "Wars and Conflicts",
      "Diplomacy",
      "Sanctions and Trade",
      "Energy and Shipping",
    ],

    foundationalData: [
      "gold",
      "silver",
      "wti",
      "brent",
      "naturalGas",
      "vix",
      "sp500",
      "nasdaqComposite",
      "dowJones",
      "broadUsdIndex",
      "tenYearTreasuryYield",
      "two_year_treasury_yield",
      "realTenYearTreasuryYield",
      "cnnSafeHavenDemand",
      "cnnMarketVolatilityVix50",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },

  financialMarkets: {
    domain: "financial_markets",

    objective:
      "Observe global financial markets and identify meaningful changes, market stress, positioning shifts, and emerging market narratives happening today.",

    categories: [
      "Equities",
      "Bonds",
      "Credit",
      "Currencies",
      "Volatility",
      "Market Sentiment",
      "Market Structure",
    ],

    foundationalData: [
      "sp500",
      "nasdaqComposite",
      "dowJones",
      "russell2000",
      "vix",
      "cnnFearGreed",
      "cnnMarketMomentumSp125",
      "cnnMarketVolatilityVix50",
      "cnnPutCallOptions",
      "cnnStockPriceBreadth",
      "cnnSafeHavenDemand",
      "aaiiSentiment",
      "two_year_treasury_yield",
      "tenYearTreasuryYield",
      "highYieldCreditSpread",
      "investmentGradeCreditSpread",
      "broadUsdIndex",
      "gold",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },

  macro: {
    domain: "macro",

    objective:
      "Observe the global macroeconomic and monetary environment and identify meaningful changes in growth, inflation, employment, liquidity, interest rates, and central-bank policy.",

    categories: [
      "Federal Reserve",
      "Monetary Policy",
      "Inflation",
      "Employment",
      "Economic Growth",
      "Liquidity",
      "Interest Rates",
      "Consumer Activity",
    ],

    foundationalData: [
      "federalFundsRate",
      "fedTotalAssets",
      "reserveBalances",
      "reverseRepoUsage",

      "consumerPriceIndex",
      "coreConsumerPriceIndex",
      "personalConsumptionExpenditures",
      "corePersonalConsumptionExpenditures",
      "fiveYearInflationExpectations",
      "tenYearBreakevenInflation",

      "nonfarmPayrolls",
      "unemploymentRate",
      "initialJoblessClaims",
      "jobOpenings",
      "laborForceParticipation",
      "averageHourlyEarnings",

      "realGdpGrowth",
      "industrialProduction",
      "retailSales",
      "personalIncome",
      "consumerSentiment",

      "threeMonthTreasury",
      "two_year_treasury_yield",
      "fiveYearTreasury",
      "tenYearTreasuryYield",
      "realTenYearTreasuryYield",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },

  commoditiesEnergy: {
    domain: "commodities_energy",

    objective:
      "Observe commodities and energy markets and identify meaningful price movements, supply disruptions, demand changes, geopolitical effects, and market narratives.",

    categories: [
      "Crude Oil",
      "Natural Gas",
      "Precious Metals",
      "Industrial Metals",
      "Energy Supply",
      "Commodity Demand",
      "Commodity Trade",
    ],

    foundationalData: [
      "wti",
      "brent",
      "naturalGas",
      "gold",
      "silver",
      "copper",
      "aluminum",
      "broadUsdIndex",
      "usdCad",
      "audUsd",
      "nzdUsd",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },

  crypto: {
    domain: "crypto",

    objective:
      "Observe the cryptocurrency ecosystem and identify meaningful developments, market movements, institutional flows, regulatory events, security incidents, and emerging narratives happening today.",

    categories: [
      "Bitcoin",
      "Ethereum",
      "Altcoins",
      "DeFi",
      "Stablecoins",
      "Crypto Market Structure",
      "Regulation",
      "Blockchain Infrastructure",
      "Security",
      "Institutional Adoption",
    ],

    foundationalData: [
      "coinmarketcapGeneralCryptoMetric",
      "coinmarketcapAltSeasonFearGreed",
      "alternativeFearGreed",

      "binanceBtcusdt",
      "binanceEthusdt",
      "binanceSolusdt",

      "btcSpotEtf",
      "ethSpotEtf",
      "solSpotEtf",

      "cftcBitcoin",
      "cftcEthereum",

      "sp500",
      "nasdaqComposite",
      "vix",
      "tenYearTreasuryYield",
      "broadUsdIndex",
      "gold",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },

  aiTechnologyIndustry: {
    domain: "ai_technology_industry",

    objective:
      "Observe artificial intelligence, technology, and major industrial developments and identify meaningful changes in models, companies, infrastructure, capital, regulation, and industry activity.",

    categories: [
      "AI Models",
      "AI Companies",
      "AI Infrastructure",
      "Semiconductors",
      "Cloud Computing",
      "AI Capital",
      "AI Regulation",
      "Technology Industry",
      "Industrial Technology",
    ],

    foundationalData: [
      "nasdaqComposite",
      "sp500",
      "russell2000",
      "vix",
      "two_year_treasury_yield",
      "tenYearTreasuryYield",
      "broadUsdIndex",
      "industrialProduction",
      "retailSales",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },
};