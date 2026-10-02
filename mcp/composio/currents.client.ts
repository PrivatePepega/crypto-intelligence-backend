import { Composio } from "@composio/core";
import "dotenv/config";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const userId = process.env.COMPOSIO_USER_ID;

if (!userId) {
  throw new Error("Missing COMPOSIO_USER_ID");
}

let sessionPromise: ReturnType<typeof composio.create> | null = null;

const getSession = async () => {
  if (!sessionPromise) {
    sessionPromise = composio.create(userId, {
      toolkits: ["currents_api"],
      manageConnections: {
        waitForConnections: true,
      },
    });
  }

  return sessionPromise;
};

export const executeCurrentsTool = async (
  toolSlug: string,
  arguments_: Record<string, unknown>,
) => {
  const session = await getSession();

  return session.execute(toolSlug, arguments_);
};

