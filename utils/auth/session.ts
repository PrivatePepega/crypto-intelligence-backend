import { createHash, randomBytes } from "node:crypto";

import type { CookieOptions } from "express";

const isProduction = process.env.NODE_ENV === "production";

/**
 * In production the `__Host-` prefix prevents a subdomain from overwriting the
 * session cookie. The prefix requires Secure, Path=/, and no Domain. Local HTTP
 * development uses a plain name so the cookie still works.
 */
export const AUTH_COOKIE_NAME = isProduction ? "__Host-token" : "token";

/** Fixed lifetime for both the JWT and its database session. */
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

/**
 * The JWT is stored only in this cookie. `httpOnly` keeps it out of reach of
 * page JavaScript, which limits XSS token theft, and `sameSite` limits when the
 * browser sends it on cross-site requests.
 */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

/** Creates a high-entropy opaque session identifier. */
export const createSessionToken = (): string => randomBytes(32).toString("base64url");

/** PostgreSQL stores only a one-way hash, never the raw session identifier. */
export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
