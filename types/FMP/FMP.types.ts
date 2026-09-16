import { z } from "zod";


export interface FmpRussell2000RawObservation {
    symbol: string;
    date: string;
    open: number;
    close: number;
    change: number;
    changePercent: number;
    volume: number;
  }

  export const fmpRussell2000RawObservationSchema = z.object({
    symbol: z.string(),
    date: z.string(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    change: z.number(),
    changePercent: z.number(),
    vwap: z.number(),
    volume: z.number(),
  });
  
  export const fmpRussell2000ResponseSchema = z.array(
    fmpRussell2000RawObservationSchema,
  );