import {
  htmlToPlainText,
  inferGranularity,
  normalizeCoinProfile,
  normalizeCoinsList,
  normalizeContractMappings,
  normalizeMarketChart,
  normalizeMarketMetrics,
  normalizeMarketRow,
  normalizeOhlcRows,
  normalizePlatformMappings,
  normalizeSearchCandidates,
  normalizeSocials,
  setCoinGeckoRequestsPerMinute,
} from "../collectors/assets/crypto/coingeckoFetchers.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const throws = (work: () => unknown): boolean => {
  try {
    work();
    return false;
  } catch {
    return true;
  }
};

// --------------------------------------------------
// Text normalization
// --------------------------------------------------

const description = htmlToPlainText(
  "<p>Ethereum is a <b>decentralized</b> platform &amp; more.</p><script>alert(1)</script>",
);
pass(
  "HTML description strips tags, scripts and decodes entities",
  description === "Ethereum is a decentralized platform & more.",
  description,
);
pass("HTML description collapses blank lines", htmlToPlainText("a<br><br><br>b") === "a\n\nb");
pass(
  "HTML description decodes numeric entities",
  htmlToPlainText("caf&#233; &#x2014; open") === "café — open",
);

// --------------------------------------------------
// Contract and platform mappings
// --------------------------------------------------

const contractMappings = normalizeContractMappings(
  {
    ethereum: "0xABC",
    solana: "So111",
    "": "ignored-native",
    avalanche: "0xDEF",
  },
  {
    ethereum: { decimal_place: 18, contract_address: "0xABC" },
    solana: { decimal_place: 9, contract_address: "So111" },
  },
);

pass("contract mappings skip the empty native platform", contractMappings.length === 3);
pass(
  "contract mappings carry provider source and unverified flag",
  contractMappings.every((row) => row.source === "CoinGecko" && row.verified === false),
);
const ethereumContract = contractMappings.find((row) => row.network === "ethereum");
pass(
  "contract mappings read decimal places from detail_platforms",
  ethereumContract?.decimalPlace === 18,
);
pass("contract mappings keep the platform address", ethereumContract?.address === "0xABC");
pass(
  "contract mappings fall back to detail contract_address",
  normalizeContractMappings({}, { base: { contract_address: "0x999" } })[0]?.address === "0x999",
);
pass(
  "contract mappings sort by network then address",
  contractMappings.map((row) => row.network).join(",") === "avalanche,ethereum,solana",
);
pass(
  "contract mappings skip entries without an address",
  normalizeContractMappings({ ethereum: "", solana: null }).length === 0,
);

const platforms = normalizePlatformMappings({
  ethereum: "0xAAA",
  solana: "",
  base: "0xBBB",
  ethereum_duplicate: "0xAAA",
});
pass("platform mappings skip empty addresses", platforms.length === 3);
pass(
  "platform mappings preserve network and address",
  platforms[0]?.network === "base" && platforms[0]?.address === "0xBBB",
);

// --------------------------------------------------
// Socials
// --------------------------------------------------

const socials = normalizeSocials({
  homepage: ["https://ethereum.org", "", "https://ethereum.org"],
  whitepaper: "https://ethereum.org/whitepaper",
  blockchain_site: ["https://etherscan.io"],
  official_forum_url: ["https://forum.ethereum.org"],
  chat_url: ["https://discord.gg/ethereum"],
  announcement_url: [],
  twitter_screen_name: "ethereum",
  telegram_channel_identifier: "",
  subreddit_url: "https://reddit.com/r/ethereum",
  repos_url: {
    github: ["https://github.com/ethereum/go-ethereum"],
    bitbucket: [],
  },
});
pass("socials keep unique homepages", socials.homepage.join(",") === "https://ethereum.org");
pass("socials keep the whitepaper", socials.whitepaper === "https://ethereum.org/whitepaper");
pass("socials keep twitter handle", socials.twitter === "ethereum");
pass("socials turn empty telegram into null", socials.telegram === null);
pass("socials keep github repositories", socials.repos.github.length === 1);
pass("socials default missing arrays to empty", normalizeSocials(undefined).chatUrls.length === 0);

// --------------------------------------------------
// Market metrics
// --------------------------------------------------

const marketMetrics = normalizeMarketMetrics(
  {
    current_price: { usd: 2000, eur: 1800 },
    market_cap: { usd: 240_000_000_000 },
    fully_diluted_valuation: { usd: null },
    market_cap_rank: 2,
    total_volume: { usd: "10,000,000,000" },
    high_24h: { usd: 2050 },
    low_24h: { usd: 1950 },
    price_change_24h: { usd: 50 },
    price_change_percentage_24h: 9.9,
    price_change_percentage_24h_in_currency: { usd: 2.5 },
    price_change_percentage_7d_in_currency: { usd: 5.1 },
    price_change_percentage_30d_in_currency: { usd: -1.2 },
    market_cap_change_24h: { usd: 1_000_000 },
    market_cap_change_percentage_24h: 0.5,
    ath: { usd: 4878 },
    ath_date: { usd: "2021-11-10T14:24:11.849Z" },
    ath_change_percentage: { usd: -59 },
    atl: { usd: 0.43 },
    atl_date: { usd: "2015-10-20T00:00:00.000Z" },
    atl_change_percentage: { usd: 460_000 },
    circulating_supply: 120_000_000,
    total_supply: 120_000_000,
    max_supply: null,
    max_supply_infinite: true,
    last_updated: "2026-10-27T12:00:00.000Z",
  },
  "usd",
);

pass(
  "market metrics narrow currency values to the quote currency",
  marketMetrics.currentPrice === 2000,
);
pass("market metrics keep the market cap rank", marketMetrics.marketCapRank === 2);
pass(
  "market metrics accept comma-formatted numeric strings",
  marketMetrics.totalVolume === 10_000_000_000,
);
pass(
  "market metrics prefer the in-currency 24h change",
  marketMetrics.priceChangePercentage24h === 2.5,
);
pass(
  "market metrics read the 7d and 30d in-currency changes",
  marketMetrics.priceChangePercentage7d === 5.1 && marketMetrics.priceChangePercentage30d === -1.2,
);
pass(
  "market metrics normalize ATH dates to ISO",
  marketMetrics.athDate === "2021-11-10T14:24:11.849Z",
);
pass("market metrics keep a null max supply", marketMetrics.maxSupply === null);
pass("market metrics record infinite max supply", marketMetrics.maxSupplyInfinite === true);
pass(
  "market metrics leave missing fields null",
  normalizeMarketMetrics({}, "usd").currentPrice === null,
);
pass(
  "market metrics fall back to the plain 24h change",
  normalizeMarketMetrics({ price_change_percentage_24h: 1.5 }, "usd").priceChangePercentage24h ===
    1.5,
);

// --------------------------------------------------
// Coin profile
// --------------------------------------------------

const profilePayload = {
  id: "ethereum",
  symbol: "eth",
  name: "Ethereum",
  asset_platform_id: "ethereum",
  platforms: { ethereum: "0x0000000000000000000000000000000000000000" },
  detail_platforms: {
    ethereum: {
      decimal_place: 18,
      contract_address: "0x0000000000000000000000000000000000000000",
    },
  },
  description: {
    en: "<p>Ethereum is a <b>decentralized</b> platform &amp; more.</p><script>alert(1)</script>",
  },
  image: { large: "https://assets.coingecko.com/eth/large.png", small: "small.png" },
  categories: ["Smart Contract Platform", "Layer 1 (L1)"],
  links: {
    homepage: ["https://ethereum.org"],
    whitepaper: "https://ethereum.org/whitepaper",
    blockchain_site: ["https://etherscan.io"],
    official_forum_url: [],
    chat_url: [],
    announcement_url: [],
    twitter_screen_name: "ethereum",
    telegram_channel_identifier: null,
    subreddit_url: "https://reddit.com/r/ethereum",
    repos_url: { github: [], bitbucket: [] },
  },
  genesis_date: "2015-07-30",
  hashing_algorithm: null,
  block_time_in_minutes: 0.2,
  has_supply_breakdown: true,
  market_data: {
    current_price: { usd: 2000 },
    market_cap: { usd: 240_000_000_000 },
    market_cap_rank: 2,
    total_volume: { usd: 10_000_000_000 },
    circulating_supply: 120_000_000,
    total_supply: 120_000_000,
    max_supply: null,
    last_updated: "2026-10-27T12:00:00.000Z",
  },
  last_updated: "2026-10-27T12:00:00.000Z",
};

const profile = normalizeCoinProfile(profilePayload, {
  sourceUrl: "https://api.coingecko.com/api/v3/coins/ethereum",
  vsCurrency: "usd",
  fetchedAt: "2026-10-27T12:00:05.000Z",
});

pass(
  "profile uses the stable id as the external key",
  profile.asset.externalIds.coingecko_id === "ethereum",
);
pass(
  "profile keeps other provider ids empty",
  Object.keys(profile.asset.externalIds.other_provider_ids).length === 0,
);
pass("profile records the crypto asset type", profile.asset.assetType === "crypto");
pass(
  "profile normalizes the description",
  profile.asset.description === "Ethereum is a decentralized platform & more.",
);
pass("profile uses the first category", profile.asset.category === "Smart Contract Platform");
pass(
  "profile keeps the large logo",
  profile.asset.logoUrl === "https://assets.coingecko.com/eth/large.png",
);
pass(
  "profile prefers the homepage for the website",
  profile.asset.websiteUrl === "https://ethereum.org",
);
pass(
  "profile keeps all categories in tokenomics",
  profile.crypto.tokenomics.categories.length === 2,
);
pass("profile keeps the genesis date", profile.crypto.tokenomics.genesisDate === "2015-07-30");
pass("profile keeps the block time", profile.crypto.tokenomics.blockTimeInMinutes === 0.2);
pass("profile keeps supply fields", profile.crypto.circulatingSupply === 120_000_000);
pass(
  "profile maps contracts as unverified",
  profile.crypto.contractAddresses[0]?.verified === false,
);
pass("profile records the network", profile.crypto.network === "ethereum");
pass(
  "profile builds a market snapshot",
  profile.marketSnapshot.informationType === "market_snapshot",
);
pass(
  "profile snapshot uses the observation time",
  profile.marketSnapshot.observedAt === "2026-10-27T12:00:00.000Z",
);
pass(
  "profile snapshot records the collection time",
  profile.marketSnapshot.collectedAt === "2026-10-27T12:00:05.000Z",
);
pass("profile resolution uses the provider id method", profile.resolution.method === "provider_id");
pass("profile resolution is never marked verified", profile.resolution.verified === false);
pass("profile strips the API key from the source URL", !profile.sourceUrl.includes("api_key"));
pass(
  "profile rejects a response without a stable id",
  throws(() =>
    normalizeCoinProfile(
      { symbol: "eth" },
      {
        sourceUrl: "https://example.invalid",
        vsCurrency: "usd",
        fetchedAt: "2026-10-27T12:00:00.000Z",
      },
    ),
  ),
);

// --------------------------------------------------
// Market rows
// --------------------------------------------------

const marketRow = normalizeMarketRow(
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/btc/large.png",
    current_price: 60_000,
    market_cap: 1_200_000_000_000,
    market_cap_rank: 1,
    total_volume: 30_000_000_000,
    price_change_percentage_24h_in_currency: 1.2,
    last_updated: "2026-10-27T12:00:00.000Z",
  },
  {
    sourceUrl: "https://api.coingecko.com/api/v3/coins/markets",
    vsCurrency: "usd",
    collectedAt: "2026-10-27T12:00:05.000Z",
  },
);
pass("market row builds a snapshot", marketRow?.information.informationType === "market_snapshot");
pass("market row keeps the provider id", marketRow?.asset.externalIds.coingecko_id === "bitcoin");
pass("market row does not invent a description", marketRow?.asset.description === null);
pass("market row normalizes the price", marketRow?.information.data.currentPrice === 60_000);
pass(
  "market row without an id is dropped",
  normalizeMarketRow(
    { symbol: "x" },
    {
      sourceUrl: "https://example.invalid",
      vsCurrency: "usd",
      collectedAt: "2026-10-27T12:00:00.000Z",
    },
  ) === null,
);

// --------------------------------------------------
// List and search
// --------------------------------------------------

const coinsList = normalizeCoinsList([
  { id: "ethereum", symbol: "eth", name: "Ethereum", platforms: { ethereum: "0xAAA" } },
  { id: "ethereum", symbol: "eth", name: "Ethereum duplicate", platforms: {} },
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", platforms: {} },
  { symbol: "noid", name: "No id", platforms: {} },
]);
pass("coins list deduplicates by provider id", coinsList.length === 2);
pass("coins list keeps the first occurrence", coinsList[0]?.name === "Ethereum");
pass("coins list keeps platform mappings", coinsList[0]?.platforms[0]?.address === "0xAAA");
pass(
  "coins list rejects a non-array payload",
  throws(() => normalizeCoinsList({})),
);

const searchCandidates = normalizeSearchCandidates({
  coins: [
    {
      id: "ethereum",
      symbol: "eth",
      name: "Ethereum",
      market_cap_rank: 2,
      thumb: "thumb.png",
      large: "large.png",
    },
    { id: "ethereum-classic", symbol: "etc", name: "Ethereum Classic", market_cap_rank: 40 },
    { id: "ethereum", symbol: "eth", name: "Duplicate" },
    { symbol: "noid", name: "No id" },
  ],
  exchanges: [],
  categories: [],
});
pass("search deduplicates candidates", searchCandidates.length === 2);
pass("search preserves provider order", searchCandidates[1]?.coingeckoId === "ethereum-classic");
pass("search keeps the market cap rank", searchCandidates[1]?.marketCapRank === 40);
pass("search leaves missing images null", searchCandidates[1]?.thumbUrl === null);
pass(
  "search candidates are not treated as canonical assets",
  searchCandidates.every((candidate) => !("assetType" in candidate)),
);

// --------------------------------------------------
// Granularity
// --------------------------------------------------

const DAY_MS = 86_400_000;

const dailyGranularity = inferGranularity([0, DAY_MS, 2 * DAY_MS, 3 * DAY_MS]);
pass("granularity detects a daily interval", dailyGranularity.sourceIntervalLabel === "1d");
pass(
  "granularity maps daily to the database interval",
  dailyGranularity.assetPriceHistoryInterval === "1d",
);
pass("granularity reports a uniform series", dailyGranularity.uniform === true);
pass(
  "granularity reports the observed spacing",
  dailyGranularity.observedIntervalSeconds.join(",") === "86400",
);

const fourHourGranularity = inferGranularity([0, 14_400_000, 28_800_000]);
pass("granularity detects a 4h interval", fourHourGranularity.sourceIntervalLabel === "4h");
pass(
  "granularity maps 4h to the database interval",
  fourHourGranularity.assetPriceHistoryInterval === "4h",
);

const thirtyMinuteGranularity = inferGranularity([0, 1_800_000, 3_600_000]);
pass("granularity labels a 30m interval", thirtyMinuteGranularity.sourceIntervalLabel === "30m");
pass(
  "granularity does not map 30m to a database interval",
  thirtyMinuteGranularity.assetPriceHistoryInterval === null,
);

const fourDayGranularity = inferGranularity([0, 4 * DAY_MS, 8 * DAY_MS]);
pass("granularity labels a 4d interval", fourDayGranularity.sourceIntervalLabel === "4d");
pass(
  "granularity does not map 4d to a database interval",
  fourDayGranularity.assetPriceHistoryInterval === null,
);

const mixedGranularity = inferGranularity([0, DAY_MS, 2 * DAY_MS, 2.5 * DAY_MS]);
pass("granularity flags a non-uniform series", mixedGranularity.uniform === false);
pass(
  "granularity lists every observed spacing",
  mixedGranularity.observedIntervalSeconds.join(",") === "43200,86400",
);

const singlePointGranularity = inferGranularity([0]);
pass(
  "granularity leaves a single point unknown",
  singlePointGranularity.sourceIntervalSeconds === null &&
    singlePointGranularity.sourceIntervalLabel === null &&
    singlePointGranularity.uniform === false,
);

// --------------------------------------------------
// OHLC
// --------------------------------------------------

const HOUR_MS = 3_600_000;

const ohlc = normalizeOhlcRows(
  [
    [1_700_000_000_000, 100, 110, 95, 105],
    [1_700_000_000_000 + HOUR_MS, 105, 112, 100, 108],
    [1_700_000_000_000 + 2 * HOUR_MS, 108, 115, 102, 110],
    [1_700_000_000_000 + 3 * HOUR_MS, 110, 118, 105, 116],
  ],
  "usd",
);
pass("OHLC parses every valid row", ohlc.candles.length === 4);
pass("OHLC infers the hourly interval", ohlc.granularity.sourceIntervalLabel === "1h");
pass(
  "OHLC maps the hourly interval to the database",
  ohlc.granularity.assetPriceHistoryInterval === "1h",
);
pass(
  "OHLC keeps prices and the quote currency",
  ohlc.candles[0]?.open === 100 &&
    ohlc.candles[0]?.high === 110 &&
    ohlc.candles[0]?.low === 95 &&
    ohlc.candles[0]?.close === 105 &&
    ohlc.candles[0]?.quoteCurrency === "usd",
);
pass(
  "OHLC never invents volume",
  ohlc.candles.every((candle) => candle.volume === null),
);
pass(
  "OHLC stamps each candle with the database interval",
  ohlc.candles.every((candle) => candle.interval === "1h"),
);

const invalidOhlc = normalizeOhlcRows(
  [
    [1_700_000_000_000, 100, 110, 95, 105],
    [1_700_000_000_000 + HOUR_MS, 105, 112, 100],
    [1_700_000_000_000 + 2 * HOUR_MS, "bad", 112, 100, 108],
    [1_700_000_000_000 + 3 * HOUR_MS, 0, 112, 100, 108],
    [1_700_000_000_000 + 4 * HOUR_MS, 100, 90, 95, 105],
    [1_700_000_000_000 + 5 * HOUR_MS, 100, 120, 95, 130],
    [1_700_000_000_000 + 6 * HOUR_MS, 100, 120, 105, 110],
    "not a row",
  ],
  "usd",
);
pass("OHLC rejects malformed and out-of-bounds rows", invalidOhlc.candles.length === 1);
pass("OHLC counts rejected rows", invalidOhlc.rejectedRows === 7);
pass(
  "OHLC rejects a non-array payload",
  throws(() => normalizeOhlcRows({}, "usd")),
);

const duplicateOhlc = normalizeOhlcRows(
  [
    [1_700_000_000_000, 100, 110, 95, 105],
    [1_700_000_000_000, 200, 210, 195, 205],
  ],
  "usd",
);
pass("OHLC deduplicates by timestamp", duplicateOhlc.candles.length === 1);
pass("OHLC keeps the last row for a duplicate timestamp", duplicateOhlc.candles[0]?.open === 200);
pass("OHLC leaves a single candle interval unknown", duplicateOhlc.candles[0]?.interval === null);

// --------------------------------------------------
// Market chart
// --------------------------------------------------

const chart = normalizeMarketChart(
  {
    prices: [
      [1_700_000_000_000, 100],
      [1_700_000_000_000 + HOUR_MS, 101],
    ],
    market_caps: [
      [1_700_000_000_000, 1_000_000],
      [1_700_000_000_000 + HOUR_MS, 1_010_000],
    ],
    total_volumes: [[1_700_000_000_000, 50_000]],
  },
  {
    coingeckoId: "bitcoin",
    vsCurrency: "usd",
    days: 1,
    sourceUrl: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?days=1",
    fetchedAt: "2026-10-27T12:00:05.000Z",
  },
);

pass("market chart joins the price series", chart.observations.length === 2);
pass("market chart keeps the price", chart.observations[0]?.data.price === 100);
pass("market chart keeps the market cap", chart.observations[0]?.data.marketCap === 1_000_000);
pass("market chart keeps the volume", chart.observations[0]?.data.volume24h === 50_000);
pass("market chart leaves a missing volume null", chart.observations[1]?.data.volume24h === null);
pass("market chart records the quote currency", chart.observations[0]?.data.vsCurrency === "usd");
pass("market chart is explicitly not OHLC", chart.granularity.isOhlc === false);
pass(
  "market chart never maps to the candle interval",
  chart.granularity.assetPriceHistoryInterval === null,
);
pass(
  "market chart warns against inserting observations as candles",
  (chart.granularity.note ?? "").includes("not OHLC"),
);
pass(
  "market chart carries the market snapshot template",
  chart.informationTemplate.informationType === "market_snapshot" &&
    chart.informationTemplate.source === "CoinGecko",
);
pass(
  "market chart skips malformed series rows",
  normalizeMarketChart(
    { prices: [["bad", 1], [1_700_000_000_000, "bad"], [1_700_000_000_000]] },
    {
      coingeckoId: "bitcoin",
      vsCurrency: "usd",
      days: 1,
      sourceUrl: "https://example.invalid",
      fetchedAt: "2026-10-27T12:00:00.000Z",
    },
  ).observations.length === 0,
);

// --------------------------------------------------
// Rate limiter input validation
// --------------------------------------------------

pass(
  "request rate rejects zero",
  throws(() => setCoinGeckoRequestsPerMinute(0)),
);
pass(
  "request rate rejects NaN",
  throws(() => setCoinGeckoRequestsPerMinute(Number.NaN)),
);
pass("request rate accepts a positive value", !throws(() => setCoinGeckoRequestsPerMinute(30)));

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll CoinGecko normalization tests passed.");
}
