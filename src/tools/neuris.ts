// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — NeuRIS Tools
// Fixes:
//   - Correct search parameter name (searchTerm, not search)
//   - Added abbreviation lookup path (direct ELI-style access bypasses broken sort)
//   - Added neuris_search_caselaw with correct parameter names
//   - Noted that NeuRIS Beta sorts by date, not relevance — documented in tool desc
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { neurisGet } from "../services/client.js";
import { PaginationSchema } from "../schemas/common.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type { NeurisLegislation, NeurisCaseLaw } from "../types.js";

interface NeurisListResponse<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT ? text : text.slice(0, CHARACTER_LIMIT) + "\n\n[… truncated]";
}

function jsonResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: truncate(JSON.stringify(data, null, 2)) }] };
}

export function registerNeurisTools(server: McpServer): void {

  // ── Legislation search ─────────────────────────────────────────────────────

  server.registerTool(
    "neuris_search_legislation",
    {
      title: "Search German Federal Legislation (NeuRIS)",
      description: `Search current German federal legislation via NeuRIS — the official
legal information system of the Federal Ministry of Justice (Beta, live since April 2025).

⚠️ IMPORTANT — HOW NEURIS SEARCH WORKS:
NeuRIS Beta currently returns results sorted by publication date (newest first),
NOT by relevance. Full-text relevance ranking is not yet implemented in this beta.

BEST PRACTICES:
1. For a known law abbreviation (BGB, GmbHG, AO, etc.) → use gii_get_law_xml instead,
   which gives you the exact law text directly without going through NeuRIS search.
2. For browsing recent legislation by type/status → NeuRIS is useful.
3. For finding a law by title keyword → expect 2000+ unsorted results; narrow with
   document_type or status filters.

Args:
  - query: Search keyword — will be sent as searchTerm parameter to the API
  - abbreviation: Law abbreviation for direct lookup (BGB, GmbHG, AO, ZPO, etc.)
  - document_type: GESETZ, VERORDNUNG, VERWALTUNGSVORSCHRIFT, SATZUNG
  - status: INKRAFTGETRETEN, AUFGEHOBEN, BEVORSTEHEND
  - page: 0-based page number
  - limit: Page size (1–100)

Returns: Legislation list with id, abbreviation, title, status, type, effective date.
Source: https://testphase.rechtsinformationen.bund.de (NeuRIS Beta)`,
      inputSchema: z.object({
        query: z.string().min(1).max(500).optional()
          .describe("Search keyword (sent as searchTerm). Note: results sorted by date, not relevance."),
        abbreviation: z.string().min(1).max(30).optional()
          .describe("Direct abbreviation lookup: BGB, GmbHG, AO, ZPO, HGB, StGB, etc."),
        document_type: z.enum(["GESETZ", "VERORDNUNG", "VERWALTUNGSVORSCHRIFT", "SATZUNG"]).optional()
          .describe("Filter by document type"),
        status: z.enum(["INKRAFTGETRETEN", "AUFGEHOBEN", "BEVORSTEHEND"]).optional()
          .describe("Filter by legal status"),
        page: z.number().int().min(0).default(0)
          .describe("Page number (0-based)"),
        ...PaginationSchema.omit({ cursor: true }).shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {
        page: params.page,
        size: params.limit,
      };

      // NeuRIS Beta uses 'searchTerm', not 'search' or 'q'
      if (params.query) queryParams["searchTerm"] = params.query;
      // Abbreviation filter — maps to the abbreviation field in NeuRIS
      if (params.abbreviation) queryParams["abbreviation"] = params.abbreviation.toUpperCase();
      if (params.document_type) queryParams["documentType"] = params.document_type;
      if (params.status) queryParams["status"] = params.status;

      const data = await neurisGet<NeurisListResponse<NeurisLegislation>>("/legislation", queryParams);
      return jsonResponse({
        _note: "Results sorted by publication date (newest first). NeuRIS Beta does not support relevance ranking yet.",
        totalElements: data.totalElements,
        page: data.number,
        totalPages: data.totalPages,
        results: data.content ?? [],
      });
    }
  );

  // ── Get legislation by ID ──────────────────────────────────────────────────

  server.registerTool(
    "neuris_get_legislation",
    {
      title: "Get Federal Law Full Text by ID (NeuRIS)",
      description: `Retrieve the full text and metadata of a specific federal law by its NeuRIS ID.
Returns the complete regulatory text (Regelungstext) as structured content.

Get the ID from neuris_search_legislation results.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        id: z.string().min(1).max(200)
          .describe("NeuRIS legislation ID (from neuris_search_legislation results)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await neurisGet<NeurisLegislation>(`/legislation/${id}`);
      return jsonResponse(data);
    }
  );

  // ── Case law search ────────────────────────────────────────────────────────

  server.registerTool(
    "neuris_search_caselaw",
    {
      title: "Search Federal Court Decisions (NeuRIS)",
      description: `Search court decisions from German federal courts via NeuRIS Beta.

Covered courts: BGH, BVerfG, BVerwG, BAG, BSG, BFH, BPatG.

⚠️ Same limitation as legislation search: results sorted by date, not relevance.
For known case file numbers, use neuris_get_decision directly.

Args:
  - query: Full-text search (sent as searchTerm)
  - court: BGH, BVerfG, BVerwG, BAG, BSG, BFH, BPatG
  - date_from / date_to: Decision date range (YYYY-MM-DD)
  - page: 0-based page
  - limit: Page size (1–100)

Returns: Decisions with id, file number, court, date, type, headline.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search (note: sorted by date, not relevance)"),
        court: z.enum(["BGH", "BVerfG", "BVerwG", "BAG", "BSG", "BFH", "BPatG"]).optional()
          .describe("Federal court abbreviation"),
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Earliest decision date (YYYY-MM-DD)"),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Latest decision date (YYYY-MM-DD)"),
        page: z.number().int().min(0).default(0),
        ...PaginationSchema.omit({ cursor: true }).shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const queryParams: Record<string, unknown> = { page: params.page, size: params.limit };
      if (params.query) queryParams["searchTerm"] = params.query;
      if (params.court) queryParams["courtLabel"] = params.court;
      if (params.date_from) queryParams["decisionDateStart"] = params.date_from;
      if (params.date_to) queryParams["decisionDateEnd"] = params.date_to;

      const data = await neurisGet<NeurisListResponse<NeurisCaseLaw>>("/caselaw", queryParams);
      return jsonResponse({
        _note: "Results sorted by date (newest first). NeuRIS Beta does not support relevance ranking yet.",
        totalElements: data.totalElements,
        page: data.number,
        totalPages: data.totalPages,
        results: data.content ?? [],
      });
    }
  );

  // ── Get decision by ID ─────────────────────────────────────────────────────

  server.registerTool(
    "neuris_get_decision",
    {
      title: "Get Federal Court Decision by ID (NeuRIS)",
      description: `Retrieve full text and metadata of a single federal court decision by NeuRIS ID.
Returns: court, file number, date, decision type, full text, guiding principles (Leitsätze), ECLI.

Get the ID from neuris_search_caselaw results.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        id: z.string().min(1).max(200)
          .describe("NeuRIS decision ID (from neuris_search_caselaw results)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await neurisGet<NeurisCaseLaw>(`/caselaw/${id}`);
      return jsonResponse(data);
    }
  );
}
