import type { NextFunction, Request, Response } from "express";

/**
 * Reject browser state-changing requests from origins other than FRONTEND_URL.
 * Requests with no Origin header (server-to-server, curl) still work.
 */
export const requireTrustedOrigin = (req: Request, res: Response, next: NextFunction) => {
  const requestOrigin = req.get("origin");
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("FRONTEND_URL is not configured");
      return res.status(500).json({ message: "Authentication is not configured" });
    }

    return next();
  }

  if (!requestOrigin) {
    return next();
  }

  if (requestOrigin.replace(/\/$/, "") !== frontendUrl.replace(/\/$/, "")) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
};
