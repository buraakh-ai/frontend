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
