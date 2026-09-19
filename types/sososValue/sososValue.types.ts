import { z } from "zod";

export const sosoValueEtfSymbolSchema = z.enum([
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "DOGE",
  "LINK",
]);

export type SosoValueEtfSymbol = z.infer<
  typeof sosoValueEtfSymbolSchema
>;

export const sosoValueEtfModeSchema = z.enum([
  "full",
  "latest",
]);

export type SosoValueEtfMode = z.infer<
  typeof sosoValueEtfModeSchema
>;

export const sosoValueEtfRowSchema = z.object({
  date: z.string(),
  total_net_inflow: z.coerce.number(),
  total_value_traded: z.coerce.number(),
  total_net_assets: z.coerce.number(),
  cum_net_inflow: z.coerce.number(),
});

export const sosoValueEtfResponseSchema = z.array(
  sosoValueEtfRowSchema
);

export const sosoValueEtfDataSchema = z.object({
  asset: sosoValueEtfSymbolSchema,
  countryCode: z.literal("US"),

  current: z.object({
    netFlow: z.number(),
    valueTraded: z.number(),
    netAssets: z.number(),
    cumulativeNetFlow: z.number(),
    observedAt: z.string(),
  }),

  history: z.array(
    z.object({
      date: z.string(),
      netFlow: z.number(),
      valueTraded: z.number(),
      netAssets: z.number(),
      cumulativeNetFlow: z.number(),
    })
  ),
});

export type SosoValueEtfData = z.infer<
  typeof sosoValueEtfDataSchema
>;