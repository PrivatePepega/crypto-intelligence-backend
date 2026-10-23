import type { Request, Response } from "express";

import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from "jose";
import jwt from "jsonwebtoken";
import { z } from "zod";

import pool from "../config/database.js";
import {
  AUTH_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
  authCookieOptions,
  createSessionToken,
  hashSessionToken,
} from "../utils/auth/session.js";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * The frontend completes the Google OAuth flow and sends the resulting ID token.
 *
 * `credential` is the field used by Google Identity Services; `idToken` is
 * accepted as a clearer alias for other clients.
 */
export const googleLoginSchema = z
  .object({
    credential: z.string().trim().min(1).optional(),
    idToken: z.string().trim().min(1).optional(),
  })
  .refine((body) => Boolean(body.credential ?? body.idToken), {
    message: "A Google ID token is required",
  });

type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

interface AccountRow {
  id: string;
  email: string;
}

/**
 * Reads auth configuration at request time so a missing variable produces a
 * clear error response instead of preventing the server from booting.
 */
const readAuthConfig = (): { googleClientId: string; jwtSecret: string } | null => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const jwtSecret = process.env.JWT_SECRET;

  if (!googleClientId || !jwtSecret) {
    return null;
  }

  return { googleClientId, jwtSecret };
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";

/**
 * Creates the account on first Google login and logs in on later ones.
 *
 * The email comes from the verified Google ID token, not from a client-supplied
 * field, so a caller cannot claim an arbitrary email address.
 */
export const googleLogin = async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");

  const config = readAuthConfig();

  if (!config) {
    console.error(
      "Google login is not configured. Set GOOGLE_CLIENT_ID and JWT_SECRET in the environment.",
    );
    return res.status(500).json({ message: "Authentication is not configured" });
  }

  const { credential, idToken } = req.body as GoogleLoginInput;
  const googleIdToken = credential ?? idToken;

  if (!googleIdToken) {
    return res.status(400).json({ message: "A Google ID token is required" });
  }

  let claims: JWTPayload;

  try {
    const result = await jwtVerify(googleIdToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: config.googleClientId,
    });

    claims = result.payload;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return res.status(401).json({ message: "Invalid Google credential" });
    }

    console.error("Google credential verification failed:", error);
    return res.status(500).json({ message: "Could not verify Google credential" });
  }

  const googleSub = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";

  if (!googleSub || !email || !emailVerified) {
    return res.status(401).json({
      message: "Google account must have a verified email address",
    });
  }

  let account: AccountRow;

  try {
    const result = await pool.query<AccountRow>(
      `INSERT INTO accounts.users (google_sub, email)
       VALUES ($1, $2)
       ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email
       RETURNING id, email`,
      [googleSub, email],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Account upsert returned no row");
    }

    account = row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        message: "That email is already linked to another account",
      });
    }

    console.error("Google login database error:", error);
    return res.status(500).json({ message: "Could not create or load the account" });
  }

  const sessionToken = createSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);

  let sessionJwt: string;

  try {
    sessionJwt = jwt.sign(
      {
        userId: account.id,
        purpose: "login",
      },
      config.jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: SESSION_DURATION_SECONDS,
        jwtid: sessionToken,
      },
    );
  } catch (error) {
    console.error("Session token signing failed:", error);
    return res.status(500).json({ message: "Could not create the session" });
  }

  try {
    // Remove this account's expired sessions before creating a new one.
    await pool.query("DELETE FROM accounts.sessions WHERE user_id = $1 AND expires_at <= NOW()", [
      account.id,
    ]);

    await pool.query(
      `INSERT INTO accounts.sessions (user_id, session_token_hash, expires_at)
       VALUES ($1, $2, NOW() + make_interval(secs => $3))`,
      [account.id, sessionTokenHash, SESSION_DURATION_SECONDS],
    );
  } catch (error) {
    console.error("Session creation failed:", error);
    return res.status(500).json({ message: "Could not create the session" });
  }

  res.cookie(AUTH_COOKIE_NAME, sessionJwt, {
    ...authCookieOptions,
    maxAge: SESSION_DURATION_MS,
  });

  return res.status(200).json({
    user: {
      id: account.id,
      email: account.email,
    },
  });
};

/**
 * Returns the account that authMiddleware loaded from PostgreSQL.
 *
 * A missing `req.user` means the request did not pass the auth middleware, so
 * the endpoint refuses to return anything.
 */
export const getCurrentUser = (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return res.status(200).json({
    user: {
      id: req.user.id,
      email: req.user.email,
      createdAt: req.user.created_at,
    },
  });
};

/**
 * Revokes the presented database session and clears the cookie. Signing out is
 * idempotent, so a missing, invalid, or expired token still clears the cookie.
 */
export const signout = async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");

  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const jwtSecret = process.env.JWT_SECRET;
  let revokeError: unknown = null;

  if (typeof token === "string" && token.length > 0 && jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

      if (
        typeof decoded !== "string" &&
        typeof decoded.jti === "string" &&
        typeof decoded.userId === "string" &&
        decoded.purpose === "login"
      ) {
        await pool.query(
          "DELETE FROM accounts.sessions WHERE session_token_hash = $1 AND user_id = $2",
          [hashSessionToken(decoded.jti), decoded.userId],
        );
      }
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) {
        revokeError = error;
      }
    }
  }

  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);

  if (revokeError) {
    console.error("Session revocation failed:", revokeError);
    return res.status(500).json({
      message: "Signed out locally, but the session could not be revoked",
    });
  }

  return res.status(200).json({ message: "Signed out" });
};
