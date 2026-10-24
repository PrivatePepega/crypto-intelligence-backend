import type { Request, Response } from "express";

import pool from "../config/database.js";

/**
 * Returns the most recent weather human brief from `weather.daily_briefs`.
 *
 * This route is public: it exposes global data only, never user-specific data.
 */
export const getWeatherBrief = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
          brief_date,
          domain,
          human_brief,
          created_at
        FROM weather.daily_briefs
        ORDER BY brief_date DESC
        LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No weather brief found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Weather brief fetch failed:", error);
    res.status(500).json({ message: "Could not fetch weather brief" });
  }
};
