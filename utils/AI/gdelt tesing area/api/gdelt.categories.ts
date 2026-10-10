import type { GdeltMode, GdeltSort } from "./gdeltClient.js";

/**
 * Curated GDELT DOC category registry.
 *
 * Kept separate from the client and the tools on purpose: queries here get tuned
 * regularly, and changing a search term should never require touching the HTTP
 * layer or the tool definitions.
 *
 * ## Verification status - read before trusting these queries
 *
 * **Every query in this file is UNVERIFIED against the live endpoint.**
 *
 * They were written from GDELT's documented query grammar plus domain
 * judgement, because the endpoint throttled this machine hard enough that
 * category tuning could not be performed (see `probe-one.ts` and the captures in
 * `raw output/`). In particular, none of these has been confirmed to:
 *
 *  - return a non-empty result set,
 *  - parse as intended, or
 *  - use the documented `timespan` grammar.
 *
 * They are a starting point to be tuned against real responses, not a tuned
 * configuration. {@link GdeltCategory.verified} records this per category so a
 * caller can refuse to trust an unproven category rather than discover the
 * problem downstream.
 *
 * ## Query grammar
 *
 * Operators used below, all from the DOC 2.0 documentation:
 *
 * ```
 * "exact phrase"          (a OR b)              term -excluded
 * domain:reuters.com      domainis:reuters.com  sourcecountry:unitedstates
 * sourcelang:english      theme:GDELT_CONFLICT  near10:"a b"
 * repeat3:"a"             tone<-5               toneabs>10
 * ```
 *
 * Per the integration brief, **nested boolean OR blocks are assumed
 * unsupported**, so every query below is a single flat group. If a query comes
 * back unexpectedly empty, suspect the grammar before assuming no coverage.
 *
 * User-supplied query strings are never concatenated into these templates - see
 * the note on {@link GdeltCategory.queries}.
 */

/** Category identifiers. Stable identifiers; the display names are not. */
export type GdeltCategoryId =
  | "geopolitics"
  | "conflict_security"
  | "politics_elections"
  | "us_administration"
  | "macro_economics"
  | "central_banks"
  | "trade_tariffs"
  | "sanctions"
  | "financial_markets"
  | "banking_liquidity"
  | "commodities_energy"
  | "crypto_markets"
  | "crypto_regulation"
  | "defi_stablecoins"
  | "ai_models"
  | "ai_infrastructure"
  | "technology_industry"
  | "cybersecurity"
  | "corporate_business"
  | "china_economy"
  | "climate_disasters"
  | "public_health";

/**
 * Most categories this agent may request in a single call.
 *
 * Measured GDELT latency is 8-26 seconds per request and the endpoint
 * rate-limits aggressively. A 22-category scan is therefore ~5.5 minutes of
 * wall clock before throttling, which does not fit a tool call. Callers should
 * ask for a small number of categories and make several calls.
 */
export const GDELT_MAX_CATEGORIES_PER_CALL = 3;

/** One curated category. */
export type GdeltCategory = {
  id: GdeltCategoryId;

  /** Human-readable name. For display only - never match on it. */
  name: string;

  /** What this category is for, and what it is not for. */
  purpose: string;

  /**
   * Candidate query expressions, tried in order.
   *
   * **These are complete query strings.** Operator syntax lives inside them and
   * callers must not splice free text into the middle of one - a user phrase
   * inserted between `(` and `OR` silently changes the parse rather than
   * erroring. To search free text, use `requestDoc` with the user's own query,
   * not this registry.
   *
   * The array holds alternates because the first has not been proven to work;
   * multiple entries are a hedge, not a fallback chain that was observed to work.
   */
  queries: string[];

  /** Default relative window for this category. Grammar unverified. */
  defaultTimespan: string;

  /** Default article cap. Kept low because latency, not payload, is the cost. */
  defaultMaxRecords: number;

  defaultSort: GdeltSort;

  /**
   * Publisher domains to restrict to, as a `domainis:` clause.
   *
   * Empty means "no restriction". Used sparingly: GDELT's coverage of any one
   * outlet is uneven, so pinning to a few domains can empty an otherwise healthy
   * category.
   */
  trustedDomains: string[];

  /**
   * Terms to exclude, rendered as `-term` clauses.
   *
   * Used to suppress the dominant false positive in a category rather than to
   * narrow it deliberately.
   */
  exclusions: string[];

  /** `sourcelang:` values. Empty means "no language restriction". */
  sourceLanguages: string[];

  /** `sourcecountry:` values. Empty means "no country restriction". */
  sourceCountries: string[];

  /** DOC modes this category is meaningful for. */
  modes: GdeltMode[];

  /**
   * Whether this category's queries have been confirmed against live results.
   *
   * `false` everywhere right now. Flip to `true` only after observing a
   * non-empty, correctly-parsed response for it.
   */
  verified: boolean;
};

/**
 * English-only default.
 *
 * GDELT indexes globally, so an unrestricted query mixes coverage across
 * languages, which for English-language analysis is mostly noise. Unverified:
 * the exact `sourcelang` spelling has not been confirmed.
 */
const ENGLISH = ["english"];

/** Builds a query with the standard suppression clauses applied. */
const query = (core: string, exclusions: string[] = []): string => {
  const trimmed = exclusions.map((term) => `-${term}`).join(" ");

  return trimmed === "" ? core : `${core} ${trimmed}`;
};

/** The registry. Keyed by id so lookup is a plain object access. */
export const GDELT_CATEGORIES: Record<GdeltCategoryId, GdeltCategory> = {
  geopolitics: {
    id: "geopolitics",
    name: "Geopolitics",
    purpose:
      "Diplomatic and state-to-state developments. Excludes active combat, which is conflict_security.",
    queries: [query('"foreign policy" OR diplomacy OR geopolitical OR "state visit"')],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  conflict_security: {
    id: "conflict_security",
    name: "Conflict & Security",
    purpose:
      "Active armed conflict, strikes and ceasefire activity. Military posture and defence policy are out of scope.",
    queries: [
      query('"armed conflict" OR ceasefire OR airstrike OR "military offensive" OR "war talks"'),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  politics_elections: {
    id: "politics_elections",
    name: "Politics & Elections",
    purpose: "Electoral processes and domestic political change across countries, not only the US.",
    queries: [
      query(
        'election OR "vote count" OR "election results" OR "prime minister" OR "coalition government"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  us_administration: {
    id: "us_administration",
    name: "US Administration",
    purpose:
      "US federal executive and legislative action. State-level and campaign news is out of scope.",
    queries: [
      query(
        '"White House" OR "US Congress" OR "federal government" OR "administration announced"',
        ["trump", "biden", "obama"],
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    // Bias is deliberate: this category is about US federal action, so
    // restricting to US publishers keeps unrelated national coverage out.
    sourceCountries: ["unitedstates"],
    modes: ["artlist"],
    verified: false,
  },

  macro_economics: {
    id: "macro_economics",
    name: "Macro Economics",
    purpose: "Economy-wide indicators and conditions. Central bank decisions are central_banks.",
    queries: [
      query(
        'inflation OR "unemployment rate" OR "gross domestic product" OR recession OR "consumer confidence"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist", "timelinevol"],
    verified: false,
  },

  central_banks: {
    id: "central_banks",
    name: "Central Banks",
    purpose: "Policy decisions and monetary stance from major central banks.",
    queries: [
      query(
        '"Federal Reserve" OR "European Central Bank" OR "Bank of Japan" OR "Bank of England" OR "interest rate decision"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist", "timelinevol"],
    verified: false,
  },

  trade_tariffs: {
    id: "trade_tariffs",
    name: "Trade & Tariffs",
    purpose: "Tariffs, trade disputes and trade balance. General agreement news is included.",
    queries: [
      query(
        'tariff OR tariffs OR "trade war" OR "import duty" OR "trade deficit" OR "trade agreement"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  sanctions: {
    id: "sanctions",
    name: "Sanctions",
    purpose: "Economic and targeted sanctions, asset freezes and export controls.",
    queries: [
      query('sanctions OR "asset freeze" OR "export controls" OR embargo OR "entity list"'),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  financial_markets: {
    id: "financial_markets",
    name: "Financial Markets",
    purpose:
      "Equity, bond and derivatives market movement. Company-specific reporting is corporate_business.",
    queries: [
      query(
        '"stock market" OR "bond market" OR equities OR "S&P 500" OR "Treasury yields" OR "market selloff"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist", "timelinevol"],
    verified: false,
  },

  banking_liquidity: {
    id: "banking_liquidity",
    name: "Banking & Liquidity",
    purpose:
      "Bank solvency, credit conditions and deposit flows. Central bank policy is not included.",
    queries: [
      query(
        '"bank run" OR "credit crunch" OR "deposit outflow" OR "bank capital" OR "liquidity crunch"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  commodities_energy: {
    id: "commodities_energy",
    name: "Commodities & Energy",
    purpose: "Oil, gas, metals and agricultural commodity markets.",
    queries: [
      query(
        '"crude oil" OR "natural gas" OR OPEC OR "gold price" OR "copper prices" OR "energy prices"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist", "timelinevol"],
    verified: false,
  },

  crypto_markets: {
    id: "crypto_markets",
    name: "Crypto Markets",
    purpose:
      "Digital asset price action, flows and market structure. Regulatory news is crypto_regulation.",
    queries: [query('bitcoin OR ethereum OR "cryptocurrency market" OR "crypto price" OR altcoin')],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist", "timelinevol"],
    verified: false,
  },

  crypto_regulation: {
    id: "crypto_regulation",
    name: "Crypto Regulation",
    purpose: "Enforcement, legislation and licensing affecting digital assets.",
    queries: [
      query(
        '"crypto regulation" OR "digital asset" OR "SEC" crypto OR "crypto bill" OR "crypto enforcement"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  defi_stablecoins: {
    id: "defi_stablecoins",
    name: "DeFi & Stablecoins",
    purpose: "Decentralised finance protocols, stablecoin supply and on-chain lending.",
    queries: [
      query(
        '"decentralized finance" OR DeFi OR stablecoin OR "lending protocol" OR "liquidity pool"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  ai_models: {
    id: "ai_models",
    name: "AI Models",
    purpose:
      "Model releases, capabilities and safety debate. Hardware and datacentres are ai_infrastructure.",
    queries: [
      query(
        '"AI model" OR "large language model" OR "foundation model" OR "model release" OR "AI safety"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  ai_infrastructure: {
    id: "ai_infrastructure",
    name: "AI Infrastructure",
    purpose: "Compute, chips and datacentres underpinning model deployment.",
    queries: [
      query(
        '"AI chips" OR "AI data center" OR "GPU supply" OR "compute cluster" OR "AI infrastructure"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  technology_industry: {
    id: "technology_industry",
    name: "Technology Industry",
    purpose: "Semiconductors, software and platform competition outside the AI-specific lanes.",
    queries: [
      query(
        'semiconductor OR "tech industry" OR "cloud computing" OR smartphone OR "software industry"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  cybersecurity: {
    id: "cybersecurity",
    name: "Cybersecurity",
    purpose: "Intrusions, ransomware, disclosure of breaches and vulnerability disclosure.",
    queries: [
      query(
        'cyberattack OR ransomware OR "data breach" OR malware OR "zero-day" OR "security vulnerability"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  corporate_business: {
    id: "corporate_business",
    name: "Corporate & Business",
    purpose: "Earnings, M&A, capital returns and distress at company level.",
    queries: [
      query(
        '"earnings report" OR "merger and acquisition" OR "share buyback" OR bankruptcy OR "quarterly results"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  china_economy: {
    id: "china_economy",
    name: "China Economy",
    purpose: "Chinese macroeconomic data, policy and trade. Geopolitical tension is geopolitics.",
    queries: [
      query(
        '"China economy" OR "Chinese economy" OR "China GDP" OR "China stimulus" OR "China exports"',
      ),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  climate_disasters: {
    id: "climate_disasters",
    name: "Climate & Disasters",
    purpose:
      "Extreme weather and natural disasters with direct physical impact. Climate policy is out of scope.",
    queries: [
      query('earthquake OR hurricane OR typhoon OR wildfire OR flood OR "climate disaster"'),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },

  public_health: {
    id: "public_health",
    name: "Public Health",
    purpose:
      "Outbreaks, vaccination and health system pressure. General science reporting is out of scope.",
    queries: [
      query('pandemic OR epidemic OR "disease outbreak" OR vaccine OR "public health emergency"'),
    ],
    defaultTimespan: "24h",
    defaultMaxRecords: 25,
    defaultSort: "HybridRel",
    trustedDomains: [],
    exclusions: [],
    sourceLanguages: ENGLISH,
    sourceCountries: [],
    modes: ["artlist"],
    verified: false,
  },
};

/** All category ids, in registry order. */
export const GDELT_CATEGORY_IDS = Object.keys(GDELT_CATEGORIES) as GdeltCategoryId[];

/**
 * Composes a category's full query, including its filter clauses.
 *
 * Returns `null` when the category has no query configured, so a caller fails
 * loudly rather than issuing a filterless request that would return unrelated
 * coverage and look like a valid result.
 */
export const composeCategoryQuery = (category: GdeltCategory): string | null => {
  const base = category.queries[0];

  if (base === undefined || base.trim() === "") {
    return null;
  }

  const clauses: string[] = [base];

  for (const domain of category.trustedDomains) {
    clauses.push(`domainis:${domain}`);
  }

  for (const language of category.sourceLanguages) {
    clauses.push(`sourcelang:${language}`);
  }

  for (const country of category.sourceCountries) {
    clauses.push(`sourcecountry:${country}`);
  }

  return clauses.join(" ");
};

/**
 * Resolves category ids to definitions.
 *
 * @throws When an id is unknown, or when more ids are requested than
 * {@link GDELT_MAX_CATEGORIES_PER_CALL}. Refusing here is deliberate - a
 * silently truncated request would return partial coverage that reads as
 * complete.
 */
export const resolveCategories = (ids: readonly string[]): GdeltCategory[] => {
  if (ids.length > GDELT_MAX_CATEGORIES_PER_CALL) {
    throw new Error(
      `Requested ${ids.length} categories but at most ` +
        `${GDELT_MAX_CATEGORIES_PER_CALL} may be fetched per call. ` +
        `GDELT latency is 8-26s per request, so a full scan cannot complete ` +
        `inside one tool invocation. Make several calls instead.`,
    );
  }

  return ids.map((id) => {
    const category = GDELT_CATEGORIES[id as GdeltCategoryId];

    if (category === undefined) {
      throw new Error(`Unknown GDELT category "${id}". Known: ${GDELT_CATEGORY_IDS.join(", ")}.`);
    }

    return category;
  });
};
