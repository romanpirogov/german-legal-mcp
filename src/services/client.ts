// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — HTTP Client
// Fixes: OLDP timeout 15s→45s, GII timeout 20s→60s, retry on network errors
// ─────────────────────────────────────────────────────────────────────────────

import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
} from "axios";
import axiosRetry from "axios-retry";
import {
  DIP_BASE_URL, DIP_API_KEY,
  NEURIS_BASE_URL,
  OLDP_BASE_URL, OLDP_API_KEY,
  GII_BASE_URL, GII_TOC_URL,
} from "../constants.js";

function handleAxiosError(err: unknown, context: string): never {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    const status = ae.response?.status;
    if (status === 401 || status === 403)
      throw new Error(`${context}: Authentication failed (${status}). Check your API key.`);
    if (status === 404)
      throw new Error(`${context}: Resource not found (404).`);
    if (status === 429)
      throw new Error(`${context}: Rate limit exceeded (429). Wait before retrying.`);
    if (ae.code === "ECONNABORTED" || ae.message.includes("timeout"))
      throw new Error(`${context}: Request timed out. Upstream service is slow — try again shortly.`);
    throw new Error(`${context}: HTTP ${status ?? "unknown"} — ${ae.message}`);
  }
  throw new Error(`${context}: Unexpected error — ${String(err)}`);
}

function makeClient(baseURL: string, timeout: number, headers?: Record<string, string>): AxiosInstance {
  const instance = axios.create({ baseURL, timeout, headers: { Accept: "application/json", ...headers } });
  axiosRetry(instance, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) =>
      axiosRetry.isNetworkError(err) ||
      axiosRetry.isIdempotentRequestError(err) ||
      (err.response !== undefined && err.response.status >= 500),
    onRetry: (_n, _err) => {},
  });
  return instance;
}

// ── DIP Bundestag (10 s — fast official REST API) ─────────────────────────────
const dipClient = makeClient(DIP_BASE_URL, 10_000);

export async function dipGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!DIP_API_KEY)
    throw new Error("DIP_API_KEY env var required. Register at https://dip.bundestag.de/über-dip/hilfe/api");
  try {
    const res = await dipClient.get<T>(path, { params: { apikey: DIP_API_KEY, format: "json", ...params } });
    return res.data;
  } catch (err) { return handleAxiosError(err, `DIP ${path}`); }
}

// ── NeuRIS (15 s — beta, can be slow) ────────────────────────────────────────
const neurisClient = makeClient(NEURIS_BASE_URL, 15_000, { Accept: "application/json" });

export async function neurisGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await neurisClient.get<T>(path, { params });
    return res.data;
  } catch (err) { return handleAxiosError(err, `NeuRIS ${path}`); }
}

// ── Open Legal Data (45 s — community server, frequently 10–30 s) ─────────────
const oldpHeaders: Record<string, string> = {};
if (OLDP_API_KEY) oldpHeaders["Authorization"] = `Token ${OLDP_API_KEY}`;
const oldpClient = makeClient(OLDP_BASE_URL, 45_000, oldpHeaders);

export async function oldpGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await oldpClient.get<T>(path, { params });
    return res.data;
  } catch (err) { return handleAxiosError(err, `OpenLegalData ${path}`); }
}

// ── Gesetze im Internet (60 s — large XML, ~500 KB) ──────────────────────────
const giiClient = makeClient(GII_BASE_URL, 60_000, { Accept: "application/xml, text/xml, */*" });

export async function giiGetXml(path: string): Promise<string> {
  try {
    const res = await giiClient.get<string>(path, { responseType: "text" } as AxiosRequestConfig);
    return res.data as string;
  } catch (err) { return handleAxiosError(err, `GII ${path}`); }
}

export async function giiGetToc(): Promise<string> {
  try {
    const instance = axios.create({ timeout: 60_000 });
    axiosRetry(instance, { retries: 2, retryDelay: axiosRetry.exponentialDelay,
      retryCondition: axiosRetry.isNetworkOrIdempotentRequestError });
    const res = await instance.get<string>(GII_TOC_URL, {
      responseType: "text", headers: { Accept: "application/xml, text/xml" },
    });
    return res.data as string;
  } catch (err) { return handleAxiosError(err, "GII Table of Contents"); }
}
