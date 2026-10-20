CREATE SCHEMA IF NOT EXISTS climate;

CREATE TABLE climate.climate_briefs (
    -- Identity and relationship
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intelligence_sets_id UUID NOT NULL
        REFERENCES intelligence_sets.daily_sets(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Human Brief: frontend-ready text
    human_brief_global_overview TEXT,
    human_brief_macro_market_regime TEXT,
    human_brief_sector_conditions TEXT,
    human_brief_important_stories_narratives TEXT,
    human_brief_trends_capital_direction TEXT,
    human_brief_outlook_risks_uncertainties TEXT,

    -- AI Context Brief: structured agent context
    ai_context_brief_global_overview JSONB,
    ai_context_brief_macro_market_regime JSONB,
    ai_context_brief_sector_conditions JSONB,
    ai_context_brief_important_stories_narratives JSONB,
    ai_context_brief_trends_capital_direction JSONB,
    ai_context_brief_outlook_risks_uncertainties JSONB,

    -- 01. Global Overview
    global_overview_data JSONB,
    global_overview_researcher JSONB,
    global_overview_analysis JSONB,

    -- 02. Macro & Market Regime
    macro_market_regime_data JSONB,
    macro_market_regime_relevance_router JSONB,
    macro_market_regime_researcher JSONB,
    macro_market_regime_analysis JSONB,

    -- 03. Sector Conditions: geopolitics
    sector_conditions_geopolitics_data JSONB,
    sector_conditions_geopolitics_relevance_router JSONB,
    sector_conditions_geopolitics_researcher JSONB,
    sector_conditions_geopolitics_analysis JSONB,

    -- 03. Sector Conditions: financial markets
    sector_conditions_financial_markets_data JSONB,
    sector_conditions_financial_markets_relevance_router JSONB,
    sector_conditions_financial_markets_researcher JSONB,
    sector_conditions_financial_markets_analysis JSONB,

    -- 03. Sector Conditions: macro
    sector_conditions_macro_data JSONB,
    sector_conditions_macro_relevance_router JSONB,
    sector_conditions_macro_researcher JSONB,
    sector_conditions_macro_analysis JSONB,

    -- 03. Sector Conditions: commodities and energy
    sector_conditions_commodities_energy_data JSONB,
    sector_conditions_commodities_energy_relevance_router JSONB,
    sector_conditions_commodities_energy_researcher JSONB,
    sector_conditions_commodities_energy_analysis JSONB,

    -- 03. Sector Conditions: crypto
    sector_conditions_crypto_data JSONB,
    sector_conditions_crypto_relevance_router JSONB,
    sector_conditions_crypto_researcher JSONB,
    sector_conditions_crypto_analysis JSONB,

    -- 03. Sector Conditions: AI, technology and industry
    sector_conditions_ai_technology_industry_data JSONB,
    sector_conditions_ai_technology_industry_relevance_router JSONB,
    sector_conditions_ai_technology_industry_researcher JSONB,
    sector_conditions_ai_technology_industry_analysis JSONB,

    -- 04. Important Stories & Narratives: geopolitics
    important_stories_narratives_geopolitics_data JSONB,
    important_stories_narratives_geopolitics_relevance_router JSONB,
    important_stories_narratives_geopolitics_researcher JSONB,
    important_stories_narratives_geopolitics_analysis JSONB,

    -- 04. Important Stories & Narratives: financial markets
    important_stories_narratives_financial_markets_data JSONB,
    important_stories_narratives_financial_markets_relevance_router JSONB,
    important_stories_narratives_financial_markets_researcher JSONB,
    important_stories_narratives_financial_markets_analysis JSONB,

    -- 04. Important Stories & Narratives: macro
    important_stories_narratives_macro_data JSONB,
    important_stories_narratives_macro_relevance_router JSONB,
    important_stories_narratives_macro_researcher JSONB,
    important_stories_narratives_macro_analysis JSONB,

    -- 04. Important Stories & Narratives: commodities and energy
    important_stories_narratives_commodities_energy_data JSONB,
    important_stories_narratives_commodities_energy_relevance_router JSONB,
    important_stories_narratives_commodities_energy_researcher JSONB,
    important_stories_narratives_commodities_energy_analysis JSONB,

    -- 04. Important Stories & Narratives: crypto
    important_stories_narratives_crypto_data JSONB,
    important_stories_narratives_crypto_relevance_router JSONB,
    important_stories_narratives_crypto_researcher JSONB,
    important_stories_narratives_crypto_analysis JSONB,

    -- 04. Important Stories & Narratives: AI, technology and industry
    important_stories_narratives_ai_technology_industry_data JSONB,
    important_stories_narratives_ai_technology_industry_relevance_router JSONB,
    important_stories_narratives_ai_technology_industry_researcher JSONB,
    important_stories_narratives_ai_technology_industry_analysis JSONB,

    -- 05. Trends & Capital Direction: geopolitics
    trends_capital_direction_geopolitics_data JSONB,
    trends_capital_direction_geopolitics_relevance_router JSONB,
    trends_capital_direction_geopolitics_researcher JSONB,
    trends_capital_direction_geopolitics_analysis JSONB,

    -- 05. Trends & Capital Direction: financial markets
    trends_capital_direction_financial_markets_data JSONB,
    trends_capital_direction_financial_markets_relevance_router JSONB,
    trends_capital_direction_financial_markets_researcher JSONB,
    trends_capital_direction_financial_markets_analysis JSONB,

    -- 05. Trends & Capital Direction: macro
    trends_capital_direction_macro_data JSONB,
    trends_capital_direction_macro_relevance_router JSONB,
    trends_capital_direction_macro_researcher JSONB,
    trends_capital_direction_macro_analysis JSONB,

    -- 05. Trends & Capital Direction: commodities and energy
    trends_capital_direction_commodities_energy_data JSONB,
    trends_capital_direction_commodities_energy_relevance_router JSONB,
    trends_capital_direction_commodities_energy_researcher JSONB,
    trends_capital_direction_commodities_energy_analysis JSONB,

    -- 05. Trends & Capital Direction: crypto
    trends_capital_direction_crypto_data JSONB,
    trends_capital_direction_crypto_relevance_router JSONB,
    trends_capital_direction_crypto_researcher JSONB,
    trends_capital_direction_crypto_analysis JSONB,

    -- 05. Trends & Capital Direction: AI, technology and industry
    trends_capital_direction_ai_technology_industry_data JSONB,
    trends_capital_direction_ai_technology_industry_relevance_router JSONB,
    trends_capital_direction_ai_technology_industry_researcher JSONB,
    trends_capital_direction_ai_technology_industry_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: geopolitics
    outlook_risks_uncertainties_geopolitics_data JSONB,
    outlook_risks_uncertainties_geopolitics_relevance_router JSONB,
    outlook_risks_uncertainties_geopolitics_researcher JSONB,
    outlook_risks_uncertainties_geopolitics_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: financial markets
    outlook_risks_uncertainties_financial_markets_data JSONB,
    outlook_risks_uncertainties_financial_markets_relevance_router JSONB,
    outlook_risks_uncertainties_financial_markets_researcher JSONB,
    outlook_risks_uncertainties_financial_markets_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: macro
    outlook_risks_uncertainties_macro_data JSONB,
    outlook_risks_uncertainties_macro_relevance_router JSONB,
    outlook_risks_uncertainties_macro_researcher JSONB,
    outlook_risks_uncertainties_macro_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: commodities and energy
    outlook_risks_uncertainties_commodities_energy_data JSONB,
    outlook_risks_uncertainties_commodities_energy_relevance_router JSONB,
    outlook_risks_uncertainties_commodities_energy_researcher JSONB,
    outlook_risks_uncertainties_commodities_energy_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: crypto
    outlook_risks_uncertainties_crypto_data JSONB,
    outlook_risks_uncertainties_crypto_relevance_router JSONB,
    outlook_risks_uncertainties_crypto_researcher JSONB,
    outlook_risks_uncertainties_crypto_analysis JSONB,

    -- 06. Outlook, Risks & Uncertainties: AI, technology and industry
    outlook_risks_uncertainties_ai_technology_industry_data JSONB,
    outlook_risks_uncertainties_ai_technology_industry_relevance_router JSONB,
    outlook_risks_uncertainties_ai_technology_industry_researcher JSONB,
    outlook_risks_uncertainties_ai_technology_industry_analysis JSONB
);