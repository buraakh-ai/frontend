// Time and cost estimate shown before a run, from the run's shape (businesses
// to check, searches, batches). Once this browser has finished runs, the
// estimate is scaled by how actual runs compared with their estimates. Run
// history is a per-viewer convenience kept in localStorage.

export type RunShape = {
  sources: number; // businesses to check
  serpQueries: number; // discovery searches through SerpAPI
  placesQueries: number; // discovery searches through Google Places
  resultsPerQuery: number;
  batchSize: number;
  concurrency: number;
  findDecisionMakers: boolean;
  searchForEmails?: boolean;
};
export type RunRecord = { leads: number; seconds: number; cost: number; estSeconds: number; estCost: number; at: number };
export type Estimate = { seconds: number; cost: number; fromHistory: number };

// List prices; keep in sync by hand with the backend's settings (usage.py).
const SERPAPI_SEARCH = 0.015;
const PLACES_TEXT_SEARCH = 0.032;
const PLACES_DETAILS = 0.02;
// Measured on test runs (gpt-4o-mini, evidence-first enrichment):
const AI_PER_BUSINESS = 0.0002; // ~900 tokens each
const WEBSITE_LOOKUP_SHARE = 0.5; // directory results needing a search for their own site
const EMAIL_SEARCH_SHARE = 0.5; // businesses with no email on their own website
const DISCOVERY_SECONDS = 12; // per chunk of parallel discovery searches
const DISCOVERY_CHUNK = 6;
const BATCH_SECONDS = 45; // scraping + one AI call, for a batch of up to ~10

export function estimateShape(shape: RunShape): { seconds: number; cost: number } {
  const discoveryChunks = Math.max(1, Math.ceil((shape.serpQueries + shape.placesQueries) / DISCOVERY_CHUNK));
  const batches = Math.max(1, Math.ceil(shape.sources / Math.max(shape.batchSize, 1)));
  const waves = Math.ceil(batches / Math.max(shape.concurrency, 1));
  const seconds = discoveryChunks * DISCOVERY_SECONDS + waves * BATCH_SECONDS;

  const perBusinessSearches =
    WEBSITE_LOOKUP_SHARE + (shape.findDecisionMakers ? 1 : 0) + (shape.searchForEmails ? EMAIL_SEARCH_SHARE : 0);
  const cost =
    shape.serpQueries * SERPAPI_SEARCH +
    shape.placesQueries * (PLACES_TEXT_SEARCH + shape.resultsPerQuery * PLACES_DETAILS) +
    shape.sources * (perBusinessSearches * SERPAPI_SEARCH + AI_PER_BUSINESS);
  return { seconds, cost };
}

const KEY = "leadFinder.runHistory.v2";
const KEEP = 10;

function readHistory(): RunRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((r) => r && r.estSeconds > 0 && r.seconds > 0) : [];
  } catch {
    return [];
  }
}

// Cached so useSyncExternalStore gets a stable snapshot; refreshed on recordRun.
let cache: RunRecord[] | null = null;
const listeners = new Set<() => void>();
const NONE: RunRecord[] = [];

/** Past runs in this browser, for useSyncExternalStore (empty on the server). */
export const runHistory = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => (cache ??= readHistory()),
  getServer: () => NONE,
};

export function recordRun(run: Omit<RunRecord, "at">): void {
  if (run.seconds <= 0 || run.estSeconds <= 0) return;
  cache = [{ ...run, at: Date.now() }, ...runHistory.get()].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable (private window etc.): kept for this tab only.
  }
  listeners.forEach((l) => l());
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v: number) => Math.min(3, Math.max(0.33, v));

export function estimateRun(shape: RunShape, history: RunRecord[]): Estimate {
  const base = estimateShape(shape);
  if (!history.length) return { ...base, fromHistory: 0 };
  const timeScale = clamp(median(history.map((r) => r.seconds / r.estSeconds)));
  const costRuns = history.filter((r) => r.estCost > 0);
  const costScale = costRuns.length ? clamp(median(costRuns.map((r) => r.cost / r.estCost))) : 1;
  return { seconds: base.seconds * timeScale, cost: base.cost * costScale, fromHistory: history.length };
}
