import { cftcTffResponseSchema } from "../../types/cftc/ctfc.types.js";

const CFTC_TFF_URL =
  "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

const CFTC_TFF_CONTRACT_CODES = [
  "133741", // BITCOIN
  "146021", // ETHER CASH SETTLED
  "146022", // MICRO ETHER
  "13874+",  // S&P 500 Consolidated
  "20974+",  // NASDAQ-100 Consolidated
  "042601",  // UST 2Y NOTE
  "043602",  // UST 10Y NOTE
  "099741",  // EURO FX
  "097741",  // JAPANESE YEN
  "098662",  // USD INDEX
] as const;

export async function fetchCftcTff() {
  const params = new URLSearchParams({
    $where: `cftc_contract_market_code in (${CFTC_TFF_CONTRACT_CODES
      .map((code) => `'${code}'`)
      .join(",")})`,
    $order: "report_date_as_yyyy_mm_dd desc",
    $limit: "50000",
  });

  const response = await fetch(`${CFTC_TFF_URL}?${params}`);

  if (!response.ok) {
    throw new Error(
      `CFTC TFF request failed: ${response.status} ${response.statusText}`,
    );
  }
  
  const result: unknown = await response.json();

return cftcTffResponseSchema.parse(result);
}