import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const marketauxMcpPath = process.env.MARKETAUX_MCP_PATH;

if (!marketauxMcpPath) {
  throw new Error("MARKETAUX_MCP_PATH is not set");
}

export const marketauxClient = new Client({
  name: "crypto-intelligence-backend",
  version: "1.0.0",
});

export const marketauxTransport = new StdioClientTransport({
  command: "node",
  args: [marketauxMcpPath],
});

export async function connectMarketauxMcp() {
  await marketauxClient.connect(marketauxTransport);

  console.log("Connected to MarketAux MCP");
}