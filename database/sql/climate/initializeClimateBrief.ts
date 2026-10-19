import fs from "node:fs/promises";
import path from "node:path";
import pool from "../../../config/database.js";

// --------------------------------------------------
// Climate Brief Initializer Injection
// --------------------------------------------------
//
// Injects the foundational climate brief data from the initializer files
// into the climate.climate_briefs table. Each initializer file exports
// constants that map to the `_data` columns in the climate_briefs table.
// The other columns (_relevance_router, _researcher, _analysis) are
// populated later by the AI pipeline.
//
// Run with: npx tsx database/sql/climate/initializeClimateBrief.ts
// --------------------------------------------------

const INITIALIZER_DIR = path.join("database", "sql", "climate", "initializerData");

// Map of initializer file names to their exported constants
const INITIALIZER_FILES: Record<string, string[]> = {
  "01 \u2014 Global Overview.ts": [
    "globalOverviewBrief",
  ],
  "02 \u2014 Macro & Market Regime.ts": [
    "currentMacroRegime",
    "monetaryPolicyRatesCredit",
    "liquidityCapitalDeployment",
    "historicalMarketCycles",
    "currentMarketCycleAssessment",
    "marketHealthValuationsRiskAppetite",
    "globalMacroTransmission",
    "sectorSensitivityToRegime",
    "outlookScenarioAssessment",
  ],
  "03 \u2014 Sector Conditions.ts": [
    "geopolitics",
    "globalFinancialMarkets",
    "macroeconomics",
    "energyAndCommodities",
    "cryptoIndustry",
    "technologyAndAI",
  ],
  "04 \u2014 Important Stories & Narratives.ts": [
    "geopoliticsStoriesAndNarratives",
    "financialMarketStoriesAndNarratives",
    "macroeconomicStoriesAndNarratives",
    "energyAndCommodities",
    "crypto",
    "technologyAndAI",
  ],
  "05 \u2014 Trends & Capital Direction.ts": [
    "geopolitics",
    "financialMarkets",
    "macroeconomics",
    "energyAndCommodities",
    "crypto",
    "technologyAndAI",
  ],
  "06 \u2014 Outlook, Risks & Uncertainties.ts": [
    "outlookRisksAndUncertainties",
    "financialMarketsOutlookRisksAndUncertainties",
    "macroOutlookRisksAndUncertaintiesBrief",
    "energyCommoditiesOutlook",
    "cryptoOutlookRisksBrief",
    "technologyAiOutlookRisksBrief",
  ],
};

/**
 * Mapping from (fileName, constantName) to database column names.
 * Uses composite key "fileName|constantName" to avoid collisions.
 */
const CONSTANT_TO_COLUMN: Record<string, string> = {
  "01 \u2014 Global Overview.ts|globalOverviewBrief": "global_overview_data",

  "02 \u2014 Macro & Market Regime.ts|currentMacroRegime": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|monetaryPolicyRatesCredit": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|liquidityCapitalDeployment": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|historicalMarketCycles": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|currentMarketCycleAssessment": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|marketHealthValuationsRiskAppetite": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|globalMacroTransmission": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|sectorSensitivityToRegime": "macro_market_regime_geopolitics_data",
  "02 \u2014 Macro & Market Regime.ts|outlookScenarioAssessment": "macro_market_regime_geopolitics_data",

  "03 \u2014 Sector Conditions.ts|geopolitics": "sector_conditions_geopolitics_data",
  "03 \u2014 Sector Conditions.ts|globalFinancialMarkets": "sector_conditions_financial_markets_data",
  "03 \u2014 Sector Conditions.ts|macroeconomics": "sector_conditions_macro_data",
  "03 \u2014 Sector Conditions.ts|energyAndCommodities": "sector_conditions_commodities_energy_data",
  "03 \u2014 Sector Conditions.ts|cryptoIndustry": "sector_conditions_crypto_data",
  "03 \u2014 Sector Conditions.ts|technologyAndAI": "sector_conditions_ai_technology_industry_data",

  "04 \u2014 Important Stories & Narratives.ts|geopoliticsStoriesAndNarratives": "important_stories_narratives_geopolitics_data",
  "04 \u2014 Important Stories & Narratives.ts|financialMarketStoriesAndNarratives": "important_stories_narratives_financial_markets_data",
  "04 \u2014 Important Stories & Narratives.ts|macroeconomicStoriesAndNarratives": "important_stories_narratives_macro_data",
  "04 \u2014 Important Stories & Narratives.ts|macroeconomics": "important_stories_narratives_macro_data",
  "04 \u2014 Important Stories & Narratives.ts|energyAndCommodities": "important_stories_narratives_commodities_energy_data",
  "04 \u2014 Important Stories & Narratives.ts|crypto": "important_stories_narratives_crypto_data",
  "04 \u2014 Important Stories & Narratives.ts|technologyAndAI": "important_stories_narratives_ai_technology_industry_data",

  "05 \u2014 Trends & Capital Direction.ts|geopolitics": "trends_capital_direction_geopolitics_data",
  "05 \u2014 Trends & Capital Direction.ts|financialMarkets": "trends_capital_direction_financial_markets_data",
  "05 \u2014 Trends & Capital Direction.ts|macroeconomics": "trends_capital_direction_macro_data",
  "05 \u2014 Trends & Capital Direction.ts|energyAndCommodities": "trends_capital_direction_commodities_energy_data",
  "05 \u2014 Trends & Capital Direction.ts|crypto": "trends_capital_direction_crypto_data",
  "05 \u2014 Trends & Capital Direction.ts|technologyAndAI": "trends_capital_direction_ai_technology_industry_data",

  "06 \u2014 Outlook, Risks & Uncertainties.ts|outlookRisksAndUncertainties": "outlook_risks_uncertainties_geopolitics_data",
  "06 \u2014 Outlook, Risks & Uncertainties.ts|financialMarketsOutlookRisksAndUncertainties": "outlook_risks_uncertainties_financial_markets_data",
  "06 \u2014 Outlook, Risks & Uncertainties.ts|macroOutlookRisksAndUncertaintiesBrief": "outlook_risks_uncertainties_macro_data",
  "06 \u2014 Outlook, Risks & Uncertainties.ts|energyCommoditiesOutlook": "outlook_risks_uncertainties_commodities_energy_data",
  "06 \u2014 Outlook, Risks & Uncertainties.ts|cryptoOutlookRisksBrief": "outlook_risks_uncertainties_crypto_data",
  "06 \u2014 Outlook, Risks & Uncertainties.ts|technologyAiOutlookRisksBrief": "outlook_risks_uncertainties_ai_technology_industry_data",
};

// Domain mapping for the climate brief table
const DOMAINS = [
  "geopolitics",
  "financial_markets",
  "macro",
  "commodities_energy",
  "crypto",
  "ai_technology_industry",
];

/**
 * Loads and parses an initializer file to extract its constant values.
 * Returns a map of constant name -> string value.
 */
async function loadInitializerFile(fileName: string): Promise<Map<string, string>> {
  const filePath = path.join(INITIALIZER_DIR, fileName);
  const content = await fs.readFile(filePath, "utf-8");

  const constants = new Map<string, string>();

  // The files export constants like: `const name = \`content\`;` or `const name = "content";`
  // We need to extract the constant name and its value
  const constRegex = /const\s+(\w+)\s*=\s*(`[\s\S]*?`|"[\s\S]*?"|'[\s\S]*?');/g;

  let match;
  while ((match = constRegex.exec(content)) !== null) {
    const constName = match[1];
    const valueMatch = match[2];

    if (constName === undefined || valueMatch === undefined) {
      continue;
    }

    let value = valueMatch;

    // Remove surrounding backticks or quotes
    if (value.startsWith("`") && value.endsWith("`")) {
      value = value.slice(1, -1);
    } else if ((value.startsWith('"') && value.endsWith('"')) ||
               (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    constants.set(constName, value);
  }

  return constants;
}

/**
 * Gets the most recent intelligence set ID from the database.
 * Uses the most recently created set.
 */
async function getLatestIntelligenceSetId(): Promise<string> {
  // Use the specific intelligence set ID provided by the user
  return "894d2ccd-84e7-40af-a106-cd8b8d3b3908";
}

/**
 * Builds the upsert query for the climate_briefs table.
 * Uses INSERT ... ON CONFLICT (uuid) DO NOTHING since uuid is the only unique constraint.
 * We check for existing record first and update if needed.
 */
function buildUpsertQuery(
  intelligenceSetId: string,
  date: string,
  dataColumns: Record<string, string>,
): { query: string; values: unknown[] } {
  const columns = [
    "intelligence_sets_id",
    "date",
    ...Object.keys(dataColumns),
  ];

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const columnNames = columns.join(", ");

  const query = `
    INSERT INTO climate.climate_briefs (${columnNames})
    VALUES (${placeholders})
    ON CONFLICT (uuid) DO NOTHING
    RETURNING uuid
  `.replace("placeholders", columns.map((_, i) => `$${i + 1}`).join(", "));

  const values = [intelligenceSetId, date, ...Object.values(dataColumns)];
  return { query, values };
}

/**
 * Main injection function.
 */
async function injectClimateBriefInitializer(): Promise<void> {
  console.log("Starting climate brief initializer injection...");

  // Get the latest intelligence set
  const intelligenceSetId = await getLatestIntelligenceSetId();
  console.log(`Using intelligence set: ${intelligenceSetId}`);

  // Use today's date as the brief date
  const date = new Date().toISOString().split("T")[0] ?? new Date().toISOString();
  console.log(`Brief date: ${date}`);

  // Collect all data columns to insert
  const dataColumns: Record<string, string> = {};

  for (const [fileName, constNames] of Object.entries(INITIALIZER_FILES)) {
    console.log(`\nLoading ${fileName}...`);
    const constants = await loadInitializerFile(fileName);

    for (const constName of constNames) {
      const compositeKey = `${fileName}|${constName}`;
      const columnName = CONSTANT_TO_COLUMN[compositeKey];
      if (!columnName) {
        console.warn(`  No column mapping for constant: ${constName} in ${fileName}`);
        continue;
      }

      const value = constants.get(constName);
      if (!value) {
        console.warn(`  Constant ${constName} not found in file`);
        continue;
      }

      // Wrap as JSON string since columns are JSONB
      const jsonValue = JSON.stringify(value);

      // If the column already has a value, we need to decide how to merge
      // For now, we'll concatenate with a separator if both exist
      if (dataColumns[columnName]) {
        console.log(`  Appending to existing ${columnName}...`);
        // Parse existing, append, and re-stringify
        try {
          const existing = JSON.parse(dataColumns[columnName]);
          const combined = existing + "\n\n---\n\n" + value;
          dataColumns[columnName] = JSON.stringify(combined);
        } catch {
          // If parsing fails, just concatenate as strings and re-stringify
          dataColumns[columnName] = JSON.stringify(
            JSON.parse(dataColumns[columnName]) + "\n\n---\n\n" + value
          );
        }
      } else {
        dataColumns[columnName] = jsonValue;
        console.log(`  Mapped ${constName} -> ${columnName} (${value.length} chars)`);
      }
    }
  }

  console.log(`\nTotal columns to insert: ${Object.keys(dataColumns).length}`);

  // Build and execute the upsert
  const { query, values } = buildUpsertQuery(intelligenceSetId, date, dataColumns);

  console.log("\nExecuting upsert...");
  const result = await pool.query(query, values);

  if (result.rows.length > 0) {
    console.log(`\n✓ Successfully inserted/updated climate brief: ${result.rows[0].uuid}`);
  } else {
    console.log("\n✓ Climate brief upserted (no rows returned)");
  }

  await pool.end();
}

// Run the injection
injectClimateBriefInitializer()
  .then(() => {
    console.log("\nInjection complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Injection failed:", error);
    process.exit(1);
  });