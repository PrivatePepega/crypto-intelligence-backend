import type {
  GdeltCategory,
  GdeltStoryCategory,
} from "../gdelt.types.js";

export const gdeltAgentTopics = [
  "geopolitics",
  "finance",
  "crypto",
  "technology",
  "energy",
  "macro",
  "regulation",
] as const;

export type GdeltAgentTopic =
  (typeof gdeltAgentTopics)[number];

type GdeltTopicConfig = {
  eventCategories: GdeltCategory[];
  /**
   * Story categories, NOT event categories.
   *
   * `search_stories` takes two distinct vocabularies: `categories` /
   * `event_categories` are the event enum (Battles, Protests, ECONOMIC, ...)
   * while `story_category` is the story enum (CONFLICT, conflict_security,
   * cameoplus_economic, ...). Typed separately so the two cannot be mixed.
   */
  storyCategories: GdeltStoryCategory[];
  search: string;
};

export const GDELT_TOPIC_MAP: Record<
  GdeltAgentTopic,
  GdeltTopicConfig
> = {
  geopolitics: {
    eventCategories: [
      "POLITICAL",
      "Battles",
      "Protests",
      "Riots",
      "Explosions/Remote violence",
      "Violence against civilians",
      "Strategic developments",
    ],
    // Story categories only. The ACLED sub-types in eventCategories above
    // (Battles, Protests, Riots, ...) are EVENT categories and are rejected by
    // `story_category`, which takes the story enum instead
    // (CONFLICT, conflict_security, cameoplus_*).
    //
    // This list previously duplicated eventCategories, so 6 of its 7 entries
    // matched nothing and the topic spent 7 requests to get 1 result back.
    storyCategories: ["POLITICAL"],
    search:
      "geopolitics diplomacy war conflict sanctions international relations",
  },

  finance: {
    eventCategories: [
      "ECONOMIC",
      "CORPORATE",
    ],
    storyCategories: [
      "ECONOMIC",
      "CORPORATE",
    ],
    search:
      "financial markets banking stocks bonds investment",
  },

  crypto: {
    eventCategories: [
      "ECONOMIC",
      "CORPORATE",
      "TECHNOLOGY",
      "INFORMATION",
    ],
    storyCategories: [
      "ECONOMIC",
      "CORPORATE",
      "TECHNOLOGY",
      "INFORMATION",
    ],
    search:
      "crypto cryptocurrency Bitcoin Ethereum blockchain DeFi stablecoins",
  },

  technology: {
    eventCategories: [
      "TECHNOLOGY",
      "CORPORATE",
    ],
    storyCategories: [
      "TECHNOLOGY",
      "CORPORATE",
    ],
    search:
      "technology artificial intelligence software semiconductors computing",
  },

  energy: {
    eventCategories: [
      "ECONOMIC",
      "CORPORATE",
      "ENVIRONMENT",
    ],
    storyCategories: [
      "ECONOMIC",
      "CORPORATE",
      "ENVIRONMENT",
    ],
    search:
      "energy oil gas electricity power nuclear renewables",
  },

  macro: {
    eventCategories: [
      "ECONOMIC",
      "POLITICAL",
    ],
    storyCategories: [
      "ECONOMIC",
      "POLITICAL",
    ],
    search:
      "macroeconomics inflation interest rates employment GDP central banks",
  },

  regulation: {
    eventCategories: [
      "POLITICAL",
      "ECONOMIC",
      "CORPORATE",
    ],
    storyCategories: [
      "POLITICAL",
      "ECONOMIC",
      "CORPORATE",
    ],
    search:
      "regulation legislation policy government regulators law",
  },
};