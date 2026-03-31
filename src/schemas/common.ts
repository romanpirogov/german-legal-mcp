// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Shared Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.js";

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE)
    .describe("Max results to return (1–100, default 20)"),
  cursor: z.string().optional()
    .describe("Pagination cursor from previous response for loading next page"),
});

export const DateRangeSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Start date filter in YYYY-MM-DD format"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("End date filter in YYYY-MM-DD format"),
});

export const WahlperiodeSchema = z.object({
  wahlperiode: z.number().int().min(1).max(25).optional()
    .describe("Bundestag legislative term number (e.g. 20 for current)"),
});
