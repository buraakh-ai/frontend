"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock, Coins, DatabaseZap, Download, Gauge, MapPin, Play, RotateCcw, Target, type LucideIcon } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import type { LeadConfig } from "@/lib/server/lead-config";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Checkbox, Expander, MultiSelect, PageHeader, Select, Slider, TextInput, downloadText,
} from "@/components/ui";
import { estimateRun, estimateShape, recordRun, runHistory, type RunShape } from "./estimate";
import { clock, formatDuration, formatUsd, num, type Row, type Usage } from "./format";
import { RunProgress, type JobStatus } from "./run-progress";
import { LeadTable, RunDetails, RunSummaryBanner } from "./run-results";

type Notice = { kind: "success" | "error" | "warning"; text: string };
type Depth = "quick" | "standard" | "thorough";

// How widely to search. `factor` = businesses checked per lead wanted.
const DEPTHS: Record<Depth, { label: string; what: string; factor: number; pages: number }> = {
  quick: { label: "Quick", what: "Fastest — great for a live demo.", factor: 1.5, pages: 1 },
  standard: { label: "Standard", what: "Balanced speed and coverage.", factor: 2, pages: 1 },
  thorough: { label: "Thorough", what: "Most coverage; takes longer.", factor: 3, pages: 2 },
};
const LEAD_PRESETS = [10, 25, 50, 100];
const POLL_MS = 2000;
// Consecutive failed status checks tolerated (e.g. a brief network blip).
const MAX_POLL_FAILURES = 5;

const today = () => new Date().toISOString().slice(0, 10);
const splitCsv = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
const unique = (xs: string[]) => [...new Set(xs)];
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// crypto.randomUUID only exists on HTTPS/localhost; getRandomValues works on plain HTTP too.
const newId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );
// A lead nobody can contact isn't selected for export by default (it can still be ticked).
const reachable = (lead: Row) => Boolean(lead.business_email || lead.personal_email || lead.phone);

function initialForm(config: LeadConfig) {
  const run = config.run_controls;
  return {
    country: config.geography.default_country,
    state: config.geography.default_state,
    selectedAreas: [] as string[],
    customAreas: "",
    industries: [...config.targeting.default_industries],
    // Narrower kinds of business within the industries, e.g. "Indian restaurants".
    specialties: [] as string[],
    customSpecialties: "",
    roles: [...config.targeting.default_roles],
    inclusion: "",
    exclusion: "",
    leadCount: run.lead_count.default,
    depth: "standard" as Depth,
    findDecisionMakers: true,
    searchForEmails: true,
    // Businesses to check; null = derived from the lead count and depth.
    sourceOverride: null as number | null,
    resultsPerQuery: run.results_per_query.default,
    pagesPerQuery: DEPTHS.standard.pages,
    batchSize: run.enrichment_batch_size.default,
    concurrency: run.enrichment_concurrency.default,
  };
}
type Form = ReturnType<typeof initialForm>;

type Results = {
  name: string;
  campaign: Row;
  leadSources: Row[];
  leads: Row[];
  summary: Row | null;
  usage: Usage | null;
  seconds: number;
  target: number;
  // The person pressed Stop: these are the leads found until then.
  stopped: boolean;
};

// Kept for the life of the tab, so a run in progress (and its results)
// survives switching to another module and back.
const store = createStore({
  form: null as Form | null,
  // The run in progress, with its pre-run estimate (to calibrate later estimates).
  job: null as { id: string; name: string; startedAt: number; target: number; shape: RunShape; stopping?: boolean } | null,
  live: null as JobStatus | null,
  results: null as Results | null,
  runError: null as string | null,
  // Which leads to export to the Lead Hub, and which already were (by row).
  selected: [] as boolean[],
  exported: [] as boolean[],
});

const significantWords = (s: string) =>
  s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3).map((w) => w.replace(/s$/, ""));

/**
 * What the run searches for. An industry with a specialty picked is searched
 * only by its specialties ("Indian restaurants", not every restaurant); the
 * others are searched as a whole. Specialties go to the backend as the
 * campaign's subcategories, which it searches like industries.
 * A typed specialty with one industry picked refines that industry, and
 * "Indian" becomes "Indian restaurants".
 */
function searchTargets(
  industries: string[],
  specialties: string[],
  custom: string[],
  suggestions: Record<string, string[]>,
): { industries: string[]; subcategories: string[] } {
  const refined = new Set(industries.filter((i) => specialties.some((s) => suggestions[i]?.includes(s))));
  const typed = custom.map((term) => {
    if (industries.length !== 1) return term;
    refined.add(industries[0]);
    const words = significantWords(industries[0]);
    return significantWords(term).some((w) => words.includes(w)) ? term : `${term} ${industries[0].toLowerCase()}`;
  });
  return {
    industries: industries.filter((i) => !refined.has(i)),
    subcategories: unique([...specialties, ...typed]),
  };
}

/** e.g. "Indian restaurants & Retail – Irvine, California" */
function campaignName(industries: string[], areas: string[], region: string): string {
  const what = industries.slice(0, 2).join(" & ") + (industries.length > 2 ? ` +${industries.length - 2}` : "");
  const where = [areas.length === 1 ? areas[0] : areas.length > 1 ? `${areas.length} cities` : "", region]
    .filter(Boolean)
    .join(", ");
  return [what, where].filter(Boolean).join(" – ") || "Lead sourcing run";
}

function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const fields = unique(rows.flatMap((r) => Object.keys(r)));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  // BOM so Excel opens it as UTF-8.
  return "﻿" + [fields.join(","), ...rows.map((r) => fields.map((f) => esc(r[f])).join(","))].join("\r\n");
}

// --- Background run: start a job, then poll it until it finishes. ----------
// Lives at module level so it keeps going while the person is on another page.

let pollingJobId: string | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function finishRun(status: JobStatus) {
  const job = store.get().job;
  const stopped = status.status === "cancelled";
  const result = (status.result ?? {}) as Row;
  const leads = Array.isArray(result.leads) ? (result.leads as Row[]) : [];
  const summary = result.run_summary && typeof result.run_summary === "object" ? (result.run_summary as Row) : null;
  const usage = (summary?.usage as Usage | undefined) ?? status.usage ?? null;
  const seconds = num(summary?.duration_seconds) || status.elapsed_seconds;
  store.set({
    job: null,
    live: null,
    results: {
      name: job?.name ?? "Lead sourcing run",
      campaign: (result.campaign as Row) ?? {},
      leadSources: Array.isArray(result.lead_sources) ? (result.lead_sources as Row[]) : [],
      leads,
      summary,
      usage,
      seconds,
      target: job?.target ?? leads.length,
      stopped,
    },
    selected: leads.map(reachable),
    exported: leads.map(() => false),
  });
  // A stopped run says nothing about how long a full one takes.
  if (job && !stopped) {
    const est = estimateShape(job.shape);
    recordRun({ leads: leads.length, seconds, cost: num(usage?.total_cost_usd), estSeconds: est.seconds, estCost: est.cost });
  }
}

async function pollJob(jobId: string) {
  if (pollingJobId === jobId) return;
  pollingJobId = jobId;
  let failures = 0;
  try {
    while (store.get().job?.id === jobId) {
      try {
        const status = await callApi<JobStatus>("lead", `v2/sourcing-jobs/${jobId}`);
        failures = 0;
        if (status.status === "succeeded" || status.status === "cancelled") return finishRun(status);
        if (status.status === "failed") {
          return store.set({ job: null, live: null, runError: status.error || "The run failed." });
        }
        store.set({ live: status });
      } catch (e) {
        if (++failures >= MAX_POLL_FAILURES) {
          return store.set({ job: null, live: null, runError: `Lost track of the run: ${(e as Error).message}` });
        }
      }
      await sleep(POLL_MS);
    }
  } finally {
    if (pollingJobId === jobId) pollingJobId = null;
  }
}

function beginJob(job: { id: string; name: string; target: number; shape: RunShape }) {
  store.set({ job: { ...job, startedAt: Date.now() }, live: null });
  void pollJob(job.id);
}

/** Asks the backend to stop the run; polling then picks up the leads found so far. */
async function stopRun() {
  const job = store.get().job;
  if (!job || job.stopping) return;
  store.set({ job: { ...job, stopping: true } });
  try {
    await callApi("lead", `v2/sourcing-jobs/${job.id}/cancel`, {});
  } catch (e) {
    const current = store.get().job;
    if (current?.id === job.id) {
      store.set({ job: { ...current, stopping: false }, runError: `Could not stop the run: ${(e as Error).message}` });
    }
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function LeadSource({ config, warning }: { config: LeadConfig; warning: string | null }) {
  const [s, set] = store.useStore();
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<Notice | null>(null);
  const history = useSyncExternalStore(runHistory.subscribe, runHistory.get, runHistory.getServer);
  const runArea = useRef<HTMLDivElement>(null);
  const running = !!s.job;
  const now = useNow(running);

  useEffect(() => {
    if (!store.get().form) store.set({ form: initialForm(config) });
  }, [config]);
  // Resume watching a run started before the person left this page.
  useEffect(() => {
    const job = store.get().job;
    if (job) void pollJob(job.id);
  }, []);

  const header = (
    <PageHeader
      eyebrow="Lead sources"
      title="Lead Finder"
      subtitle="Find local businesses that match your ideal client, enriched with phone, email and decision makers, ready to review and send to the Lead Hub."
    />
  );
  if (!s.form) return header;

  const form = s.form;
  const setForm = (patch: Partial<Form>) => set((st) => ({ form: { ...st.form!, ...patch } }));
  const { geography, targeting, run_controls: runCfg } = config;
  const isUS = form.country === "United States";
  const suggestedCities = isUS ? ((geography.state_areas as Record<string, string[]>)[form.state] ?? []) : [];
  const areas = unique([...form.selectedAreas, ...splitCsv(form.customAreas)]);
  // Example text from the chosen state's own cities (not ones already picked).
  const exampleCities = suggestedCities.filter((c) => !form.selectedAreas.includes(c)).slice(0, 2);
  const otherAreasHint = exampleCities.length
    ? `e.g. ${exampleCities.join(", ")} or a ZIP code`
    : isUS ? "City names or ZIP codes, comma-separated" : "City names or postal codes, comma-separated";
  const specialtyMap = targeting.specialty_suggestions as Record<string, string[]>;
  const specialtyOptions = unique(form.industries.flatMap((i) => specialtyMap[i] ?? []));
  const targets = searchTargets(form.industries, form.specialties, splitCsv(form.customSpecialties), specialtyMap);
  const searchedFor = [...targets.subcategories, ...targets.industries];
  const region = form.state || form.country;
  const name = campaignName(searchedFor, areas, region);
  const providers = Object.values(runCfg.provider_labels);

  const depth = DEPTHS[form.depth];
  const autoSources = clamp(Math.ceil(form.leadCount * depth.factor), runCfg.source_count.min, runCfg.source_count.max);
  const sourceCount = form.sourceOverride ?? autoSources;
  // Discovery searches: every provider for every city × kind of business.
  const searchCells = Math.max(areas.length, 1) * Math.max(searchedFor.length, 1);
  const plannedQueries = clamp(searchCells * providers.length, 1, 200);
  const placesQueries = providers.includes("google_places") ? Math.min(searchCells, plannedQueries) : 0;
  const shape: RunShape = {
    sources: sourceCount,
    webQueries: (plannedQueries - placesQueries) * form.pagesPerQuery,
    placesQueries: placesQueries * form.pagesPerQuery,
    resultsPerQuery: form.resultsPerQuery,
    batchSize: form.batchSize,
    concurrency: form.concurrency,
    findDecisionMakers: form.findDecisionMakers,
    searchForEmails: form.searchForEmails,
  };
  const estimate = estimateRun(shape, history);
  const missing = !form.industries.length ? "an industry" : !form.state && !areas.length ? "a state or city" : null;

  async function startRun() {
    set({ runError: null });
    setExportNotice(null);
    const campaign = {
      campaign_id: newId(),
      campaign_name: name,
      campaign_status: "active",
      period_start: today(),
      period_end: today(),
      country: form.country,
      state: form.state,
      geography: [...areas, form.state, form.country].filter(Boolean).join(", "),
      cities_or_areas: areas,
      industries: targets.industries,
      subcategories: targets.subcategories,
      decision_maker_roles: form.roles,
      inclusion_keywords: splitCsv(form.inclusion),
      exclusion_keywords: splitCsv(form.exclusion),
    };
    const payload = {
      campaign,
      source_count: sourceCount,
      lead_count: form.leadCount,
      discovery: {
        // Every configured provider is always used.
        providers,
        // Discovery stops once it has found the businesses to check.
        oversampling_factor: 1,
        max_queries: plannedQueries,
        results_per_query: form.resultsPerQuery,
        max_pages_per_query: form.pagesPerQuery,
        enrichment_batch_size: form.batchSize,
        enrichment_concurrency: form.concurrency,
        find_decision_makers: form.findDecisionMakers,
        search_for_emails: form.searchForEmails,
      },
      // Leads are not saved automatically: a person reviews them and sends
      // them with "Export to Lead Hub".
      persist_to_database: runCfg.persist_to_database,
    };
    setStarting(true);
    try {
      const { job_id } = await callApi<{ job_id: string }>("lead", "v2/sourcing-jobs", payload);
      beginJob({ id: job_id, name, target: form.leadCount, shape });
      requestAnimationFrame(() => runArea.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      set({ runError: `Could not start the run: ${(e as Error).message}` });
    } finally {
      setStarting(false);
    }
  }

  const results = s.results;
  const selectedCount = s.selected.filter(Boolean).length;

  // Sends the given leads (by row) to the Lead Hub, after the user confirms.
  async function exportToHub(rows: number[]) {
    if (!results) return;
    if (!rows.length) {
      setExportNotice({ kind: "warning", text: "Select at least one lead to export." });
      return;
    }
    if (!results.summary) {
      setExportNotice({ kind: "error", text: "This run has no run summary, so it can't be exported." });
      return;
    }
    if (!window.confirm(`Export ${rows.length} lead(s) to the Lead Hub?`)) return;
    setExportNotice(null);
    setExporting(true);
    try {
      const { message } = await callApi<{ sent: number; message: string }>("lead", "export-to-lead-hub", {
        campaign: results.campaign,
        run_summary: results.summary,
        leads: rows.map((i) => results.leads[i]),
      });
      set((st) => ({
        exported: st.exported.map((v, i) => v || rows.includes(i)),
        selected: st.selected.map((v, i) => v && !rows.includes(i)),
      }));
      setExportNotice({ kind: "success", text: message || `Exported ${rows.length} lead(s) to the Lead Hub.` });
    } catch (e) {
      setExportNotice({ kind: "error", text: `Export to the Lead Hub failed: ${(e as Error).message}` });
    } finally {
      setExporting(false);
    }
  }

  const elapsed = s.job ? Math.max(0, (now - s.job.startedAt) / 1000) : 0;

  return (
    <>
      {header}
      {warning && <div className="mb-5"><Alert kind="warning">{warning}</Alert></div>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <StepCard n={1} icon={MapPin} title="Where" subtitle="The area to search. Leave cities empty to cover the whole state.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Country" options={geography.countries} value={form.country} onChange={(country) =>
                setForm({
                  country,
                  state: country === "United States"
                    ? (geography.us_states.includes(form.state) ? form.state : geography.default_state)
                    : "",
                  selectedAreas: [],
                })
              } />
              {isUS ? (
                <Select label="State" options={geography.us_states} value={form.state}
                  onChange={(state) => setForm({ state, selectedAreas: [] })} />
              ) : (
                <TextInput label="State / province / region" value={form.state}
                  onChange={(state) => setForm({ state, selectedAreas: [] })} />
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {isUS && (
                <MultiSelect label="Cities" options={suggestedCities} selected={form.selectedAreas}
                  placeholder={`All of ${form.state}`} emptyText="No suggested cities for this state."
                  onChange={(selectedAreas) => setForm({ selectedAreas })} />
              )}
              <TextInput label={isUS ? "Other cities or ZIP codes" : "Other cities or postal codes"} placeholder={otherAreasHint}
                value={form.customAreas} onChange={(v) => setForm({ customAreas: v })} />
            </div>
          </StepCard>

          <StepCard n={2} icon={Target} title="Who" subtitle="The kind of business, and who you want to reach there.">
            <div className="space-y-4">
              <MultiSelect label="Industries" options={targeting.industry_suggestions} selected={form.industries}
                placeholder="Pick one or more industries" onChange={(industries) => {
                  // Keep only specialties that still belong to a chosen industry.
                  const allowed = new Set(industries.flatMap((i) => specialtyMap[i] ?? []));
                  setForm({ industries, specialties: form.specialties.filter((sp) => allowed.has(sp)) });
                }} />
              <div className="grid gap-4 sm:grid-cols-2">
                <MultiSelect label="Specialty (optional)" options={specialtyOptions} selected={form.specialties}
                  placeholder="Any — e.g. Indian restaurants" emptyText="No suggestions for these industries; type one."
                  onChange={(specialties) => setForm({ specialties })} />
                <TextInput label="Other specialties" value={form.customSpecialties}
                  placeholder={form.industries.length === 1 ? "e.g. Afghan, Ethiopian" : "e.g. Afghan restaurants"}
                  onChange={(v) => setForm({ customSpecialties: v })} />
              </div>
              {targets.subcategories.length > 0 && (
                <p className="-mt-1 text-xs text-muted">
                  Searching only for: <span className="font-semibold text-navy">{searchedFor.join(", ")}</span>
                </p>
              )}
              <MultiSelect label="Decision-maker roles" options={targeting.role_suggestions} selected={form.roles}
                placeholder="Any role" onChange={(roles) => setForm({ roles })} />
              <Expander title="Refine with keywords (optional)">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Include keywords" placeholder="independent, locally owned"
                    value={form.inclusion} onChange={(v) => setForm({ inclusion: v })} />
                  <TextInput label="Exclude keywords" placeholder="permanently closed, franchise corporate office"
                    value={form.exclusion} onChange={(v) => setForm({ exclusion: v })} />
                </div>
              </Expander>
            </div>
          </StepCard>

          <StepCard n={3} icon={Gauge} title="How many" subtitle="How many qualified leads you want, and how widely to search for them.">
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-navy">Qualified leads</span>
                  <span className="font-display text-3xl font-bold tabular-nums text-navy">{form.leadCount}</span>
                </div>
                <input type="range" min={runCfg.lead_count.min} max={runCfg.lead_count.max} value={form.leadCount}
                  aria-label="Qualified leads" onChange={(e) => setForm({ leadCount: Number(e.target.value) })}
                  className="w-full accent-accent" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEAD_PRESETS.filter((n) => n <= runCfg.lead_count.max).map((n) => (
                    <button key={n} type="button" onClick={() => setForm({ leadCount: n })} aria-pressed={form.leadCount === n}
                      className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors ${
                        form.leadCount === n ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40"}`}>
                      {n} leads
                    </button>
                  ))}
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-navy">Search depth</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(DEPTHS) as Depth[]).map((d) => {
                    const on = form.depth === d;
                    return (
                      <button key={d} type="button" aria-pressed={on}
                        onClick={() => setForm({ depth: d, pagesPerQuery: DEPTHS[d].pages, sourceOverride: null })}
                        className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                          on ? "border-accent bg-accent/5" : "border-line bg-white hover:border-navy/30"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-navy">{DEPTHS[d].label}</span>
                          <span className={`size-3.5 rounded-full border-2 ${on ? "border-accent bg-accent" : "border-line"}`} />
                        </div>
                        <p className="mt-1 text-xs text-muted">{DEPTHS[d].what}</p>
                        <p className="mt-2 text-xs font-semibold text-navy">
                          Checks ~{clamp(Math.ceil(form.leadCount * DEPTHS[d].factor), runCfg.source_count.min, runCfg.source_count.max)} businesses
                        </p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="divide-y divide-line rounded-lg border border-line bg-canvas">
                <div className="px-4 py-3">
                  <Checkbox label="Find decision makers (owner, founder, manager)" checked={form.findDecisionMakers}
                    onChange={(findDecisionMakers) => setForm({ findDecisionMakers })} />
                  <p className="mt-1 pl-6.5 text-xs text-muted">
                    Reads each business’s team page and searches the web (free) for its owner or managers. Turn off for faster runs that return business contacts only.
                  </p>
                </div>
                <div className="px-4 py-3">
                  <Checkbox label="Search the web for emails" checked={form.searchForEmails}
                    onChange={(searchForEmails) => setForm({ searchForEmails })} />
                  <p className="mt-1 pl-6.5 text-xs text-muted">
                    Each website and its contact pages are always checked for an email. When none is there, this adds
                    one web search for addresses at the business&apos;s domain.
                  </p>
                </div>
              </div>

              <Expander title="Advanced settings">
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Slider label="Businesses to check" min={runCfg.source_count.min} max={runCfg.source_count.max}
                      value={sourceCount} onChange={(v) => setForm({ sourceOverride: v })}
                      hint="More gives better choice but takes longer and costs more." />
                    {form.sourceOverride !== null && (
                      <button type="button" onClick={() => setForm({ sourceOverride: null })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ocean hover:underline">
                        <RotateCcw className="size-3" /> Back to automatic ({autoSources})
                      </button>
                    )}
                  </div>
                  <Slider label="Parallel batches" min={runCfg.enrichment_concurrency.min} max={runCfg.enrichment_concurrency.max}
                    value={form.concurrency} onChange={(v) => setForm({ concurrency: v })}
                    hint="Batches researched at once. Higher is faster, until the AI provider's rate limit." />
                  <Slider label="Businesses per batch" min={runCfg.enrichment_batch_size.min} max={runCfg.enrichment_batch_size.max}
                    value={form.batchSize} onChange={(v) => setForm({ batchSize: v })}
                    hint="Businesses qualified together in one AI step." />
                  <Slider label="Results per search" min={runCfg.results_per_query.min} max={runCfg.results_per_query.max}
                    value={form.resultsPerQuery} onChange={(v) => setForm({ resultsPerQuery: v })}
                    hint="Listings read from each search result page." />
                  <Slider label="Pages per search" min={runCfg.max_pages_per_query.min} max={runCfg.max_pages_per_query.max}
                    value={form.pagesPerQuery} onChange={(v) => setForm({ pagesPerQuery: v })}
                    hint="Result pages read for each search." />
                </div>
              </Expander>
            </div>
          </StepCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <div className="border-b border-line px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Your run</p>
              <h2 className="mt-1 text-lg font-bold leading-snug">{name}</h2>
            </div>
            <dl className="space-y-2 px-5 py-4 text-sm">
              <SummaryRow label="Area" value={areas.length ? `${areas.length} ${areas.length === 1 ? "city" : "cities"}, ${region}` : `All of ${region || "—"}`} />
              <SummaryRow label="Industries" value={form.industries.length || "—"} />
              {targets.subcategories.length > 0 && <SummaryRow label="Specialties" value={targets.subcategories.length} />}
              <SummaryRow label="Qualified leads" value={form.leadCount} />
              <SummaryRow label="Businesses to check" value={sourceCount} />
              <SummaryRow label="Decision makers" value={form.findDecisionMakers ? "Yes" : "No"} />
              <SummaryRow label="Email web search" value={form.searchForEmails ? "Yes" : "No"} />
            </dl>
            <div className="grid grid-cols-2 gap-px border-y border-line bg-line">
              <EstimateTile icon={Clock} label="Est. time" value={`~${formatDuration(estimate.seconds)}`} />
              <EstimateTile icon={Coins} label="Est. cost" value={`~${formatUsd(estimate.cost)}`}
                hint={`~${formatUsd(estimate.cost / Math.max(form.leadCount, 1))} per lead`} />
            </div>
            <div className="space-y-3 px-5 py-4">
              <Button variant="primary" icon={Play} block loading={starting} disabled={!!missing || running} onClick={startRun}>
                {running ? `Running… ${clock(elapsed)}` : `Find ${form.leadCount} leads`}
              </Button>
              <p className="text-center text-xs text-muted">
                {missing
                  ? `Choose ${missing} to start.`
                  : estimate.fromHistory
                    ? `Estimate based on your last ${estimate.fromHistory} run${estimate.fromHistory === 1 ? "" : "s"}.`
                    : "Typical estimate; it adapts after your first run."}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div ref={runArea} className="scroll-mt-6 space-y-5 pt-8">
        {s.runError && <Alert kind="error">{s.runError}</Alert>}

        {s.job && (
          s.live
            ? <RunProgress job={s.live} campaignName={s.job.name} elapsed={elapsed} target={s.job.target}
                stopping={!!(s.job.stopping || s.live.stop_requested)} onStop={stopRun} />
            : <RunProgress job={{ job_id: s.job.id, status: "running", stage: "starting", progress: {}, elapsed_seconds: 0,
                usage: {} as Usage, error: null }} campaignName={s.job.name} elapsed={elapsed} target={s.job.target}
                stopping={!!s.job.stopping} onStop={stopRun} />
        )}

        {!s.job && results && (
          <>
            <RunSummaryBanner leads={results.leads} seconds={results.seconds} usage={results.usage} target={results.target}
              stopped={results.stopped} />
            {results.leads.length > 0 ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Review leads</h2>
                    <p className="text-sm text-muted">Nothing is saved until you export. Tick the leads you approve.</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-3">
                    <Button icon={Download} onClick={() => downloadText(
                      `${results.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_leads.csv`,
                      toCsv(results.leads), "text/csv",
                    )}>
                      CSV
                    </Button>
                    <Button icon={DatabaseZap} disabled={exporting} onClick={() => exportToHub(results.leads.map((_, i) => i))}>
                      Export all {results.leads.length}
                    </Button>
                    <Button variant="primary" icon={DatabaseZap} loading={exporting} disabled={!selectedCount}
                      onClick={() => exportToHub(s.selected.flatMap((v, i) => (v ? [i] : [])))}>
                      Export to Lead Hub ({selectedCount})
                    </Button>
                  </div>
                </div>
                {exportNotice && <Alert kind={exportNotice.kind}>{exportNotice.text}</Alert>}
                <LeadTable leads={results.leads} selected={s.selected} exported={s.exported}
                  onSelectedChange={(selected) => set({ selected })} />
              </>
            ) : (
              <Alert kind="warning">
                {results.stopped ? "The run was stopped before any lead was qualified. " : ""}No qualified leads this time. Try more cities or industries, a deeper search, or fewer keyword exclusions.
              </Alert>
            )}
            <RunDetails summary={results.summary} sources={results.leadSources} usage={results.usage} leads={results.leads} />
          </>
        )}
      </div>
    </>
  );
}

function StepCard({ n, icon: Icon, title, subtitle, children }: {
  n: number;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-start gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm font-bold text-white">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="size-4 text-accent" aria-hidden />{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}

function EstimateTile({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-canvas px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <Icon className="size-3.5" aria-hidden />{label}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums text-navy">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
