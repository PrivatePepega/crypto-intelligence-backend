


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
      // Global risk / equities
      "SP500",
      "NASDAQCOM",
      "DJIA",
      "^RUT",
      "VIXCLS",

      // Dollar / FX
      "DTWEXBGS",
      "DTWEXAFEGS",
      "DTWEXEMEGS",
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "USDCAD",
      "AUDUSD",
      "NZDUSD",

      // Interest rates
      "DFF",
      "DGS2",
      "DGS5",
      "DGS10",
      "DFII10",

      // Credit / financial stress
      "BAMLH0A0HYM2",
      "BAMLC0A0CM",

      // Market sentiment / risk appetite
      "cnn_fear_greed",
      "cnn_market_volatility_vix_50",
      "cnn_safe_haven_demand",
      "cnn_put_call_options",
      "cnn_stock_price_breadth",
      "aaii_sentiment",

      // Commodity-related positioning
      "ig_wti_crude_oil",
      "ig_brent_crude_oil",
      "ig_gold",
      "ig_silver",

      // FX / rates futures positioning
      "cftc_usd_index",
      "cftc_euro_fx",
      "cftc_japanese_yen",
      "cftc_ust_10y",
      "cftc_ust_2y",

      // Economic activity
      "INDPRO",
      "RSAFS",
      "GDPC1",
      "A191RL1Q225SBEA",
    ],

    tools: [
      "cvBreaking",
      "newsflashGetEvents",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "marketauxNewsSearch",
      "newsflashSearchArticles",
      "newsDataLatestNews",
      "webSearchTool",
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
      // Equities
      "SP500",
      "NASDAQCOM",
      "DJIA",
      "^RUT",

      // Volatility / breadth / sentiment
      "VIXCLS",
      "cnn_fear_greed",
      "cnn_market_momentum_sp125",
      "cnn_market_volatility_vix_50",
      "cnn_put_call_options",
      "cnn_stock_price_breadth",
      "cnn_safe_haven_demand",
      "aaii_sentiment",

      // Treasury curve
      "DTB3",
      "DGS2",
      "DGS5",
      "DGS10",
      "DFII10",

      // Credit
      "BAMLH0A0HYM2",
      "BAMLC0A0CM",

      // Dollar
      "DTWEXBGS",
      "DTWEXAFEGS",
      "DTWEXEMEGS",

      // Major FX
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "USDCAD",
      "AUDUSD",
      "NZDUSD",

      // Futures positioning
      "cftc_sp500",
      "cftc_nasdaq",
      "cftc_usd_index",
      "cftc_ust_10y",
      "cftc_ust_2y",
      "cftc_euro_fx",
      "cftc_japanese_yen",

      // Retail positioning
      "ig_sp500",
      "ig_nasdaq",
      "ig_dow_jones",
      "ig_euro_usd",
      "ig_gbp_usd",
      "ig_usd_jpy",
    ],

    tools: [
      "newsMarketsNewsTool",
      "cvBreaking",
      "marketauxNewsSearch",
      "newsDataMarketNews",
      "newsflashGetEvents",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "newsflashSearchArticles",
      "webSearchTool",
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
      // Monetary policy / liquidity
      "DFF",
      "WALCL",
      "WRESBAL",
      "RRPONTSYD",
      "M2SL",

      // Inflation
      "CPIAUCSL",
      "CPILFESL",
      "PCE",
      "PCEPILFE",
      "T5YIE",
      "T10YIE",
      "PPIACO",

      // Employment
      "PAYEMS",
      "UNRATE",
      "ICSA",
      "JTSJOL",
      "CIVPART",
      "CES0500000003",

      // Growth / economic activity
      "GDPC1",
      "A191RL1Q225SBEA",
      "INDPRO",
      "RSAFS",
      "PI",
      "UMCSENT",

      // Housing
      "PERMIT",
      "HOUST",
      "EXHOSLUSM495S",
      "CSUSHPINSA",
      "MORTGAGE30US",

      // Treasury curve
      "DTB3",
      "DGS2",
      "DGS5",
      "DGS10",
      "DFII10",

      // Dollar / financial conditions
      "DTWEXBGS",
      "DTWEXAFEGS",
      "DTWEXEMEGS",
      "BAMLH0A0HYM2",
      "BAMLC0A0CM",

      // Market response
      "SP500",
      "NASDAQCOM",
      "VIXCLS",

      // Investor expectations
      "aaii_sentiment",
      "cnn_fear_greed",
    ],

    tools: [
      "newsflashGetEvents",
      "cvBreaking",
      "newsDataMarketNews",
      "marketauxNewsSearch",
      "newsMarketsNewsTool",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "newsflashSearchArticles",
      "webSearchTool",
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
      // Commodity retail positioning
      "ig_wti_crude_oil",
      "ig_brent_crude_oil",
      "ig_gold",
      "ig_silver",

      // Commodity-sensitive FX
      "AUDUSD",
      "NZDUSD",
      "USDCAD",

      // Dollar
      "DTWEXBGS",
      "DTWEXAFEGS",
      "DTWEXEMEGS",

      // Macro demand
      "GDPC1",
      "A191RL1Q225SBEA",
      "INDPRO",
      "RSAFS",
      "PI",

      // Inflation
      "CPIAUCSL",
      "CPILFESL",
      "PCE",
      "PCEPILFE",
      "PPIACO",

      // Rates / financial conditions
      "DFF",
      "DGS2",
      "DGS10",
      "DFII10",
      "VIXCLS",

      // Broader market risk
      "SP500",
      "NASDAQCOM",

      // Relevant positioning
      "cftc_usd_index",
      "cftc_ust_10y",
      "cftc_ust_2y",

      // Related FX positioning
      "ig_aud_usd",
      "ig_usd_cad",
    ],

    tools: [
      "cvBreaking",
      "newsflashGetEvents",
      "newsDataMarketNews",
      "newsMarketsNewsTool",
      "marketauxNewsSearch",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "newsflashSearchArticles",
      "webSearchTool",
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
      // Overall crypto market
      "coinmarketcap_crypto_market_metrics",
      "alternative_crypto_fear_greed",
      "coinmarketcap_altcoin_season",

      // Major crypto positioning
      "binance_btcusdt",
      "binance_ethusdt",
      "binance_solusdt",

      // Additional major asset positioning
      "binance_bnbusdt",
      "binance_xrpusdt",
      "binance_dogeusdt",
      "binance_linkusdt",
      "binance_aaveusdt",

      // Institutional flows
      "spot_etf_btc",
      "spot_etf_eth",
      "spot_etf_sol",
      "spot_etf_xrp",
      "spot_etf_doge",
      "spot_etf_link",

      // Futures positioning
      "cftc_bitcoin",
      "cftc_ethereum",
      "cftc_micro_ethereum",

      // Traditional risk environment
      "SP500",
      "NASDAQCOM",
      "^RUT",
      "VIXCLS",

      // Rates / liquidity
      "DFF",
      "DGS2",
      "DGS10",
      "DFII10",
      "M2SL",
      "RRPONTSYD",

      // Dollar
      "DTWEXBGS",
      "DTWEXAFEGS",

      // Macro environment
      "CPIAUCSL",
      "PCE",
      "PAYEMS",
      "UNRATE",

      // Cross-asset sentiment
      "cnn_fear_greed",
      "cnn_market_volatility_vix_50",
      "cnn_safe_haven_demand",
      "aaii_sentiment",

      // Precious-metal / defensive context
      "ig_gold",
    ],

    tools: [
      "cvBreaking",
      "cvTrending",
      "cvBitcoinNews",
      "cvDefi",
      "finnhubCryptoNews",
      "newsDataCryptoNews",
      "cvNews",
      "cvSearch",
      "marketauxNewsSearch",
      "newsflashGetEvents",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "newsflashSearchArticles",
      "webSearchTool",
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
      // Technology / equity market
      "NASDAQCOM",
      "SP500",
      "^RUT",

      // Market risk
      "VIXCLS",
      "cnn_market_momentum_sp125",
      "cnn_market_volatility_vix_50",
      "cnn_stock_price_breadth",
      "cnn_put_call_options",

      // Interest-rate environment
      "DFF",
      "DTB3",
      "DGS2",
      "DGS5",
      "DGS10",
      "DFII10",

      // Credit / capital conditions
      "BAMLH0A0HYM2",
      "BAMLC0A0CM",

      // Dollar
      "DTWEXBGS",
      "DTWEXAFEGS",
      "DTWEXEMEGS",

      // Industrial activity
      "INDPRO",
      "RSAFS",
      "PI",

      // Economic growth
      "GDPC1",
      "A191RL1Q225SBEA",

      // Consumer environment
      "UMCSENT",
      "CPIAUCSL",
      "PCE",

      // Labor market
      "PAYEMS",
      "UNRATE",
      "JTSJOL",
      "CES0500000003",

      // Investor sentiment / positioning
      "aaii_sentiment",
      "cnn_fear_greed",

      // Technology-heavy market positioning
      "cftc_nasdaq",
      "cftc_sp500",
      "cftc_ust_10y",
      "cftc_ust_2y",
      "ig_nasdaq",
      "ig_sp500",

      // Global technology / commodity sensitivity
      "AUDUSD",
      "USDJPY",
    ],

    tools: [
      "cvBreaking",
      "cvTrending",
      "newsflashGetEvents",
      "newsDataLatestNews",
      "marketauxNewsSearch",
      "newsMarketsNewsTool",
      "newsDataMarketNews",
      "currentsNewsSearch",
      "wabbleImportantHeadlineSearch",
      "newsflashSearchArticles",
      "webSearchTool",
    ],

    limits: {
      maxToolCalls: 12,
      maxSameToolCalls: 2,
    },
  },
} satisfies Record<string, ObserverConfig>;


export type ObserverDomain =
  | "geopolitics"
  | "financial_markets"
  | "macro"
  | "commodities_energy"
  | "crypto"
  | "ai_technology_industry";

export type ObserverConfig = {
  domain: ObserverDomain;
  objective: string;
  categories: string[];
  foundationalData: string[];
  tools: string[];
  limits: {
    maxToolCalls: number;
    maxSameToolCalls: number;
  };
};