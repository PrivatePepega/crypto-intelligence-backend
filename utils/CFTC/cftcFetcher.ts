import { cftcTffResponseSchema } from "../../types/cftc/ctfc.types.js";

const CFTC_TFF_URL =
  "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

const CFTC_TFF_CONTRACT_CODES = [
  "133741", // Bitcoin
  "146021", // 50 ETH Ether Cash Settled
  "146022", // 0.1 ETH Micro Ethe
  "13874+",  // S&P 500 Consolidated
  "20974+",  // Nasdaq-100 Consolidated
  "042601",  // UST 2Y Note
  "043602",  // UST 10Y Note
  "099741",  // Euro FX
  "097741",  // Japanese Yen
  "098662",  // USD Index
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