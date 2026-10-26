import type { Request, Response } from "express";
import { z } from "zod";

import pool from "../config/database.js";

const weatherDataSchema = z.object({
  domains: z
    .array(z.string().min(1, "domain is required"))
    .min(1, "At least one domain is required"),
});

type WeatherDataInput = z.infer<typeof weatherDataSchema>;

const weatherBriefSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "limit must be a number")
    .transform((val) => Number(val))
    .refine((val) => val >= 1 && val <= 6, "limit must be between 1 and 6")
    .default(6),
  latest: z
    .string()
    .transform((val) => val === "true")
    .default(false),
});

type WeatherBriefInput = z.infer<typeof weatherBriefSchema>;

/**
 * Returns weather human briefs from `weather.daily_briefs`.
 * When latest=true, returns the most recent briefs regardless of date.
 * When latest=false, filters by the specified date parameter.
 *
 * This route is public: it exposes global data only, never user-specific data.
 */
export const getWeatherBrief = async (req: Request, res: Response) => {
  const input = weatherBriefSchema.safeParse(req.query);

  if (!input.success) {
    return res.status(400).json({
      message: input.error.issues.map((issue) => issue.message).join(", "),
    });
  }

  const { date, limit, latest } = input.data;

  try {
    let result;

    if (latest) {
      // Return the most recent briefs regardless of date parameter
      result = await pool.query(
        `SELECT
            id,
            brief_date,
            domain,
            human_brief,
            created_at,
            updated_at
          FROM weather.daily_briefs
          WHERE brief_date = (
            SELECT MAX(brief_date) FROM weather.daily_briefs
          )
          ORDER BY domain ASC
          LIMIT $1`,
        [limit],
      );
    } else {
      if (!date) {
        return res.status(400).json({
          message: "date is required when latest is false",
        });
      }

      result = await pool.query(
        `SELECT
            id,
            brief_date,
            domain,
            human_brief,
            created_at,
            updated_at
          FROM weather.daily_briefs
          WHERE brief_date = $1
          ORDER BY domain ASC
          LIMIT $2`,
        [date, limit],
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: latest ? "No weather briefs found" : `No weather briefs found for date: ${date}`,
      });
    }

    res.json({
      briefs: result.rows,
      date: latest ? result.rows[0]?.brief_date : date,
      latest,
      limit,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Weather brief fetch failed:", error);
    res.status(500).json({ message: "Could not fetch weather briefs" });
  }
};

/**
 * Returns observations and research data for specified market domains.
 *
 * This route is public: it exposes global data only, never user-specific data.
 */
export const getWeatherObservationsAndResearch = async (req: Request, res: Response) => {
  const input = weatherDataSchema.safeParse(req.body);

  if (!input.success) {
    return res.status(400).json({
      message: input.error.issues.map((issue) => issue.message).join(", "),
    });
  }

  try {
    const domains = input.data.domains;

    // Query for observations matching the specified domains
    const observationsResult = await pool.query(
      `SELECT
          id,
          date,
          market_domain,
          type,
          observation,
          research_enabled,
          created_at
        FROM weather.observations
        WHERE market_domain = ANY($1)
        ORDER BY date ASC`,
      [domains],
    );

    const observations = observationsResult.rows;

    // Query for research data for the specified domains
    const researchResult = await pool.query(
      `SELECT
          r.id,
          r.date,
          r.market_domain,
          r.type,
          r.observation,
          r.research,
          r.created_at,
          o.id AS observation_id
        FROM weather.research r
        JOIN weather.observations o ON r.observation_id = o.id
        WHERE r.market_domain = ANY($1)
        ORDER BY r.date ASC`,
      [domains],
    );

    const research = researchResult.rows;

    res.json({
      domains: domains,
      observations: observations,
      research: research,
    });
  } catch (error) {
    console.error("Weather observations and research fetch failed:", error);
    res.status(500).json({ message: "Could not fetch weather observations and research" });
  }
};

export { weatherDataSchema };
