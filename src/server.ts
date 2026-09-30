import { McpServer } from '@modelcontextprotocol/server';

import { MarketauxClient } from './marketaux/client.js';
import { SearchAllNewsTool } from './tools/SearchAllNewsTool.js';

export const SERVER_NAME = 'marketaux';
export const SERVER_VERSION = '1.1.0';

/**
 * Builds a server instance with every tool registered.
 *
 * This is a factory rather than a long-lived singleton so that `serveStdio`
 * can hand each connection its own instance.
 */
export function createServer(marketauxApiKey: string): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: 'Marketaux News',
      version: SERVER_VERSION,
      description: 'Search financial and market news via the Marketaux API.',
      websiteUrl: 'https://www.marketaux.com',
    },
    { capabilities: { tools: {} } }
  );

  const client = new MarketauxClient(marketauxApiKey);
  new SearchAllNewsTool(client).register(server);

  return server;
}
