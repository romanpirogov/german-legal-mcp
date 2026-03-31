// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Gesetze im Internet & Rechtsprechung im Internet
// Fix: in-memory cache for TOC (1-hour TTL) to avoid repeated 60s fetches
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { giiGetToc, giiGetXml } from "../services/client.js";
import { CHARACTER_LIMIT, GII_BASE_URL, RII_BASE_URL } from "../constants.js";
import type { GiiLawEntry } from "../types.js";

// ── TOC cache (in-memory, 1 hour TTL) ────────────────────────────────────────

interface TocCache {
  entries: GiiLawEntry[];
  fetchedAt: number;
}

let tocCache: TocCache | null = null;
const TOC_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getCachedToc(): Promise<GiiLawEntry[]> {
  const now = Date.now();
  if (tocCache && now - tocCache.fetchedAt < TOC_TTL_MS) {
    process.stderr.write("[GII] TOC served from cache\n");
    return tocCache.entries;
  }
  process.stderr.write("[GII] Fetching TOC from gesetze-im-internet.de...\n");
  const xml = await giiGetToc();
  const entries = parseGiiToc(xml);
  tocCache = { entries, fetchedAt: now };
  process.stderr.write(`[GII] TOC cached: ${entries.length} laws\n`);
  return entries;
}

// ── XML parser ────────────────────────────────────────────────────────────────

function parseGiiToc(xml: string): GiiLawEntry[] {
  const entries: GiiLawEntry[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const name = block.match(/<n>(.*?)<\/n>/)?.[1]?.trim() ?? "";
    const title = block.match(/<title>(.*?)<\/title>/)?.[1]?.trim() ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ?? "";
    if (name && link) {
      entries.push({
        abbreviation: name,
        title,
        url: link,
        xmlUrl: `${GII_BASE_URL}/${name.toLowerCase()}/xml.zip`,
      });
    }
  }
  return entries;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT ? text : text.slice(0, CHARACTER_LIMIT) + "\n\n[… truncated]";
}

function textResponse(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: truncate(text) }] };
}

function jsonResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return textResponse(JSON.stringify(data, null, 2));
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export function registerGiiTools(server: McpServer): void {

  server.registerTool(
    "gii_list_laws",
    {
      title: "List All Federal Laws (Gesetze im Internet)",
      description: `Fetch the complete table of contents of gesetze-im-internet.de —
the official Federal Ministry of Justice portal for all consolidated German federal laws.

The TOC (~6,800 laws) is cached in memory for 1 hour after first fetch to avoid
repeated slow network requests. First call may take up to 60 seconds.

Args:
  - filter: Case-insensitive substring filter on abbreviation or title
  - limit: Max entries to return (1–500, default 100)
  - offset: Pagination offset

Returns: { total, count, has_more, laws: [{ abbreviation, title, url, xmlUrl }] }
Source: https://www.gesetze-im-internet.de/gii-toc.xml`,
      inputSchema: z.object({
        filter: z.string().min(1).max(100).optional()
          .describe("Substring filter on abbreviation or title (e.g. 'GmbH', 'Steuer', 'BGB')"),
        limit: z.number().int().min(1).max(500).default(100)
          .describe("Max entries to return (1–500)"),
        offset: z.number().int().min(0).default(0)
          .describe("Pagination offset"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ filter, limit, offset }) => {
      let entries = await getCachedToc();

      if (filter) {
        const q = filter.toLowerCase();
        entries = entries.filter(
          e => e.abbreviation.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
        );
      }

      const total = entries.length;
      const page = entries.slice(offset, offset + limit);

      return jsonResponse({
        total,
        offset,
        count: page.length,
        has_more: offset + limit < total,
        laws: page,
      });
    }
  );

  server.registerTool(
    "gii_get_law_xml",
    {
      title: "Get Federal Law XML Text (Gesetze im Internet)",
      description: `Download and return the structured XML text of a specific German federal law
from gesetze-im-internet.de by its official abbreviation.

The XML includes all paragraphs (§§), section headings, cross-references, and metadata.

How to use:
1. Call gii_list_laws with a filter to find the law abbreviation.
2. Pass the abbreviation to this tool (case-insensitive).

Args:
  - abbreviation: Official law abbreviation, e.g. bgb, gmbhg, hgb, ao, stgb, zpo

Returns: Raw XML text (truncated at ${CHARACTER_LIMIT} chars).
Source: https://www.gesetze-im-internet.de/{abbreviation}/xml.zip`,
      inputSchema: z.object({
        abbreviation: z.string()
          .min(1).max(50)
          .regex(/^[a-z0-9_-]+$/i, "Lowercase abbreviation only (e.g. bgb, gmbhg, hgb, ao)")
          .transform(s => s.toLowerCase())
          .describe("Official law abbreviation in lowercase (bgb, gmbhg, ao, hgb, stgb, zpo)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ abbreviation }) => {
      try {
        const xml = await giiGetXml(`/${abbreviation}/xml.zip`);
        return textResponse(xml);
      } catch {
        // Fallback: some laws serve XML directly without zip
        const xml = await giiGetXml(`/${abbreviation}/`);
        return textResponse(xml);
      }
    }
  );

  server.registerTool(
    "gii_get_law_url",
    {
      title: "Get Direct URLs for a Federal Law (Gesetze im Internet)",
      description: `Returns the direct HTML, PDF, and XML download URLs for a German federal law
on gesetze-im-internet.de given its official abbreviation.

Use to provide a human-readable link to a specific statute without fetching the TOC.

Args:
  - abbreviation: Official law abbreviation (BGB, GmbHG, HGB, AO, ZPO, StGB, etc.)

Returns: { htmlUrl, pdfUrl, xmlUrl } for the law.
Source: https://www.gesetze-im-internet.de`,
      inputSchema: z.object({
        abbreviation: z.string().min(1).max(50)
          .transform(s => s.toLowerCase())
          .describe("Official law abbreviation (bgb, gmbhg, hgb, ao, zpo, stgb)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ abbreviation }) => {
      return jsonResponse({
        abbreviation: abbreviation.toUpperCase(),
        htmlUrl: `${GII_BASE_URL}/${abbreviation}/`,
        pdfUrl: `${GII_BASE_URL}/${abbreviation}/${abbreviation}.pdf`,
        xmlUrl: `${GII_BASE_URL}/${abbreviation}/xml.zip`,
        note: "HTML and XML updated daily. PDF is the official printable version.",
      });
    }
  );

  server.registerTool(
    "rii_list_court_portals",
    {
      title: "List Federal Court Decision Portals (Rechtsprechung im Internet)",
      description: `Returns a curated directory of official German federal court decision portals
accessible via rechtsprechung-im-internet.de and individual court websites.

Each entry includes court name, jurisdiction, URL, RSS feed, and coverage period.

Courts: BVerfG, BGH, BVerwG, BAG, BSG, BFH, BPatG + Justizportal (all Länder).
No API key required. Source: https://www.rechtsprechung-im-internet.de`,
      inputSchema: z.object({
        jurisdiction: z.enum([
          "all", "verfassungsrecht", "zivilrecht", "strafrecht",
          "verwaltungsrecht", "arbeitsrecht", "sozialrecht", "steuerrecht", "patentrecht"
        ]).default("all").describe("Filter by legal domain"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ jurisdiction }) => {
      const ALL_PORTALS = [
        { name: "Bundesverfassungsgericht (BVerfG)", abbreviation: "BVerfG", jurisdiction: "verfassungsrecht", level: "Bundesgericht",
          url: "https://www.bverfg.de/e/rs.html", rss: "https://www.bverfg.de/rss/entscheidungen.rss",
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bverfg`, coverage: "1998+, ~20,000 decisions" },
        { name: "Bundesgerichtshof (BGH)", abbreviation: "BGH", jurisdiction: "zivilrecht", level: "Bundesgericht",
          url: "https://www.bgh.bund.de/DE/Entscheidungen/entscheidungen_node.html", rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bgh`, coverage: "2000+" },
        { name: "Bundesverwaltungsgericht (BVerwG)", abbreviation: "BVerwG", jurisdiction: "verwaltungsrecht", level: "Bundesgericht",
          url: "https://www.bverwg.de/entscheidungen", rss: "https://www.bverwg.de/rss/entscheidungen.xml",
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bverwg`, coverage: "2000+" },
        { name: "Bundesarbeitsgericht (BAG)", abbreviation: "BAG", jurisdiction: "arbeitsrecht", level: "Bundesgericht",
          url: "https://www.bag.bund.de/DE/Entscheidungen/entscheidungen_node.html", rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bag`, coverage: "2000+" },
        { name: "Bundessozialgericht (BSG)", abbreviation: "BSG", jurisdiction: "sozialrecht", level: "Bundesgericht",
          url: "https://www.bsg.bund.de/DE/Entscheidungen/entscheidungen_node.html", rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bsg`, coverage: "2000+" },
        { name: "Bundesfinanzhof (BFH)", abbreviation: "BFH", jurisdiction: "steuerrecht", level: "Bundesgericht",
          url: "https://www.bundesfinanzhof.de/de/entscheidungen/entscheidungen-online/", rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bfh`, coverage: "2000+" },
        { name: "Bundespatentgericht (BPatG)", abbreviation: "BPatG", jurisdiction: "patentrecht", level: "Bundesgericht",
          url: "https://www.bundespatentgericht.de/bpatg/content/de/entscheidungen/Entscheidungen.html", rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bpatg`, coverage: "2010+" },
        { name: "Justizportal des Bundes und der Länder", abbreviation: "JPBL", jurisdiction: "all", level: "Portal",
          url: "https://www.justiz.de/onlinedienste/rechtsprechung/index.php", rss: null, via_rii: null,
          coverage: "Gateway to all 16 Bundesland court databases" },
        { name: "Rechtsprechung im Internet (Aggregator)", abbreviation: "RII", jurisdiction: "all", level: "Aggregator",
          url: RII_BASE_URL, rss: null, via_rii: null, coverage: "All federal high courts, 2010+, ~62,900 decisions" },
      ];

      const results = jurisdiction === "all"
        ? ALL_PORTALS
        : ALL_PORTALS.filter(p => p.jurisdiction === jurisdiction || p.jurisdiction === "all");

      return jsonResponse({ count: results.length, portals: results });
    }
  );
}
