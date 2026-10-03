/**
 * Input shapes for the seven GDELT Cloud tools, transcribed from
 * `gdelt_cloud_tool_get` output (see `probe-results.json`).
 *
 * Deliberately permissive: every filter is optional and upstream applies its
 * own defaults. Keeping the optionality explicit here means the fetchers can
 * forward arguments verbatim without inventing a narrower type that would
 * silently drop filters.
 */

export const GDELT_REGIONS = [
  "Africa", "Asia", "Middle East", "Northern Africa", "Western Africa",
  "Eastern Africa", "Middle Africa", "Southern Africa", "Europe",
  "Eastern Europe", "South Asia", "Southeast Asia", "East Asia", "Central Asia",
  "North America", "Central America", "Caribbean", "South America", "Oceania",
] as const;

export const GDELT_CONTINENTS = [
  "Africa", "Asia", "Europe", "North America", "South America", "Oceania",
] as const;

/** Conflict sub-types plus the CAMEO+ domains. */
export const GDELT_CATEGORIES = [
  "Battles", "Protests", "Riots", "Explosions/Remote violence",
  "Violence against civilians", "Strategic developments",
  "POLITICAL", "CRIME", "ECONOMIC", "CORPORATE", "TECHNOLOGY",
  "INFRASTRUCTURE", "ENVIRONMENT", "HEALTH", "DEMOGRAPHIC", "INFORMATION",
] as const;

export const GDELT_CAMEO_DOMAINS = [
  "POLITICAL", "CRIME", "ECONOMIC", "CORPORATE", "TECHNOLOGY",
  "INFRASTRUCTURE", "ENVIRONMENT", "HEALTH", "DEMOGRAPHIC", "INFORMATION",
] as const;

/** Story-only grouping, superset of the CAMEO+ domain names. */
export const GDELT_STORY_CATEGORIES = [
  "conflict_security", "cameoplus_political", "cameoplus_crime",
  "cameoplus_economic", "cameoplus_corporate", "cameoplus_technology",
  "cameoplus_infrastructure", "cameoplus_environment", "cameoplus_health",
  "cameoplus_demographic", "cameoplus_information",
  "CONFLICT", "CORPORATE", "CRIME", "DEMOGRAPHIC", "ECONOMIC",
  "ENVIRONMENT", "HEALTH", "INFORMATION", "INFRASTRUCTURE", "POLITICAL",
  "TECHNOLOGY",
] as const;

export const GDELT_SEARCH_MODES = ["semantic", "lexical"] as const;

export type GdeltRegion = (typeof GDELT_REGIONS)[number];
export type GdeltContinent = (typeof GDELT_CONTINENTS)[number];
export type GdeltCategory = (typeof GDELT_CATEGORIES)[number];
export type GdeltCameoDomain = (typeof GDELT_CAMEO_DOMAINS)[number];
export type GdeltStoryCategory = (typeof GDELT_STORY_CATEGORIES)[number];
export type GdeltSearchMode = (typeof GDELT_SEARCH_MODES)[number];

/**
 * Window bounds.
 *
 * Continuous events coverage begins 2026-03-01 and every window is capped at
 * 30 inclusive days, so a calendar month can be too long and long ranges must
 * be chunked.
 */
export type GdeltWindow = {
  /** Inclusive YYYY-MM-DD. */
  start_date?: string;
  /** Inclusive YYYY-MM-DD. */
  end_date?: string;
  /** 1-30. Used to complete a range when a bound is omitted. */
  days?: number;
};

/** Metric filters shared by search_events and summarize_events. */
export type GdeltMetricFilters = {
  significance_min?: number;
  significance_max?: number;
  confidence_min?: number;
  confidence_max?: number;
  goldstein_scale_min?: number;
  goldstein_scale_max?: number;
  magnitude_min?: number;
  magnitude_max?: number;
  systemic_importance_min?: number;
  systemic_importance_max?: number;
  propagation_potential_min?: number;
  propagation_potential_max?: number;
  market_sensitivity_min?: number;
  market_sensitivity_max?: number;
};

/** Country filters. `country` is location-or-actor-origin by default. */
export type GdeltGeoFilters = {
  country?: string[];
  source_actor_country?: string[];
  target_actor_country?: string[];
  actor_country?: string[];
  region?: GdeltRegion;
  continent?: GdeltContinent;
  admin1?: string;
};

/** search_events: 49 input parameters. */
export type SearchEventsInput = GdeltWindow &
  GdeltGeoFilters &
  GdeltMetricFilters & {
    source_actor_country?: string[];
    target_actor_country?: string[];
    bbox?: string;
    near?: string;
    radius_km?: number;
    languages?: string[];
    entity?: string;
    entity_match?: "coverage";
    office?: string;
    office_as_of?: string;
    event_family?: "conflict" | "cameoplus";
    category?: GdeltCategory;
    categories?: GdeltCategory[];
    subcategory?: string;
    domain?: GdeltCameoDomain;
    search?: string;
    search_mode?: GdeltSearchMode;
    country_match?: string;
    has_fatalities?: boolean;
    civilian_targeting?: boolean;
    sort?: "significance" | "recent";
    limit?: number;
    cursor?: string;
    include_images?: boolean;
    include_entity_images?: boolean;
    recorded_start?: string;
    recorded_end?: string;
  };

/** summarize_events: 33 input parameters. No cursor pagination. */
export type SummarizeEventsInput = GdeltWindow &
  GdeltMetricFilters & {
    group_by?:
      | "date"
      | "country"
      | "region"
      | "continent"
      | "category"
      | "subcategory"
      | "source_actor_country"
      | "target_actor_country";
    country?: string[];
    source_actor_country?: string[];
    target_actor_country?: string[];
    actor_country?: string[];
    region?: GdeltRegion;
    continent?: GdeltContinent;
    admin1?: string;
    event_family?: "conflict" | "cameoplus";
    category?: GdeltCategory;
    categories?: GdeltCategory[];
    subcategory?: string;
    domain?: GdeltCameoDomain;
    has_fatalities?: boolean;
    civilian_targeting?: boolean;
    limit?: number;
  };

/** get_event: fetch one Event by id. */
export type GetEventInput = {
  event_id: string;
  include_images?: boolean;
};

/** search_stories: 36 input parameters. */
export type SearchStoriesInput = GdeltWindow & {
  country?: string[];
  region?: GdeltRegion;
  continent?: GdeltContinent;
  admin1?: string;
  bbox?: string;
  languages?: string[];
  entity?: string;
  entity_match?: "coverage";
  office?: string;
  office_as_of?: string;
  category?: GdeltCategory;
  categories?: GdeltCategory[];
  subcategory?: string;
  story_category?: GdeltStoryCategory;
  event_category?: GdeltCategory;
  event_categories?: GdeltCategory[];
  domain?: GdeltCameoDomain;
  search?: string;
  search_mode?: GdeltSearchMode;
  country_match?: string;
  has_events?: boolean;
  has_fatalities?: boolean;
  civilian_targeting?: boolean;
  article_count_min?: number;
  article_count_max?: number;
  sort?: "significance" | "recent";
  limit?: number;
  cursor?: string;
  include_images?: boolean;
  include_entity_images?: boolean;
  related?: boolean;
  recorded_start?: string;
  recorded_end?: string;
};

/** summarize_stories: 21 input parameters. */
export type SummarizeStoriesInput = GdeltWindow & {
  group_by?:
    | "date"
    | "country"
    | "region"
    | "continent"
    | "category"
    | "subcategory"
    | "story_category"
    | "event_category";
  country?: string[];
  region?: GdeltRegion;
  continent?: GdeltContinent;
  admin1?: string;
  category?: GdeltCategory;
  categories?: GdeltCategory[];
  subcategory?: string;
  story_category?: GdeltStoryCategory;
  event_category?: GdeltCategory;
  event_categories?: GdeltCategory[];
  domain?: GdeltCameoDomain;
  has_events?: boolean;
  has_fatalities?: boolean;
  civilian_targeting?: boolean;
  article_count_min?: number;
  article_count_max?: number;
  limit?: number;
};

/** get_story: fetch one Story by id. */
export type GetStoryInput = {
  story_id: string;
  include_images?: boolean;
};

/** get_story_articles: the articles backing one Story. */
export type GetStoryArticlesInput = {
  story_id: string;
  limit?: number;
  cursor?: string;
  include_images?: boolean;
  language?: string[];
  publisher_country_iso3?: string;
};