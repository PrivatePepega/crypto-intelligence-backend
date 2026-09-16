import { z } from "zod";



  export interface NormalizedCnnIndicator {
    indicator: string;
    frequency: "Daily";
    aggregation: "none";
    unit: string;
  
    observations: {
      date: string;
      value: number;
      rating: string;
    }[];
  
    historical: {
      date: string;
      value: number;
      rating: string;
    } | null;
  }

  const cnnHistoricalObservationSchema = z.object({
    x: z.number(),
    y: z.number(),
    rating: z.string(),
  });
  
  const cnnHistoricalIndicatorSchema = z.object({
    timestamp: z.number(),
    score: z.number(),
    rating: z.string(),
    data: z.array(cnnHistoricalObservationSchema),
  });
  
  const cnnCurrentFearGreedSchema = z.object({
    score: z.number(),
    rating: z.string(),
    timestamp: z.string(),
    previous_close: z.number(),
    previous_1_week: z.number(),
    previous_1_month: z.number(),
    previous_1_year: z.number(),
  });
  
  export const cnnFearGreedResponseSchema = z.object({
    data: z.object({
      fear_and_greed: cnnCurrentFearGreedSchema,
      fear_and_greed_historical: cnnHistoricalIndicatorSchema,
  
      market_momentum_sp500: cnnHistoricalIndicatorSchema,
      market_momentum_sp125: cnnHistoricalIndicatorSchema,
  
      stock_price_strength: cnnHistoricalIndicatorSchema,
      stock_price_breadth: cnnHistoricalIndicatorSchema,
  
      put_call_options: cnnHistoricalIndicatorSchema,
  
      market_volatility_vix: cnnHistoricalIndicatorSchema,
      market_volatility_vix_50: cnnHistoricalIndicatorSchema,
  
      safe_haven_demand: cnnHistoricalIndicatorSchema,
    }),
  });
  
  export type CnnFearGreedResponse = z.infer<
    typeof cnnFearGreedResponseSchema
  >;