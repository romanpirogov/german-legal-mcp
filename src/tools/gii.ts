// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Gesetze im Internet & Rechtsprechung im Internet
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { giiGetToc, giiGetXml } from "../services/client.js";
import { CHARACTER_LIMIT, GII_BASE_URL, RII_BASE_URL } from "../constants.js";
import type { GiiLawEntry } from "../types.js";

function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT ? text : text.slice(0, CHARACTER_LIMIT) + "\n\n[… truncated]";
}

function textResponse(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: truncate(text) }] };
}

function jsonResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return textResponse(JSON.stringify(data, null, 2));
}

/**
 * Parse the GII table of contents XML and extract law entries.
 * The TOC format: <items><item><name>, <title>, <link> children</item>...</items>
 */
function parseGiiToc(xml: string): GiiLawEntry[] {
  const entries: GiiLawEntry[] = [];
  // Match each <item>…</item> block
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const name = block.match(/<name>(.*?)<\/name>/)?.[1]?.trim() ?? "";
    const title = block.match(/<title>(.*?)<\/title>/)?.[1]?.trim() ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ?? "";
    if (name && link) {
      const xmlUrl = link.replace(/\/index\.html$/, "/xml.zip");
      entries.push({ abbreviation: name, title, url: link, xmlUrl });
    }
  }
  return entries;
}

export function registerGiiTools(server: McpServer): void {

  // ── Table of Contents ────────────────────────────────────────────────────────

  server.registerTool(
    "gii_list_laws",
    {
      title: "List All Federal Laws (Gesetze im Internet)",
      description: `Fetch the complete table of contents of gesetze-im-internet.de —
the official Federal Ministry of Justice portal for all consolidated German federal laws.

Returns every law as: abbreviation (Abkürzung), full title, and direct XML download URL.
The list contains ~6,800+ statutes covering all areas of German federal law.

This is the authoritative, daily-updated official source published in the public domain.
Use the abbreviation or title to search for specific laws, then use gii_get_law_xml
to retrieve the full structured text.

Returns: Array of { abbreviation, title, url, xmlUrl }
Source: https://www.gesetze-im-internet.de/gii-toc.xml`,
      inputSchema: z.object({
        filter: z.string().min(1).max(100).optional()
          .describe("Optional substring filter on abbreviation or title (case-insensitive)"),
        limit: z.number().int().min(1).max(500).default(100)
          .describe("Max entries to return (1–500, default 100)"),
        offset: z.number().int().min(0).default(0)
          .describe("Offset for pagination"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ filter, limit, offset }) => {
      const xml = await giiGetToc();
      let entries = parseGiiToc(xml);

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

  // ── XML Text of a specific law ────────────────────────────────────────────────

  server.registerTool(
    "gii_get_law_xml",
    {
      title: "Get Federal Law XML Text (Gesetze im Internet)",
      description: `Download and return the structured XML text of a specific German federal law
from gesetze-im-internet.de.

The XML follows the official juris-DOCX format and includes:
- All paragraphs (§§) and articles with their official numbering
- Section headings and sub-structure
- Cross-references and footnotes
- Metadata: official title, abbreviation, dates, Bundesgesetzblatt reference

How to use:
1. Call gii_list_laws with a filter to find the law and its abbreviation.
2. Pass the abbreviation (e.g. "bgb", "gmbhg", "hgb") to this tool.

Args:
  - abbreviation: Official law abbreviation in lowercase (e.g. "bgb", "ao", "zgb")

Returns: Raw XML text of the law (truncated at ${CHARACTER_LIMIT} characters).
Source: https://www.gesetze-im-internet.de/{abbreviation}/xml.zip`,
      inputSchema: z.object({
        abbreviation: z.string()
          .min(1).max(50)
          .regex(/^[a-z0-9_-]+$/i, "Use lowercase abbreviation only (e.g. bgb, gmbhg, hgb, ao)")
          .transform(s => s.toLowerCase())
          .describe("Official law abbreviation in lowercase (e.g. 'bgb', 'gmbhg', 'ao', 'hgb')"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ abbreviation }) => {
      // GII serves XML as a zip; the raw XML file is also accessible directly
      // at /{abbr}/BJNR*.xml — but we can point to the direct XML endpoint
      const url = `/${abbreviation}/xml.zip`;
      try {
        const xml = await giiGetXml(url);
        return textResponse(xml);
      } catch {
        // Fallback: try without zip extension
        const xmlDirect = await giiGetXml(`/${abbreviation}/`);
        return textResponse(xmlDirect);
      }
    }
  );

  // ── Rechtsprechung im Internet: court portals directory ───────────────────────

  server.registerTool(
    "rii_list_court_portals",
    {
      title: "List Federal Court Decision Portals (Rechtsprechung im Internet)",
      description: `Returns a curated directory of official German federal court decision portals
accessible via rechtsprechung-im-internet.de and each court's own website.

Each entry includes:
- Court name and abbreviation
- Jurisdiction and level
- Direct URL to the court's online decision database
- RSS feed URL for new decisions (where available)
- Coverage period and approximate number of decisions

Courts covered:
BVerfG (Constitutional), BGH (Civil/Criminal), BVerwG (Administrative),
BAG (Labour), BSG (Social), BFH (Finance/Tax), BPatG (Patent),
OLG courts (state courts of appeal), plus links to all state Justizportale.

No API key required. Source: https://www.rechtsprechung-im-internet.de`,
      inputSchema: z.object({
        jurisdiction: z.enum([
          "all", "verfassungsrecht", "zivilrecht", "strafrecht",
          "verwaltungsrecht", "arbeitsrecht", "sozialrecht", "steuerrecht", "patentrecht"
        ]).default("all")
          .describe("Filter by legal domain"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ jurisdiction }) => {
      const ALL_PORTALS = [
        {
          name: "Bundesverfassungsgericht (BVerfG)",
          abbreviation: "BVerfG",
          jurisdiction: "verfassungsrecht",
          level: "Bundesgericht",
          url: "https://www.bverfg.de/e/rs.html",
          rss: "https://www.bverfg.de/rss/entscheidungen.rss",
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bverfg`,
          coverage: "Decisions from 1998+, ~20,000+ decisions",
          note: "Also includes English translations of landmark decisions",
        },
        {
          name: "Bundesgerichtshof (BGH)",
          abbreviation: "BGH",
          jurisdiction: "zivilrecht",
          level: "Bundesgericht",
          url: "https://www.bgh.bund.de/DE/Entscheidungen/entscheidungen_node.html",
          rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bgh`,
          coverage: "Decisions from 2000+",
          note: "Civil and criminal law supreme court",
        },
        {
          name: "Bundesverwaltungsgericht (BVerwG)",
          abbreviation: "BVerwG",
          jurisdiction: "verwaltungsrecht",
          level: "Bundesgericht",
          url: "https://www.bverwg.de/entscheidungen",
          rss: "https://www.bverwg.de/rss/entscheidungen.xml",
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bverwg`,
          coverage: "Decisions from 2000+",
          note: null,
        },
        {
          name: "Bundesarbeitsgericht (BAG)",
          abbreviation: "BAG",
          jurisdiction: "arbeitsrecht",
          level: "Bundesgericht",
          url: "https://www.bag.bund.de/DE/Entscheidungen/entscheidungen_node.html",
          rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bag`,
          coverage: "Decisions from 2000+",
          note: null,
        },
        {
          name: "Bundessozialgericht (BSG)",
          abbreviation: "BSG",
          jurisdiction: "sozialrecht",
          level: "Bundesgericht",
          url: "https://www.bsg.bund.de/DE/Entscheidungen/entscheidungen_node.html",
          rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bsg`,
          coverage: "Decisions from 2000+",
          note: null,
        },
        {
          name: "Bundesfinanzhof (BFH)",
          abbreviation: "BFH",
          jurisdiction: "steuerrecht",
          level: "Bundesgericht",
          url: "https://www.bundesfinanzhof.de/de/entscheidungen/entscheidungen-online/",
          rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bfh`,
          coverage: "Decisions from 2000+",
          note: "Key source for German tax law decisions",
        },
        {
          name: "Bundespatentgericht (BPatG)",
          abbreviation: "BPatG",
          jurisdiction: "patentrecht",
          level: "Bundesgericht",
          url: "https://www.bundespatentgericht.de/bpatg/content/de/entscheidungen/Entscheidungen.html",
          rss: null,
          via_rii: `${RII_BASE_URL}/cgi-bin/rechtsprechung/list.py?Gericht=bpatg`,
          coverage: "Decisions from 2010+",
          note: null,
        },
        {
          name: "Justizportal des Bundes und der Länder",
          abbreviation: "JPBL",
          jurisdiction: "all",
          level: "Portal (Bund + Länder)",
          url: "https://www.justiz.de/onlinedienste/rechtsprechung/index.php",
          rss: null,
          via_rii: null,
          coverage: "Gateway to all federal and state court portals",
          note: "Includes links to all 16 Länder court databases with free decisions",
        },
        {
          name: "Rechtsprechung im Internet (Bund)",
          abbreviation: "RII",
          jurisdiction: "all",
          level: "Aggregator (Bundesgerichte)",
          url: RII_BASE_URL,
          rss: null,
          via_rii: null,
          coverage: "All federal high courts, decisions from 2010+, ~62,900 decisions",
          note: "Search by keyword, court, date; HTML/PDF/XML formats; decisions in German only",
        },
      ];

      const results = jurisdiction === "all"
        ? ALL_PORTALS
        : ALL_PORTALS.filter(p => p.jurisdiction === jurisdiction || p.jurisdiction === "all");

      return jsonResponse({
        count: results.length,
        note: "All portals are free, publicly accessible, and available in German. " +
          "For programmatic access use the XML feeds or Open Legal Data / NeuRIS APIs.",
        portals: results,
      });
    }
  );

  // ── GII Law info ─────────────────────────────────────────────────────────────

  server.registerTool(
    "gii_get_law_url",
    {
      title: "Get Direct URL for a Federal Law (Gesetze im Internet)",
      description: `Returns the direct HTML, PDF, and XML download URLs for a German federal law 
on gesetze-im-internet.de given its official abbreviation.

Use this when you need to provide a human-readable link to a specific statute,
or to construct download URLs without fetching the full table of contents.

Args:
  - abbreviation: Official law abbreviation (case-insensitive, e.g. BGB, GmbHG, HGB)

Returns: { htmlUrl, pdfUrl, xmlUrl, tocUrl } for the law.
Source: https://www.gesetze-im-internet.de`,
      inputSchema: z.object({
        abbreviation: z.string().min(1).max(50)
          .transform(s => s.toLowerCase())
          .describe("Official law abbreviation (e.g. 'bgb', 'gmbhg', 'hgb', 'ao', 'zpo', 'stgb')"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ abbreviation }) => {
      return jsonResponse({
        abbreviation: abbreviation.toUpperCase(),
        htmlUrl: `${GII_BASE_URL}/${abbreviation}/`,
        pdfUrl: `${GII_BASE_URL}/${abbreviation}/${abbreviation}.pdf`,
        xmlUrl: `${GII_BASE_URL}/${abbreviation}/xml.zip`,
        tocUrl: `${GII_BASE_URL}/gii-toc.xml`,
        note: "HTML and XML versions are updated daily. PDF is the official printable version.",
      });
    }
  );
}
