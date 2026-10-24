import fs from "node:fs/promises";
import path from "node:path";

const INDICATORS_DIR = path.resolve(
  process.cwd(),
  "database/injection/indicators",
);

/**
 * Mapping of indicator file base name -> historical_time_unit value.
 * Values: 'd' = daily, 'm' = monthly, 'o' = other, 'q' = quarterly.
 *
 * Derived from actual historical table data frequency (date gaps between rows).
 */
const HISTORICAL_TIME_UNITS: Record<string, "d" | "m" | "o" | "q"> = {
  aaiisentiment: "o",
  advanced_economy_usd_index: "m",
  alternativecryptofeargreed: "o",
  aluminum: "m",
  audusd: "d",
  average_hourly_earnings: "m",
  binanceaave: "d",
  binancebitcoin: "d",
  binancebnb: "d",
  binancedoge: "d",
  binanceethereum: "d",
  binancelink: "d",
  binancesolana: "d",
  binancexrp: "d",
  brent: "d",
  broad_usd_index: "m",
  building_permits: "m",
  cftcbitcoin: "o",
  cftcesdindex: "o",
  cftcethereum: "o",
  cftceurofx: "o",
  cftcjapaneseyen: "o",
  cftcmicroethereum: "o",
  cftcnasdaq: "o",
  cftcspfivehundred: "o",
  cftcustteny: "o",
  cftcusttwoy: "o",
  cnnfeargreed: "d",
  cnnmarketmomentumsponetwofive: "d",
  cnnmarketvolatilityvixfifty: "d",
  cnnputcalloptions: "d",
  cnnsafehavendemand: "d",
  cnnstockpricebreadth: "d",
  coinmarketcapaltcoinseason: "d",
  coinmarketcapcryptomarketmetrics: "o",
  consumer_sentiment: "m",
  copper: "m",
  core_cpi: "m",
  core_pce: "m",
  cpi: "m",
  dow_jones: "m",
  emerging_market_usd_index: "m",
  eurousd: "d",
  existing_home_sales: "m",
  federal_funds_rate: "m",
  fed_total_assets: "m",
  fivey_treasury: "m",
  five_year_inflation_expectations: "m",
  gbpusd: "d",
  gold: "d",
  high_yield_credit_spread: "m",
  home_price_index: "m",
  housing_starts: "m",
  igaudusd: "o",
  igbrentcrudeoil: "o",
  igdowjones: "o",
  igeurousd: "o",
  iggbpusd: "o",
  iggold: "o",
  ignasdaq: "o",
  igsilver: "o",
  igspfivezerozero: "o",
  igusdcad: "o",
  igusdjpy: "o",
  igwticrudeoil: "o",
  industrial_production: "m",
  initial_jobless_claims: "m",
  investment_grade_credit_spread: "m",
  job_openings: "m",
  labor_force_participation: "m",
  mortgage_rate: "m",
  mtwo_money_supply: "m",
  nasdaq_composite: "m",
  naturalgas: "d",
  nonfarm_payrolls: "m",
  nzdusd: "d",
  pce: "m",
  personal_income: "m",
  ppi: "m",
  real_broad_usd_index: "m",
  real_gdp: "q",
  real_gdp_growth: "q",
  real_ten_year_treasury_yield: "m",
  reserve_balances: "m",
  retail_sales: "m",
  reverse_repo_usage: "o",
  russelltwozerozerozero: "d",
  silver: "d",
  spfivezerozero: "m",
  spotetfbitcoin: "d",
  spotetfchainlink: "d",
  spotetfdoge: "d",
  spotetfethereum: "d",
  spotetfsolana: "d",
  spotetfxrp: "d",
  ten_two_year_yield_spread: "m",
  ten_year_breakeven_inflation: "m",
  ten_year_treasury_yield: "m",
  threem_treasury: "m",
  two_year_treasury_yield: "o",
  unemployment_rate: "m",
  usdcad: "d",
  usdchf: "d",
  usdjpy: "d",
  vix: "m",
  wti: "d",
};

const addHistoricalTimeUnit = async () => {
  const files = await fs.readdir(INDICATORS_DIR);
  const tsFiles = files.filter((f) => f.endsWith(".ts")).sort();

  let updated = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (const file of tsFiles) {
    const baseName = file.replace(/\.ts$/, "");
    const historicalTimeUnit = HISTORICAL_TIME_UNITS[baseName];

    if (!historicalTimeUnit) {
      errors.push(`No mapping for ${file}`);
      continue;
    }

    const filePath = path.join(INDICATORS_DIR, file);
    let content = await fs.readFile(filePath, "utf-8");

    // Skip if already has historicalTimeUnit
    if (content.includes("historicalTimeUnit")) {
      skipped++;
      continue;
    }

    // Detect line ending
    const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";

    // Insert historicalTimeUnit after the unit line
    const nl = lineEnding === "\r\n" ? "\\r?\\n" : "\\n";
    const unitRegex = new RegExp(`(  unit: "[^"]*",${nl})`);
    const match = content.match(unitRegex);

    if (!match) {
      errors.push(`No unit line found in ${file}`);
      continue;
    }

    const insertion = `${match[1]}  historicalTimeUnit: "${historicalTimeUnit}",${lineEnding}`;
    content = content.replace(unitRegex, insertion);

    await fs.writeFile(filePath, content);
    updated++;
    console.log(`  ✓ ${file} -> historicalTimeUnit: ${historicalTimeUnit}`);
  }

  console.log(`\nUpdated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log("Errors:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
};

addHistoricalTimeUnit().catch((error) => {
  console.error("Script failed:", error);
  process.exitCode = 1;
});
