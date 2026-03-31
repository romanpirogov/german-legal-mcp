// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — NeuRIS Tools
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

  server.registerTool(
    "neuris_search_legislation",
    {
      title: "Search German Federal Legislation (NeuRIS)",
      description: `Search current German federal legislation via NeuRIS — the official new 
legal information system of the Federal Ministry of Justice (Beta).

Covers: all federal laws (Gesetze), ordinances (Verordnungen), and administrative regulations.
Data is authoritative and identical to the official Bundesgesetzblatt publication.

Args:
  - query: Search text (abbreviation, title, or keyword)
  - document_type: Filter by type (GESETZ, VERORDNUNG, VERWALTUNGSVORSCHRIFT, etc.)
  - status: Filter by status (INKRAFTGETRETEN, AUFGEHOBEN, etc.)
  - page: Page number (0-based)
  - limit: Page size (1–100, default 20)

Returns: List of legislation with id, abbreviation, title, status, document type, effective date.
Source: https://testphase.rechtsinformationen.bund.de (NeuRIS Beta, April 2025+)
Note: This is a beta API and may be unavailable or change without notice.`,
      inputSchema: z.object({
        query: z.string().min(1).max(500).optional()
          .describe("Search term (abbreviation like 'BGB', 'GmbHG', or full title keyword)"),
        document_type: z.enum(["GESETZ", "VERORDNUNG", "VERWALTUNGSVORSCHRIFT", "SATZUNG"]).optional()
          .describe("Filter by document type"),
        status: z.enum(["INKRAFTGETRETEN", "AUFGEHOBEN", "BEVORSTEHEND"]).optional()
          .describe("Filter by legal status"),
        page: z.number().int().min(0).default(0)
          .describe("Page number for pagination (0-based)"),
        ...PaginationSchema.omit({ cursor: true }).shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await neurisGet<NeurisListResponse<NeurisLegislation>>("/legislation", {
        ...(params.query && { search: params.query }),
        ...(params.document_type && { documentType: params.document_type }),
        ...(params.status && { status: params.status }),
        page: params.page,
        size: params.limit,
      });
      return jsonResponse(data);
    }
  );

  server.registerTool(
    "neuris_get_legislation",
    {
      title: "Get Federal Law by ID (NeuRIS)",
      description: `Retrieve the full text and metadata of a specific federal law by its NeuRIS ID.
Returns the complete regulatory text (Regelungstext) as structured content.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        id: z.string().min(1).max(200)
          .describe("NeuRIS legislation ID from neuris_search_legislation results"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await neurisGet<NeurisLegislation>(`/legislation/${id}`);
      return jsonResponse(data);
    }
  );

  server.registerTool(
    "neuris_search_caselaw",
    {
      title: "Search Federal Court Decisions (NeuRIS)",
      description: `Search court decisions from German federal courts via NeuRIS.

Covered courts: BGH (Federal Court of Justice), BVerfG (Federal Constitutional Court), 
BVerwG (Federal Administrative Court), BAG (Federal Labour Court), BSG (Federal Social Court), 
BFH (Federal Finance Court), BPatG (Federal Patent Court).

Args:
  - query: Full-text search
  - court: Court abbreviation (BGH, BVerfG, BVerwG, BAG, BSG, BFH, BPatG)
  - date_from / date_to: Decision date range (YYYY-MM-DD)
  - page: Page number (0-based)
  - limit: Page size (1–100)

Returns: List of decisions with id, file number, court, date, document type, headline.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search in decision content, headline, guiding principles"),
        court: z.enum(["BGH", "BVerfG", "BVerwG", "BAG", "BSG", "BFH", "BPatG"]).optional()
          .describe("Federal court abbreviation"),
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Earliest decision date (YYYY-MM-DD)"),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Latest decision date (YYYY-MM-DD)"),
        page: z.number().int().min(0).default(0)
          .describe("Page number (0-based)"),
        ...PaginationSchema.omit({ cursor: true }).shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await neurisGet<NeurisListResponse<NeurisCaseLaw>>("/caselaw", {
        ...(params.query && { search: params.query }),
        ...(params.court && { courtLabel: params.court }),
        ...(params.date_from && { decisionDateStart: params.date_from }),
        ...(params.date_to && { decisionDateEnd: params.date_to }),
        page: params.page,
        size: params.limit,
      });
      return jsonResponse(data);
    }
  );

  server.registerTool(
    "neuris_get_decision",
    {
      title: "Get Federal Court Decision by ID (NeuRIS)",
      description: `Retrieve full text and metadata of a single federal court decision by NeuRIS ID.
Returns: court, file number, date, decision type, full text, guiding principles (Leitsätze), ECLI.
Source: NeuRIS Beta — testphase.rechtsinformationen.bund.de`,
      inputSchema: z.object({
        id: z.string().min(1).max(200)
          .describe("NeuRIS decision ID from neuris_search_caselaw results"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await neurisGet<NeurisCaseLaw>(`/caselaw/${id}`);
      return jsonResponse(data);
    }
  );
}
