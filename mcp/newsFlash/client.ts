import {
    Client,
    StreamableHTTPClientTransport,
  } from "@modelcontextprotocol/client";
  import "dotenv/config";
  
  const NEWSFLASH_MCP_URL =
    process.env.NEWSFLASH_MCP_URL ?? "https://newsflash.sh/mcp";
  
  const NEWSFLASH_API_KEY = process.env.NEWSFLASH_API_KEY;
  
  let clientPromise: Promise<Client> | null = null;
  
  const createNewsflashClient = async (): Promise<Client> => {
    const client = new Client({
      name: "crypto-intelligence-newsflash",
      version: "1.0.0",
    });
  
    const transport = new StreamableHTTPClientTransport(
      new URL(NEWSFLASH_MCP_URL),
      NEWSFLASH_API_KEY
        ? {
            requestInit: {
              headers: {
                Authorization: `Bearer ${NEWSFLASH_API_KEY}`,
              },
            },
          }
        : undefined,
    );
  
    await client.connect(transport);
  
    return client;
  };
  
  export const getNewsflashClient = async (): Promise<Client> => {
    if (clientPromise === null) {
      clientPromise = createNewsflashClient().catch((error) => {
        clientPromise = null;
        throw error;
      });
    }
  
    return clientPromise;
  };
  
  export const closeNewsflashClient = async (): Promise<void> => {
    if (clientPromise === null) {
      return;
    }
  
    const client = await clientPromise.catch(() => null);
  
    clientPromise = null;
  
    await client?.close();
  };