// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — HTTP Client
// ─────────────────────────────────────────────────────────────────────────────

import axios, { type AxiosInstance, type AxiosError } from "axios";
import {
  DIP_BASE_URL, DIP_API_KEY,
  NEURIS_BASE_URL,
  OLDP_BASE_URL, OLDP_API_KEY,
  GII_BASE_URL, GII_TOC_URL,
} from "../constants.js";

// ── Generic HTTP helper ───────────────────────────────────────────────────────

function makeClient(baseURL: string, headers?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: 15_000,
    headers: { "Accept": "application/json", ...headers },
  });
}

function handleAxiosError(err: unknown, context: string): never {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    const status = ae.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(`${context}: Authentication failed (${status}). Check your API key.`);
    }
    if (status === 404) {
      throw new Error(`${context}: Resource not found (404).`);
    }
    if (status === 429) {
      throw new Error(`${context}: Rate limit exceeded (429). Wait before retrying.`);
    }
    throw new Error(`${context}: HTTP ${status ?? "unknown"} — ${ae.message}`);
  }
  throw new Error(`${context}: Unexpected error — ${String(err)}`);
}

// ── DIP Bundestag Client ──────────────────────────────────────────────────────

const dipClient = makeClient(DIP_BASE_URL);

export async function dipGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!DIP_API_KEY) {
    throw new Error(
      "DIP_API_KEY environment variable is required. " +
      "Register at https://dip.bundestag.de/über-dip/hilfe/api to get a free key."
    );
  }
  try {
    const res = await dipClient.get<T>(path, {
      params: { apikey: DIP_API_KEY, format: "json", ...params },
    });
    return res.data;
  } catch (err) {
    return handleAxiosError(err, `DIP ${path}`);
  }
}

// ── NeuRIS Client ─────────────────────────────────────────────────────────────

const neurisClient = makeClient(NEURIS_BASE_URL, { "Accept": "application/json" });

export async function neurisGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await neurisClient.get<T>(path, { params });
    return res.data;
  } catch (err) {
    return handleAxiosError(err, `NeuRIS ${path}`);
  }
}

// ── Open Legal Data Client ────────────────────────────────────────────────────

const oldpHeaders: Record<string, string> = {};
if (OLDP_API_KEY) oldpHeaders["Authorization"] = `Token ${OLDP_API_KEY}`;

const oldpClient = makeClient(OLDP_BASE_URL, oldpHeaders);

export async function oldpGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await oldpClient.get<T>(path, { params });
    return res.data;
  } catch (err) {
    return handleAxiosError(err, `OpenLegalData ${path}`);
  }
}

// ── Gesetze im Internet Client (XML) ─────────────────────────────────────────

const giiClient = makeClient(GII_BASE_URL, { "Accept": "text/xml, application/xml" });

export async function giiGetXml(path: string): Promise<string> {
  try {
    const res = await giiClient.get<string>(path, {
      responseType: "text",
      headers: { "Accept": "application/xml, text/xml, */*" },
    });
    return res.data;
  } catch (err) {
    return handleAxiosError(err, `GII ${path}`);
  }
}

export async function giiGetToc(): Promise<string> {
  try {
    const res = await axios.get<string>(GII_TOC_URL, {
      timeout: 20_000,
      responseType: "text",
      headers: { "Accept": "application/xml, text/xml" },
    });
    return res.data;
  } catch (err) {
    return handleAxiosError(err, "GII Table of Contents");
  }
}
