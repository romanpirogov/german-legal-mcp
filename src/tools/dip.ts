// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — DIP Bundestag Tools
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dipGet } from "../services/client.js";
import { PaginationSchema, DateRangeSchema, WahlperiodeSchema } from "../schemas/common.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type {
  DipListResponse, DipDrucksache, DipPlenarprotokoll,
  DipVorgang, DipPerson, DipAktivitaet
} from "../types.js";

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + `\n\n[… truncated at ${CHARACTER_LIMIT} chars]`;
}

function jsonResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: truncate(JSON.stringify(data, null, 2)) }] };
}

export function registerDipTools(server: McpServer): void {

  // ── Drucksachen (Parliamentary Papers) ─────────────────────────────────────

  server.registerTool(
    "dip_search_drucksachen",
    {
      title: "Search Bundestag Drucksachen",
      description: `Search parliamentary papers (Drucksachen) in the DIP Bundestag database.
Drucksachen include: government bills (Regierungsentwürfe), motions (Anträge), 
questions (Anfragen), reports (Berichte), and committee recommendations (Beschlussempfehlungen).

Args:
  - query: Full-text search string
  - wahlperiode: Legislative term (e.g. 20 for current Bundestag)
  - drucksachetyp: Filter by type (Antrag, Gesetzentwurf, Anfrage, Bericht, etc.)
  - date_from / date_to: Date range in YYYY-MM-DD
  - limit: Results per page (1–100, default 20)
  - cursor: Pagination cursor from previous response

Returns: List of Drucksachen with id, title, date, type, PDF URL, and pagination cursor.

Requires: DIP_API_KEY environment variable.
Source: https://search.dip.bundestag.de/api/v1`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search query"),
        drucksachetyp: z.string().optional()
          .describe("Document type filter: Antrag, Gesetzentwurf, Anfrage, Bericht, Beschlussempfehlung"),
        ...WahlperiodeSchema.shape,
        ...DateRangeSchema.shape,
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await dipGet<DipListResponse<DipDrucksache>>("/drucksache", {
        ...(params.query && { "f.innehat": params.query }),
        ...(params.drucksachetyp && { "f.drucksachetyp": params.drucksachetyp }),
        ...(params.wahlperiode && { "f.wahlperiode": params.wahlperiode }),
        ...(params.date_from && { "f.datum.start": params.date_from }),
        ...(params.date_to && { "f.datum.end": params.date_to }),
        ...(params.cursor && { cursor: params.cursor }),
        rows: params.limit,
      });
      return jsonResponse({ numFound: data.numFound, cursor: data.cursor, documents: data.documents });
    }
  );

  server.registerTool(
    "dip_get_drucksache",
    {
      title: "Get Bundestag Drucksache by ID",
      description: `Retrieve full metadata for a single Drucksache by its numeric DIP ID.
Returns: id, type, title, date, authors, parliamentary term, PDF URL, and cross-references.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        id: z.string().regex(/^\d+$/).describe("DIP document ID (numeric string, e.g. '68852')"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await dipGet<DipDrucksache>(`/drucksache/${id}`);
      return jsonResponse(data);
    }
  );

  server.registerTool(
    "dip_get_drucksache_text",
    {
      title: "Get Full Text of a Drucksache",
      description: `Retrieve the full plain text content of a Bundestag Drucksache.
Use after dip_get_drucksache to obtain the complete document text for analysis.
Response may be truncated for very long documents.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        id: z.string().regex(/^\d+$/).describe("DIP document ID (same as in dip_get_drucksache)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await dipGet<{ id: string; text?: string }>(`/drucksache-text/${id}`);
      return jsonResponse(data);
    }
  );

  // ── Plenarprotokolle (Plenary Records) ─────────────────────────────────────

  server.registerTool(
    "dip_search_plenarprotokolle",
    {
      title: "Search Bundestag Plenary Records",
      description: `Search plenary session records (Plenarprotokolle) of the Bundestag.
These are verbatim transcripts of parliamentary debates.

Args:
  - query: Full-text search
  - wahlperiode: Legislative term
  - date_from / date_to: Session date range (YYYY-MM-DD)
  - limit: 1–100
  - cursor: Pagination token

Returns: List of plenary records with id, session number, date, title, PDF URL.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search query"),
        ...WahlperiodeSchema.shape,
        ...DateRangeSchema.shape,
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await dipGet<DipListResponse<DipPlenarprotokoll>>("/plenarprotokoll", {
        ...(params.query && { "f.innehat": params.query }),
        ...(params.wahlperiode && { "f.wahlperiode": params.wahlperiode }),
        ...(params.date_from && { "f.datum.start": params.date_from }),
        ...(params.date_to && { "f.datum.end": params.date_to }),
        ...(params.cursor && { cursor: params.cursor }),
        rows: params.limit,
      });
      return jsonResponse({ numFound: data.numFound, cursor: data.cursor, documents: data.documents });
    }
  );

  server.registerTool(
    "dip_get_plenarprotokoll_text",
    {
      title: "Get Full Text of a Plenary Record",
      description: `Retrieve the verbatim transcript text of a Bundestag plenary session.
Response is truncated at ${CHARACTER_LIMIT} characters for context efficiency.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        id: z.string().regex(/^\d+$/).describe("DIP document ID of the Plenarprotokoll"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await dipGet<{ id: string; text?: string }>(`/plenarprotokoll-text/${id}`);
      return jsonResponse(data);
    }
  );

  // ── Vorgänge (Legislative Procedures) ──────────────────────────────────────

  server.registerTool(
    "dip_search_vorgaenge",
    {
      title: "Search Bundestag Legislative Procedures",
      description: `Search legislative procedures (Vorgänge) in the Bundestag.
A Vorgang tracks the full lifecycle of a law or parliamentary initiative through all stages.

Args:
  - query: Full-text search on title/content
  - wahlperiode: Legislative term
  - vorgangstyp: Type filter (Gesetzgebung, Antrag, Anfrage, etc.)
  - sachgebiet: Subject area keyword
  - date_from / date_to: Date range
  - limit / cursor: Pagination

Returns: List of procedures with id, type, title, subject areas, descriptors.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search query"),
        vorgangstyp: z.string().optional()
          .describe("Procedure type: Gesetzgebung, Antrag, Anfrage, Rechtsverordnung, etc."),
        sachgebiet: z.string().optional()
          .describe("Subject area (e.g. Recht, Wirtschaft, Finanzen)"),
        ...WahlperiodeSchema.shape,
        ...DateRangeSchema.shape,
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await dipGet<DipListResponse<DipVorgang>>("/vorgang", {
        ...(params.query && { "f.innehat": params.query }),
        ...(params.vorgangstyp && { "f.vorgangstyp": params.vorgangstyp }),
        ...(params.sachgebiet && { "f.sachgebiet": params.sachgebiet }),
        ...(params.wahlperiode && { "f.wahlperiode": params.wahlperiode }),
        ...(params.date_from && { "f.datum.start": params.date_from }),
        ...(params.date_to && { "f.datum.end": params.date_to }),
        ...(params.cursor && { cursor: params.cursor }),
        rows: params.limit,
      });
      return jsonResponse({ numFound: data.numFound, cursor: data.cursor, documents: data.documents });
    }
  );

  server.registerTool(
    "dip_get_vorgang",
    {
      title: "Get Bundestag Legislative Procedure by ID",
      description: `Retrieve full details of a single legislative procedure (Vorgang) by DIP ID.
Returns: type, title, subject areas, all related Drucksachen, status, committee references.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        id: z.string().regex(/^\d+$/).describe("DIP Vorgang ID (numeric string)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const data = await dipGet<DipVorgang>(`/vorgang/${id}`);
      return jsonResponse(data);
    }
  );

  // ── Persons ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "dip_search_persons",
    {
      title: "Search Bundestag Members and Persons",
      description: `Search persons (MdB — Members of Bundestag) in the DIP database.

Args:
  - query: Name search string
  - limit / cursor: Pagination

Returns: List of persons with id, name, party, roles.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        query: z.string().min(2).max(200)
          .describe("Name search string (last name, first name, or both)"),
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await dipGet<DipListResponse<DipPerson>>("/person", {
        "f.innehat": params.query,
        ...(params.cursor && { cursor: params.cursor }),
        rows: params.limit,
      });
      return jsonResponse({ numFound: data.numFound, cursor: data.cursor, documents: data.documents });
    }
  );

  // ── Aktivitäten (Activities) ─────────────────────────────────────────────────

  server.registerTool(
    "dip_search_aktivitaeten",
    {
      title: "Search Bundestag Parliamentary Activities",
      description: `Search parliamentary activities (Aktivitäten) in the Bundestag.
Activities include speeches (Reden), votes (Abstimmungen), and written contributions.

Args:
  - query: Search string
  - wahlperiode: Legislative term
  - date_from / date_to: Date range
  - limit / cursor: Pagination

Returns: List of activities with type, date, person, related procedure.
Requires: DIP_API_KEY environment variable.`,
      inputSchema: z.object({
        query: z.string().min(2).max(500).optional()
          .describe("Full-text search query"),
        ...WahlperiodeSchema.shape,
        ...DateRangeSchema.shape,
        ...PaginationSchema.shape,
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const data = await dipGet<DipListResponse<DipAktivitaet>>("/aktivitaet", {
        ...(params.query && { "f.innehat": params.query }),
        ...(params.wahlperiode && { "f.wahlperiode": params.wahlperiode }),
        ...(params.date_from && { "f.datum.start": params.date_from }),
        ...(params.date_to && { "f.datum.end": params.date_to }),
        ...(params.cursor && { cursor: params.cursor }),
        rows: params.limit,
      });
      return jsonResponse({ numFound: data.numFound, cursor: data.cursor, documents: data.documents });
    }
  );
}
