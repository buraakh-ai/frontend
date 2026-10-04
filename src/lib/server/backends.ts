import "server-only";

// Each module talks to its OWN backend; never point one at the other's.
// Read at request time (not build time) so one Docker image works everywhere.

const trim = (url: string) => url.replace(/\/+$/, "");

/** Ad generator: AD_GENERATOR_BACKEND_URL, falling back to BACKEND_BASE_URL. */
export function adGeneratorBackendUrl(): string {
  return trim(process.env.AD_GENERATOR_BACKEND_URL || process.env.BACKEND_BASE_URL || "http://localhost:8000");
}

/** Lead source: LEAD_SOURCE_BACKEND_URL, then legacy BACKEND_URL, then the
 * config's default_url. Deliberately NOT BACKEND_BASE_URL (that is the Ad
 * generator's backend). */
export function leadSourceBackendUrl(configDefault: string): string {
  return trim(process.env.LEAD_SOURCE_BACKEND_URL || process.env.BACKEND_URL || configDefault);
}

export function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/** Zoho integration: ZOHO_INTEGRATION_BACKEND_URL only. Never falls back to
 * the other modules' backends. */
export function zohoIntegrationBackendUrl(): string {
  return trim(process.env.ZOHO_INTEGRATION_BACKEND_URL || "http://zoho-export.leadsource.local:8000");
}

/** Bitrix export: BITRIX_EXPORT_BACKEND_URL only. Never falls back to the
 * other modules' backends. */
export function bitrixExportBackendUrl(): string {
  return trim(process.env.BITRIX_EXPORT_BACKEND_URL || "http://localhost:8003");
}

/** The bitrixexport backend's EXPORT_API_KEY, sent as X-API-Key. Server-side
 * only; the browser never sees it. */
export function bitrixExportApiKey(): string | undefined {
  return process.env.BITRIX_EXPORT_API_KEY || undefined;
}

/** Lead Hub (where every lead source lands its leads; AWS RDS):
 * LEAD_HUB_BACKEND_URL only. Unset until its backend is deployed; sources then
 * can't send leads to it yet. */
export function leadHubBackendUrl(): string | undefined {
  const url = process.env.LEAD_HUB_BACKEND_URL?.trim();
  return url ? trim(url) : undefined;
}
