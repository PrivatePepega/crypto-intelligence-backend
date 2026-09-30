import { tool } from "ai";
import pool from "../../../config/database.js";
import { webSearch } from "../../../utils/AI/webSearch.js";
import { createQueryEmbedding } from "../../../utils/openai/createQueryEmbedding.js";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";




// --------------------------------------------------
// Get current indicator data
// --------------------------------------------------



export const getCurrentIndicatorData = async (query: string) => {
    const { embedding, usage } = await createQueryEmbedding(query);
  
    const client = await pool.connect();
  
    try {
      // ----------------------------------------------
      // 1. Find the 3 most relevant indicators
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
        LIMIT 3;
        `,
        [JSON.stringify(embedding)],
      );
  
      if (indicatorResult.rows.length === 0) {
        return {
          result: {
            found: false,
            message: "No matching indicators were found.",
          },
          usage,
        };
      }
  
      // ----------------------------------------------
      // 2. Find all current tables containing series_id
      // ----------------------------------------------
  
      const tableResult = await client.query(
        `
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'current'
          AND column_name = 'series_id';
        `,
      );
  
      // ----------------------------------------------
      // 3. Resolve current data for each indicator
      // ----------------------------------------------
  
      const indicators = [];
  
      for (const indicator of indicatorResult.rows) {
        let currentData = null;
  
        for (const row of tableResult.rows) {
          const tableName = row.table_name;
  
          const result = await client.query(
            `
            SELECT *
            FROM current."${tableName}"
            WHERE series_id = $1
            LIMIT 1;
            `,
            [indicator.series_id],
          );
  
          if (result.rows.length > 0) {
            currentData = result.rows[0];
            break;
          }
        }
  
        // --------------------------------------------
        // 4. Build compact indicator result
        // --------------------------------------------
  
        indicators.push({
          name: indicator.name,
          domain: indicator.domain,
          category: indicator.category,
          description: indicator.description,
          source: indicator.source,
          nativeFrequency: indicator.native_frequency,
          nativeAggregation: indicator.native_aggregation,
          unit: indicator.unit,
          significance: indicator.significance,
          currentData,
        });
      }
  
      // ----------------------------------------------
      // 5. Return result + telemetry separately
      // ----------------------------------------------
  
      return {
        result: {
          found: true,
          query,
          indicators,
        },
        usage,
      };
    } finally {
      client.release();
    }
  };
  
  // --------------------------------------------------
  // Web search tool
  // --------------------------------------------------
  
  export const webSearchTool = tool({
    description:
      "Search the public web for recent information relevant to the Observer's domain. Use this to discover current events, announcements, regulatory developments, security incidents, market narratives, and other developments that may not be available through deterministic database indicators.",
  
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "A focused search query describing the information needed from the public web.",
        ),
    }),
  
    execute: async ({ query }) => {
      return await webSearch(query);
    },
  });
  

/**
 * Calls the Marketaux news search through the backend MCP server.
 *
 * The Observer talks to MCP instead of calling the Marketaux API directly.
 * This keeps provider access behind the generic MCP boundary.
 */
export const searchMarketauxNews = async (
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
  
    return await callMcpTool(
      "marketaux_news_search",
      input,
      signal,
    );
  };