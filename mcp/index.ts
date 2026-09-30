import { createMcpHandler } from "@modelcontextprotocol/server";
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";

import { createMcpServer, resolveMcpProviders } from "./server.js";

export { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./server.js";
export type { ResolvedMcpProviders } from "./server.js";

/** Mount path for the MCP endpoint. Override with `MCP_PATH`. */
export const MCP_PATH: string = process.env.MCP_PATH ?? "/mcp";

/**
 * Localhost is always allowed. It is not a DNS-rebinding target: an attacker
 * who could send `Host: localhost` from a browser would already have script
 * execution on the machine running the server.
 */
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Allowed `Host` header hostnames, for DNS-rebinding protection.
 *
 * The SDK guard matches the hostname only (port-agnostic). The deployed
 * hostname must be listed in `MCP_ALLOWED_HOSTS` or every MCP request is
 * rejected with 403.
 */
export function resolveAllowedHosts(): string[] {
  return [
    ...new Set([...LOCAL_HOSTNAMES, ...splitList(process.env.MCP_ALLOWED_HOSTS)]),
  ];
}

/**
 * Allowed `Origin` hostnames. Requests with no `Origin` header (every
 * non-browser MCP client) pass the guard regardless of this list.
 */
export function resolveAllowedOrigins(): string[] {
  return [
    ...new Set([
      ...LOCAL_HOSTNAMES,
      ...splitList(process.env.MCP_ALLOWED_ORIGINS),
    ]),
  ];
}

/**
 * Optional shared-secret gate for the MCP endpoint.
 *
 * The SDK performs no token verification, and this endpoint spends a paid API
 * quota, so an unauthenticated deployment is a real cost and abuse risk. When
 * `MCP_API_KEY` is unset the endpoint still runs, but startup logs a loud
 * warning.
 */
function buildApiKeyGuard(): (req: Request, res: Response, next: NextFunction) => void {
  const expected = process.env.MCP_API_KEY;

  if (!expected) {
    console.warn(
      "[mcp] WARNING: MCP_API_KEY is not set. The MCP endpoint is reachable " +
        "without authentication and can spend the Marketaux API quota. Set " +
        "MCP_API_KEY before exposing this server to a network.",
    );

    return (_req, _res, next) => next();
  }

  const expectedBuffer = Buffer.from(expected, "utf8");

  return (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const presented = Buffer.from(match?.[1] ?? "", "utf8");

    // timingSafeEqual throws on a length mismatch, so compare lengths first.
    const authorised =
      presented.length === expectedBuffer.length &&
      timingSafeEqual(presented, expectedBuffer);

    if (!authorised) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }

    next();
  };
}

let closeHandler: (() => Promise<void>) | null = null;

/**
 * Resolves the provider modules and mounts the MCP endpoint on the Express
 * app.
 *
 * Call this before `app.listen()`: provider configuration is validated at this
 * point, so a misconfigured provider is reported at boot rather than on the
 * first tool call.
 *
 * Mounts on the same Express app and port as the REST API, so MCP needs no
 * second process or second listener.
 */
export function mountMcpServer(app: Express): void {
  const providers = resolveMcpProviders();

  const handler = createMcpHandler(() => createMcpServer(), {
    onerror: (error) => {
      console.error("[mcp] server error:", error);
    },
  });

  closeHandler = () => handler.close();

  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => {
      console.error("[mcp] transport error:", error);
    },
  });

  const allowHost = hostHeaderValidation(resolveAllowedHosts());
  const allowOrigin = originValidation(resolveAllowedOrigins());
  const requireApiKey = buildApiKeyGuard();

  app.all(
    MCP_PATH,
    (req: Request, res: Response, next: NextFunction) => {
      // Each guard answers the request itself when it rejects it.
      if (!allowHost(req, res)) return;
      if (!allowOrigin(req, res)) return;

      requireApiKey(req, res, (err?: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      // `express.json()` has already drained the request stream, so the
      // parsed body has to be handed over explicitly. Only POSTs carry one:
      // passing `req.body` for GET/DELETE would classify a body-less session
      // operation as if it had a payload.
      const parsedBody = req.method === "POST" ? req.body : undefined;

      void nodeHandler(req, res, parsedBody);
    },
  );

  const enabled = providers.enabled.length > 0
    ? providers.enabled.join(", ")
    : "none";

  console.log(
    `[mcp] mounted at ${MCP_PATH} (providers: ${enabled}` +
      `${providers.disabled.length > 0 ? `; disabled: ${providers.disabled.join(", ")}` : ""})` +
      `${process.env.MCP_API_KEY ? "" : "; UNAUTHENTICATED"}`,
  );
}

/** Tears down in-flight MCP exchanges. Call on graceful shutdown. */
export async function closeMcpServer(): Promise<void> {
  await closeHandler?.();
  closeHandler = null;
}
