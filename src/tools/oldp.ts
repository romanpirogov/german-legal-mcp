// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Open Legal Data Tools
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { oldpGet } from "../services/client.js";
import { PaginationSchema } from "../schemas/common.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type { OldpCase, OldpLaw, OldpCourt, OldpListResponse } from "../types.js";

function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT ? text : text.slice(0, CHARACTER_LIMIT) + "\n\n[… truncated]";
}

function jsonResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: truncate(JSON.stringify(data, null, 2)) }] };
}

/** Convert OLDP offset-based pagination to page/offset params */
function offsetParams(limit: number, cursor?: string): Record<string, number> {
  const offset = cursor ? parseInt(cursor, 10) : 0;
  return { limit, offset: isNaN(offset) ? 0 : offset };
}

/** Build next cursor from OLDP list response */
function nextCursor(res: OldpListResponse<unknown>): string | null {
  if (!res.next) return null;
  const match = res.next.match(/[?&]offset=(\d+)/);
  return match ? match[1] : null;
}

export function registerOldpTools(server: McpServer): void {

  // ── Cases ────────────────────────────────────────────────────────────────────

  server.registerTool(
    "oldp_search_cases",
    {
      title: "Search German Court Decisions (Open Legal Data)",
      description: `Search German court decisions from Open Legal Data (openlegaldata.io).
Covers decisions from hundreds of German courts across all levels and jurisdictions,
including Federal courts (BGH, BVerfG, BAG, etc.) and all state (Landesgericht) courts.

Args:
  - query: Full-text search string
  - court_id: Numeric court ID (use oldp_list_courts to find IDs)
  - jurisdiction: Filter by jurisdiction (ordentliche, verwaltung, sozial, finanz, arbeit)
  - date_from / date_to: Decision date range (YYYY-MM-DD)
  - limit: Results per page (1–100, default 20)
  - cursor: Pagination cursor (numeric offset string from previous response)

Returns: List of cases with id, date, court, file number, type, abstract, ECLI.
Source: https://de.openlegaldata.io`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search in decision content"),
        court_id: z.number().int().positive().optional()
          .describe("Court ID from oldp_list_courts (e.g. 1 for BGH)"),
        jurisdiction: z.enum(["ordentliche", "verwaltung", "sozial", "finanz", "arbeit"]).optional()
          .describe("Court jurisdiction branch"),
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Earliest decision date (YYYY-MM-DD)"),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Latest decision date (YYYY-MM-DD)"),
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const { limit, offset } = offsetParams(params.limit ?? 20, params.cursor);
      const data = await oldpGet<OldpListResponse<OldpCase>>("/cases/", {
        ...(params.query && { search: params.query }),
        ...(params.court_id && { court_id: params.court_id }),
        ...(params.jurisdiction && { jurisdiction: params.jurisdiction }),
        ...(params.date_from && { date__gte: params.date_from }),
        ...(params.date_to && { date__lte: params.date_to }),
        limit,
        offset,
      });
      return jsonResponse({
        count: data.count,
        next_cursor: nextCursor(data),
        results: data.results,
      });
    }
  );

  server.registerTool(
    "oldp_get_case",
    {
      title: "Get Court Decision by ID (Open Legal Data)",
      description: `Retrieve full text and metadata of a single German court decision by its OLDP ID.
Returns: court, date, file number, decision type, full content, ECLI, slug URL.
The content field contains the full reasoning and operative part of the decision.
Response may be truncated for very long decisions.
Source: https://de.openlegaldata.io`,
      inputSchema: z.object({
        id: z.number().int().positive()
          .describe("OLDP case ID (numeric, from oldp_search_cases results)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await oldpGet<OldpCase>(`/cases/${id}/`);
      return jsonResponse(data);
    }
  );

  // ── Laws ─────────────────────────────────────────────────────────────────────

  server.registerTool(
    "oldp_search_laws",
    {
      title: "Search German Laws (Open Legal Data)",
      description: `Search German federal laws and statutes via Open Legal Data.
Provides full text of laws sourced from gesetze-im-internet.de.

Args:
  - query: Search string (law name, abbreviation, or topic)
  - limit / cursor: Pagination

Returns: List of laws with id, abbreviation, name, date.
Source: https://de.openlegaldata.io`,
      inputSchema: z.object({
        query: z.string().min(1).max(300)
          .describe("Search for laws by name, abbreviation (e.g. 'BGB', 'GmbHG') or topic"),
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const { limit, offset } = offsetParams(params.limit ?? 20, params.cursor);
      const data = await oldpGet<OldpListResponse<OldpLaw>>("/laws/", {
        search: params.query,
        limit,
        offset,
      });
      return jsonResponse({
        count: data.count,
        next_cursor: nextCursor(data),
        results: data.results,
      });
    }
  );

  server.registerTool(
    "oldp_get_law",
    {
      title: "Get Law Full Text by ID (Open Legal Data)",
      description: `Retrieve the full text and metadata of a German law by its OLDP ID.
Returns the complete statute text including all sections and paragraphs.
Response is truncated at ${CHARACTER_LIMIT} characters for context efficiency.
Source: https://de.openlegaldata.io`,
      inputSchema: z.object({
        id: z.number().int().positive()
          .describe("OLDP law ID (numeric, from oldp_search_laws results)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await oldpGet<OldpLaw>(`/laws/${id}/`);
      return jsonResponse(data);
    }
  );

  // ── Courts ───────────────────────────────────────────────────────────────────

  server.registerTool(
    "oldp_list_courts",
    {
      title: "List German Courts (Open Legal Data)",
      description: `List courts available in the Open Legal Data database.
Use this to find court IDs for filtering case searches with oldp_search_cases.

Args:
  - query: Filter by court name or city
  - jurisdiction: Filter by jurisdiction branch
  - limit / cursor: Pagination

Returns: List of courts with id, name, city, state, jurisdiction, level.
Source: https://de.openlegaldata.io`,
      inputSchema: z.object({
        query: z.string().min(2).max(200).optional()
          .describe("Court name or city search string"),
        jurisdiction: z.enum(["ordentliche", "verwaltung", "sozial", "finanz", "arbeit"]).optional()
          .describe("Jurisdiction branch filter"),
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const { limit, offset } = offsetParams(params.limit ?? 20, params.cursor);
      const data = await oldpGet<OldpListResponse<OldpCourt>>("/courts/", {
        ...(params.query && { search: params.query }),
        ...(params.jurisdiction && { jurisdiction: params.jurisdiction }),
        limit,
        offset,
      });
      return jsonResponse({
        count: data.count,
        next_cursor: nextCursor(data),
        results: data.results,
      });
    }
  );
}
