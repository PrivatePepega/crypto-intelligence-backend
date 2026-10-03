export type SearchEventsInput = {
    search?: string;
    days?: number;
    categories?: string[];
    search_mode?: "semantic" | "lexical";
  
    significance_min?: number;
    significance_max?: number;
  
    propagation_potential_min?: number;
    propagation_potential_max?: number;
  
    market_sensitivity_min?: number;
    market_sensitivity_max?: number;
  
    sort?: "significance" | "recent";
  };