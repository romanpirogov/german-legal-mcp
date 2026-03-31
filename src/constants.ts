// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Constants
// ─────────────────────────────────────────────────────────────────────────────

/** DIP Bundestag REST API */
export const DIP_BASE_URL = "https://search.dip.bundestag.de/api/v1";

/** NeuRIS — Neues Rechtsinformationssystem (Beta) */
export const NEURIS_BASE_URL = "https://testphase.rechtsinformationen.bund.de/v1";

/** Open Legal Data REST API */
export const OLDP_BASE_URL = "https://de.openlegaldata.io/api";

/** Gesetze im Internet — XML table of contents */
export const GII_TOC_URL = "https://www.gesetze-im-internet.de/gii-toc.xml";
export const GII_BASE_URL = "https://www.gesetze-im-internet.de";

/** Rechtsprechung im Internet */
export const RII_BASE_URL = "https://www.rechtsprechung-im-internet.de";

/** Max characters returned in a single response to avoid context overflow */
export const CHARACTER_LIMIT = 12_000;

/** Default page size for list endpoints */
export const DEFAULT_PAGE_SIZE = 20;

/** DIP API requires a key — read from env */
export const DIP_API_KEY = process.env.DIP_API_KEY ?? "";

/** Open Legal Data optional API key */
export const OLDP_API_KEY = process.env.OLDP_API_KEY ?? "";
