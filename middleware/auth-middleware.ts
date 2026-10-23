import type { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import pool from "../config/database.js";
import { AUTH_COOKIE_NAME, authCookieOptions, hashSessionToken } from "../utils/auth/session.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  created_at: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Reads the login cookie, verifies the signed JWT, and loads the current
 * account from PostgreSQL.
 */
const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");

  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({ message: "Authentication is not configured" });
  }

  if (typeof token !== "string" || token.length === 0) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let decoded: string | jwt.JwtPayload;

  try {
    decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
  } catch {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.userId !== "string" ||
    typeof decoded.jti !== "string" ||
    decoded.purpose !== "login"
  ) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    return res.status(401).json({ message: "Invalid authentication token" });
  }

  const sessionTokenHash = hashSessionToken(decoded.jti);

  try {
    const result = await pool.query<AuthenticatedUser>(
      `WITH valid_session AS (
         UPDATE accounts.sessions
         SET last_seen_at = NOW()
         WHERE session_token_hash = $1
           AND user_id = $2
           AND expires_at > NOW()
         RETURNING user_id
       )
       SELECT u.id, u.email, u.created_at
       FROM valid_session s
       JOIN accounts.users u ON u.id = s.user_id`,
      [sessionTokenHash, decoded.userId],
    );

    const user = result.rows[0];

    if (!user) {
      // Delete only the presented session if it has expired. A missing or
      // revoked session has nothing to remove.
      await pool.query(
        `DELETE FROM accounts.sessions
         WHERE session_token_hash = $1
           AND expires_at <= NOW()`,
        [sessionTokenHash],
      );

      res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default authMiddleware;
