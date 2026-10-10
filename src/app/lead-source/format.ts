// Display helpers shared by the Lead Finder views.

export type Row = Record<string, unknown>;

/** Tokens, API calls and estimated cost of a run (backend usage.py). */
export type Usage = {
  model: string | null;
  llm_priced: boolean;
  llm_runs: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  free_searches: number; // SearXNG / DDGS web searches
  directory_pages: number; // Yellow Pages / OpenStreetMap lookups (free)
  tavily_searches: number;
  brave_searches: number;
  places_text_searches: number;
  places_details: number;
  llm_cost_usd: number;
  api_cost_usd: number;
  total_cost_usd: number;
};

export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 372 → "6m 12s", 45 → "45s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

/** Running clock: 372 → "6:12". */
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function formatUsd(v: number): string {
  if (v > 0 && v < 0.01) return "<$0.01";
  return `$${v.toFixed(2)}`;
}

/** 412_345 → "412K", 1_200_000 → "1.2M". */
export function formatCount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

export const searchCalls = (u: Usage) =>
  num(u.free_searches) + num(u.directory_pages) + paidSearches(u) + num(u.places_text_searches) + num(u.places_details);

/** Searches through APIs with a free monthly allowance (Tavily, Brave). */
export const paidSearches = (u: Usage) => num(u.tavily_searches) + num(u.brave_searches);

export const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
