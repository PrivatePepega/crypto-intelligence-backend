import 'dotenv/config';

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

const MARKETAUX_API_KEY = process.env.MARKETAUX_API_KEY;

if (!MARKETAUX_API_KEY) {
  console.error(
    'MARKETAUX_API_KEY is not set. Add it to your environment or a .env file next to the server. ' +
      'Get a token from https://www.marketaux.com/dashboard'
  );
  process.exit(1);
}

// stdout is the JSON-RPC channel, so every diagnostic below goes to stderr.
const handle = serveStdio(() => createServer(MARKETAUX_API_KEY), {
  onerror: (error) => console.error('Marketaux MCP stdio error:', error),
});

console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} running on stdio`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void handle.close().finally(() => process.exit(0));
  });
}
