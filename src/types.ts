// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Types
// ─────────────────────────────────────────────────────────────────────────────

// ── DIP Bundestag ─────────────────────────────────────────────────────────────

export interface DipListMeta {
  numFound: number;
  numFoundExact: boolean;
  cursor?: string;
}

export interface DipListResponse<T> {
  cursor?: string;
  numFound: number;
  documents: T[];
}

export interface DipDrucksache {
  id: string;
  typ: string;
  drucksachetyp?: string;
  dokumentnummer?: string;
  datum?: string;
  titel: string;
  herausgeber?: string;
  urheber?: string[];
  wahlperiode?: number;
  pdf_url?: string;
}

export interface DipPlenarprotokoll {
  id: string;
  dokumentnummer?: string;
  datum?: string;
  titel: string;
  wahlperiode?: number;
  sitzungsnummer?: number;
  pdf_url?: string;
}

export interface DipVorgang {
  id: string;
  typ: string;
  titel: string;
  wahlperiode?: number;
  datum?: string;
  sachgebiet?: string[];
  deskriptor?: Array<{ name: string; typ: string }>;
}

export interface DipPerson {
  id: string;
  nachname: string;
  vorname: string;
  typ: string;
  titel?: string;
  aktualisiert?: string;
}

export interface DipAktivitaet {
  id: string;
  aktivitaetsart?: string;
  datum?: string;
  titel?: string;
  vorgang?: { titel: string; id: string };
  person?: { titel: string; id: string };
}

// ── NeuRIS ────────────────────────────────────────────────────────────────────

export interface NeurisLegislation {
  id: string;
  abbreviation?: string;
  title?: string;
  longTitle?: string;
  status?: string;
  documentType?: string;
  dateOfSignature?: string;
  dateOfEntry?: string;
}

export interface NeurisCaseLaw {
  id: string;
  fileNumber?: string;
  court?: { label?: string; location?: string };
  decisionDate?: string;
  documentType?: string;
  headline?: string;
  guiding_principle?: string;
}

// ── Open Legal Data ───────────────────────────────────────────────────────────

export interface OldpCase {
  id: number;
  slug?: string;
  date?: string;
  court?: { id: number; name: string; jurisdiction?: string };
  file_number?: string;
  type?: string;
  content?: string;
  abstract?: string;
  ecli?: string;
}

export interface OldpLaw {
  id: number;
  slug?: string;
  name?: string;
  abbreviation?: string;
  date?: string;
  content?: string;
}

export interface OldpCourt {
  id: number;
  name: string;
  city?: string;
  state?: string;
  jurisdiction?: string;
  level_of_appeal?: string;
}

export interface OldpListResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface GiiLawEntry {
  abbreviation: string;
  title: string;
  url: string;
  xmlUrl: string;
}
