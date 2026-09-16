import { fmpRussell2000ResponseSchema } from "../../types/FMP/FMP.types.js";

const FMP_BASE_URL =
  "https://financialmodelingprep.com/stable";

export async function fetchRussell2000History() {
  const params = new URLSearchParams({
    symbol: "^RUT",
    apikey: process.env.FMP_API_KEY!,
  });

  const response = await fetch(
    `${FMP_BASE_URL}/historical-price-eod/full?${params}`,
  );

  if (!response.ok) {
    throw new Error(
      `FMP Russell 2000 request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  return fmpRussell2000ResponseSchema.parse(data);
}