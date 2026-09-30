import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? "http://localhost:5000/mcp";

const MCP_API_KEY = process.env.MCP_API_KEY;

let clientPromise: Promise<Client> | null = null;

// --------------------------------------------------
// MCP client
// --------------------------------------------------

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

// --------------------------------------------------
// Get client
// --------------------------------------------------

export const getMcpClient = async (): Promise<Client> => {
  if (clientPromise === null) {
    clientPromise = createMcpClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
};

// --------------------------------------------------
// Call MCP tool
// --------------------------------------------------

export const callMcpTool = async (
  name: string,
  arguments_: Record<string, unknown>,
  signal?: AbortSignal,
) => {
  const client = await getMcpClient();

  const options = signal ? { signal } : undefined;

  const result = await client.callTool(
    {
      name,
      arguments: arguments_,
    },
    options,
  );

  if (result.isError) {
    const message = result.content
      .filter(
        (item): item is { type: "text"; text: string } =>
          item.type === "text",
      )
      .map((item) => item.text)
      .join("\n");

    throw new Error(
      message || `MCP tool "${name}" returned an error.`,
    );
  }

  if (
    "structuredContent" in result &&
    result.structuredContent !== undefined
  ) {
    return result.structuredContent;
  }

  const textContent = result.content
    .filter(
      (item): item is { type: "text"; text: string } =>
        item.type === "text",
    )
    .map((item) => item.text)
    .join("\n");

  if (!textContent) {
    throw new Error(
      `MCP tool "${name}" returned no structured or text content.`,
    );
  }

  return textContent;
};

// --------------------------------------------------
// Close
// --------------------------------------------------

export const closeMcpClient = async (): Promise<void> => {
  if (clientPromise === null) {
    return;
  }

  const client = await clientPromise.catch(() => null);

  clientPromise = null;

  await client?.close();
};