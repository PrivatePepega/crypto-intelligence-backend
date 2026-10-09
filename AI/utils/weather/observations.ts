import pool from "../../../config/database.js";

// --------------------------------------------------
// Observations
// --------------------------------------------------

/**
 * One observation as the Formatter returns it.
 *
 * `type` is whatever the model emitted, normalized to lowercase with spaces
 * turned into underscores. The prompt offers
 * market_condition | event | development | anomaly | relationship | narrative
 * | regulation | other; the column is free text, so nothing is enforced here.
 */
export type Observation = {
  observation: string;
  type: string;
};

/**
 * Isolates the outermost JSON object.
 *
 * Counts braces rather than slicing to the last `}` so a value ending in one -
 * `{"observation": "closed at }"}` - does not truncate the match.
 *
 * Exported because every agent in this pipeline parses a model response the same
 * way, and a second copy of brace counting would be a second thing to get wrong.
 */
export const extractJsonObject = (text: string): string | null => {
  const start = text.indexOf("{");

  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      inString = !inString;
    } else if (!inString && character === "{") {
      depth += 1;
    } else if (!inString && character === "}") {
      depth -= 1;

      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
};

/**
 * Turns the Formatter's response into observations.
 *
 * Throws when the response is unusable rather than returning an empty list, so a
 * bad run fails loudly instead of silently writing zero rows. The raw response
 * is already in the run log either way.
 */
export const parseObservations = (finalText: string): Observation[] => {
  // The response is model output, so quote it back in the error. "contained no
  // JSON object" on its own says nothing about what actually arrived - a
  // provider refusal like "User Safety: safe" looks identical to an empty reply
  // without it.
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(finalText);

  if (json === null) {
    throw new Error(`Formatter response contained no JSON object. Received ${received(finalText)}`);
  }

  let parsed: { observations?: Observation[] };

  try {
    parsed = JSON.parse(json) as { observations?: Observation[] };
  } catch (error) {
    throw new Error(
      `Formatter response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(finalText)}`,
    );
  }

  if (!Array.isArray(parsed.observations)) {
    throw new Error(
      `Formatter response had no "observations" array. Received ${received(finalText)}`,
    );
  }

  return parsed.observations
    .filter((entry) => typeof entry?.observation === "string" && entry.observation.trim() !== "")
    .map((entry) => ({
      observation: entry.observation.trim(),
      type: String(entry.type ?? "other")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_"),
    }));
};

// --------------------------------------------------
// Database
// --------------------------------------------------

export type DailySet = {
  id: string;
  set_date: string;
};

/**
 * `set_date::text` because `pg` turns a DATE into a local-time Date, which
 * reads back a day early west of UTC.
 */
export const findDailySet = async (): Promise<DailySet | null> => {
  const { rows } = await pool.query(
    `
      SELECT id, set_date::text AS set_date
      FROM intelligence_sets.daily_sets
      WHERE set_date = CURRENT_DATE;
    `,
  );

  return rows[0] ?? null;
};

export const createDailySet = async (): Promise<DailySet> => {
  const { rows } = await pool.query(
    `
      INSERT INTO intelligence_sets.daily_sets (set_date)
      VALUES (CURRENT_DATE)
      RETURNING id, set_date::text AS set_date;
    `,
  );

  return rows[0];
};

/**
 * Today's intelligence set, created only when missing.
 *
 * An existing row is returned untouched, never overwritten, so a repeat run in
 * development cannot reset the set's id or timestamp. A repeat run therefore
 * appends a second set of observations for the day, so this is a
 * get-or-create, not an idempotency guard.
 */
export const getDailySet = async (): Promise<DailySet> => {
  const existing = await findDailySet();

  return existing ?? (await createDailySet());
};

/**
 * Stores a domain's observations against its daily set.
 *
 * One statement for the whole batch: a day is tens of rows, so the round-trip
 * saving is worth more than a loop, and a single statement is atomic without an
 * explicit transaction.
 *
 * No `ON CONFLICT` - weather.observations has no unique constraint. Repeat runs
 * are the caller's business.
 *
 * @returns How many rows were written.
 */
export const insertObservations = async (
  intelligenceSet: DailySet,
  marketDomain: string,
  observations: Observation[],
): Promise<number> => {
  console.log(
    `[inject] Observations injection initialized for domain: ${marketDomain} - ` +
      `${observations.length} observation(s) to write`,
  );

  if (observations.length === 0) return 0;

  const values: unknown[] = [];

  const rows = observations.map((observation, index) => {
    const first = index * 5;

    values.push(
      intelligenceSet.id,
      intelligenceSet.set_date,
      marketDomain,
      observation.type,
      observation.observation,
    );

    return `($${first + 1}, $${first + 2}, $${first + 3}, $${first + 4}, $${first + 5})`;
  });

  const { rowCount } = await pool.query(
    `
      INSERT INTO weather.observations (
        intelligence_set_id, date, market_domain, type, observation
      )
      VALUES ${rows.join(", ")};
    `,
    values,
  );

  const written = rowCount ?? 0;

  console.log(
    `[inject] Observations injection finalized for domain: ${marketDomain} - ` +
      `${written} row(s) written`,
  );

  return written;
};
