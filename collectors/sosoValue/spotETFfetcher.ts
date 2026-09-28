import axios from "axios";

import {
  sosoValueEtfResponseSchema,
  type SosoValueEtfData,
  type SosoValueEtfMode,
  type SosoValueEtfSymbol,
} from "../../types/sososValue/sososValue.types.js";

const SOSOVALUE_BASE_URL =
  "https://openapi.sosovalue.com/openapi/v1";

const SOSOVALUE_LATEST_LIMIT = 3;

const sosovalueClient = axios.create({
  baseURL: SOSOVALUE_BASE_URL,
  headers: {
    Accept: "application/json",
  },
});

export async function fetchSosoValueEtfHistory(
  symbol: SosoValueEtfSymbol,
  mode: SosoValueEtfMode
) {
  const apiKey = process.env.SOSOVALUE_API_KEY;

  if (!apiKey) {
    throw new Error("SOSOVALUE_API_KEY is not configured");
  }

  const limit =
    mode === "latest"
      ? SOSOVALUE_LATEST_LIMIT
      : 30;

  const response = await sosovalueClient.get(
    "/etfs/summary-history",
    {
      params: {
        symbol,
        country_code: "US",
        limit,
      },
      headers: {
        "x-soso-api-key": apiKey,
      },
    }
  );

  return sosoValueEtfResponseSchema.parse(
    response.data.data
  );
}

function normalizeSosoValueEtf(
  symbol: SosoValueEtfSymbol,
  rows: ReturnType<
    typeof sosoValueEtfResponseSchema.parse
  >
): SosoValueEtfData {
  if (rows.length === 0) {
    throw new Error(
      `No SoSoValue ETF data returned for ${symbol}`
    );
  }

  // Store history newest first.
  const sortedRows = [...rows].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  // Always derive current from the newest history observation.
  const latest = sortedRows[0]!;

  return {
    asset: symbol,
    countryCode: "US",

    current: {
      netFlow: latest.total_net_inflow,
      valueTraded: latest.total_value_traded,
      netAssets: latest.total_net_assets,
      cumulativeNetFlow: latest.cum_net_inflow,
      observedAt: latest.date,
    },

    history: sortedRows.map((row) => ({
      date: row.date,
      netFlow: row.total_net_inflow,
      valueTraded: row.total_value_traded,
      netAssets: row.total_net_assets,
      cumulativeNetFlow: row.cum_net_inflow,
    })),
  };
}

export async function collectSosoValueEtf(
  symbol: SosoValueEtfSymbol,
  mode: SosoValueEtfMode
): Promise<SosoValueEtfData> {
  const rows = await fetchSosoValueEtfHistory(
    symbol,
    mode
  );

  return normalizeSosoValueEtf(symbol, rows);
}

export async function collectAllSosoValueEtfs(
  mode: SosoValueEtfMode
): Promise<SosoValueEtfData[]> {
  const symbols: SosoValueEtfSymbol[] = [
    "BTC", //spot_etf_btc
    "ETH", //spot_etf_eth
    "SOL", //spot_etf_sol
    "XRP", //spot_etf_xrp
    "DOGE", //spot_etf_doge
    "LINK", //spot_etf_link
  ];

  return Promise.all(
    symbols.map((symbol) =>
      collectSosoValueEtf(symbol, mode)
    )
  );
}