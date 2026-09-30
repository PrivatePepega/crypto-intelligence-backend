import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? "http://localhost:5000/mcp";

const MCP_API_KEY = process.env.MCP_API_KEY;

let clientPromise: Promise<Client> | null = null;

const createMcpClient = async (): Promise<Client> => {
  const client = new Client({
    name: "crypto-intelligence-observer",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(MCP_SERVER_URL),
    MCP_API_KEY
      ? {
          requestInit: {
            headers: {
              Authorization: `Bearer ${MCP_API_KEY}`,
            },
          },
        }
      : undefined,
  );

  await client.connect(transport);

  const { tools } = await client.listTools();

  const marketauxTool = tools.find(
    (tool) => tool.name === "marketaux_news_search",
  );

  if (!marketauxTool) {
    await client.close();

    throw new Error(
      'MCP server does not expose the required "marketaux_news_search" tool.',
    );
  }

  return client;
};

export const getMcpClient = async (): Promise<Client> => {
  if (clientPromise === null) {
    clientPromise = createMcpClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
};

export const callMcpTool = async (
  name: string,
  arguments_: Record<string, unknown>,
  signal?: AbortSignal,
) => {
  const client = await getMcpClient();

  return await client.callTool(
    {
      name,
      arguments: arguments_,
    },
    undefined,
    {
      signal,
    },
  );
};

export const closeMcpClient = async (): Promise<void> => {
  if (clientPromise === null) {
    return;
  }

  const client = await clientPromise.catch(() => null);
  clientPromise = null;

  await client?.close();
};
