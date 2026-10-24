import type { Request, Response } from "express";

import pool from "../config/database.js";

/**
 * Returns the most recent climate human brief from `climate.climate_briefs`.
 *
 * Returns each `human_brief_*` text section as a separate field. This route is
 * public: it exposes global data only, never user-specific data.
 */
export const getClimateBrief = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
          date,
          human_brief_global_overview,
          human_brief_macro_market_regime,
          human_brief_sector_conditions,
          human_brief_important_stories_narratives,
          human_brief_trends_capital_direction,
          human_brief_outlook_risks_uncertainties,
          created_at
        FROM climate.climate_briefs
        ORDER BY date DESC
        LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No climate brief found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Climate brief fetch failed:", error);
    res.status(500).json({ message: "Could not fetch climate brief" });
  }
};
