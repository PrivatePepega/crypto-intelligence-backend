import { z } from "zod";

const fxDailyRecordSchema = z.object({
  "1. open": z.string(),
  "2. high": z.string(),
  "3. low": z.string(),
  "4. close": z.string(),
});

const fxMetaDataSchema = z.object({
  "1. Information": z.string(),
  "2. From Symbol": z.string(),
  "3. To Symbol": z.string(),
  "4. Output Size": z.string(),
  "5. Last Refreshed": z.string(),
  "6. Time Zone": z.string(),
});

const fxTimeSeriesSchema = z.record(
  z.string(),
  fxDailyRecordSchema,
);

export const fxResponseSchema = z.object({
  "Meta Data": fxMetaDataSchema,
  "Time Series FX (Daily)": fxTimeSeriesSchema,
});

export const fxResponsesSchema = z.array(fxResponseSchema);

export type FxDailyRecord = z.infer<typeof fxDailyRecordSchema>;
export type FxMetaData = z.infer<typeof fxMetaDataSchema>;
export type FxTimeSeries = z.infer<typeof fxTimeSeriesSchema>;
export type FxResponse = z.infer<typeof fxResponseSchema>;
export type FxResponses = z.infer<typeof fxResponsesSchema>;




export const commodityPriceDataSchema = z.object({
  date: z.string(),
  price: z.string(),
});

export const commodityPriceResponseSchema = z.object({
  nominal: z.string(),
  data: z.array(commodityPriceDataSchema),
});

export const commodityValueDataSchema = z.object({
  date: z.string(),
  value: z.string(),
});

export const commodityValueResponseSchema = z.object({
  name: z.string(),
  interval: z.string(),
  unit: z.string(),
  data: z.array(commodityValueDataSchema),
});

export type CommodityPriceData = z.infer<
  typeof commodityPriceDataSchema
>;

export type CommodityPriceResponse = z.infer<
  typeof commodityPriceResponseSchema
>;

export type CommodityValueData = z.infer<
  typeof commodityValueDataSchema
>;

export type CommodityValueResponse = z.infer<
  typeof commodityValueResponseSchema
>;

