import pool from "../../../config/database.js";
import { createQueryEmbedding } from "../../../utils/openai/createQueryEmbedding.js";





// --------------------------------------------------
// Get current indicator data
// --------------------------------------------------

export const getCurrentIndicatorData = async (query: string) => {
  const embedding = await createQueryEmbedding(query);

  const client = await pool.connect();

  try {
    // ----------------------------------------------
    // 1. Find the most relevant indicator
    // ----------------------------------------------

    const indicatorResult = await client.query(
      `
      SELECT
        id,
        name,
        domain,
        category,
        description,
        source,
        series_id,
        native_time_unit,
        native_frequency,
        native_aggregation,
        unit,
        use,
        purpose,
        significance,
        relation_tags
      FROM indicator.indicators
      WHERE status = 'active'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 1;
      `,
      [JSON.stringify(embedding)],
    );

    if (indicatorResult.rows.length === 0) {
      return {
        found: false,
        message: "No matching indicator was found.",
      };
    }

    const indicator = indicatorResult.rows[0];

    // ----------------------------------------------
    // 2. Find the current dataset containing
    //    the indicator's series_id
    // ----------------------------------------------

    const tableResult = await client.query(
      `
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'current'
        AND column_name = 'series_id';
      `,
    );

    let currentData = null;
    let currentTable = null;

    // ----------------------------------------------
    // 3. Search current datasets
    // ----------------------------------------------

    for (const row of tableResult.rows) {
      const tableName = row.table_name;

      const result = await client.query(
        `
        SELECT *
        FROM current.${tableName}
        WHERE series_id = $1
        LIMIT 1;
        `,
        [indicator.series_id],
      );

      if (result.rows.length > 0) {
        currentData = result.rows[0];
        currentTable = tableName;
        break;
      }
    }

    // ----------------------------------------------
    // 4. Return semantic context + current data
    // ----------------------------------------------

    if (!currentData) {
      return {
        found: true,
        indicator,
        currentData: null,
        message:
          "The indicator was found, but no current dataset was found.",
      };
    }

    return {
      found: true,

      indicator: {
        id: indicator.id,
        name: indicator.name,
        domain: indicator.domain,
        category: indicator.category,
        description: indicator.description,
        source: indicator.source,
        seriesId: indicator.series_id,
        nativeTimeUnit: indicator.native_time_unit,
        nativeFrequency: indicator.native_frequency,
        nativeAggregation: indicator.native_aggregation,
        unit: indicator.unit,
        use: indicator.use,
        purpose: indicator.purpose,
        significance: indicator.significance,
        relationTags: indicator.relation_tags,
      },

      currentData,

      // Useful for debugging internally.
      currentTable,
    };
  } finally {
    client.release();
  }
};


// --------------------------------------------------
// OpenAI tool definition
// --------------------------------------------------

export const observerTools = [
  {
    type: "function",
    name: "get_current_indicator",
    description:
      "Find the most relevant deterministic indicator for a natural-language request and return its current dataset together with metadata explaining what the indicator measures, how it is used, and why it is significant. Use this when current quantitative data is needed to understand a development or change.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Describe the current quantitative information you need in natural language.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
];