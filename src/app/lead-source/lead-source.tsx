"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Play } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import type { LeadConfig } from "@/lib/server/lead-config";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Card, DataTable, Expander, JsonView, Metric, MultiSelect, PageHeader, Select, Slider, Tabs,
  TextInput, downloadText,
} from "@/components/ui";

type Row = Record<string, unknown>;
type RunSummary = Row & {
  run_id: string;
  duration_seconds: number;
  sources_discovered: number;
  leads_returned: number;
  database_saved: boolean;
  database_message: string;
  discovery_metrics?: Row & {
    raw_candidates: number;
    unique_candidates: number;
    sources_selected: number;
    queries_executed: number;
    queries_planned: number;
    sources_attempted?: number;
    enrichment_batches?: number;
    provider_counts?: Row;
    rejection_counts?: Row;
    provider_errors?: unknown;
    exhausted_before_target?: boolean;
  };
};
type TabId = "targeting" | "sources" | "leads" | "handoff";

// Fine-tuning sliders for the discovery pipeline, with a one-line explanation each.
const DISCOVERY_CONTROLS = [
  ["oversampling_factor", "Candidate coverage",
    "Gathers this many raw candidates per business needed, so weak matches can be filtered out."],
  ["max_queries", "Maximum discovery queries", "Upper limit on searches across all industry × city × source combinations."],
  ["results_per_query", "Results per query", "Listings read from each search result page."],
  ["max_pages_per_query", "Pages per query", "Result pages read for each search."],
  ["enrichment_batch_size", "Enrichment batch size", "Businesses researched together in one AI enrichment step."],
] as const;
type DiscoveryKey = (typeof DISCOVERY_CONTROLS)[number][0];

// What happens after "Run lead sourcing", in order.
const PIPELINE_STEPS = [
  ["Discover", "Searches every source (Google Places, public web, Yellow Pages, chambers of commerce and more) for businesses matching your industries and locations."],
  ["Enrich", "Visits each business's public pages to collect phone, email, website and decision-maker details."],
  ["Qualify", "Verifies and scores each business, drops duplicates and poor matches, and keeps the best leads."],
  ["Save", "Stores the run, sources and leads in AWS PostgreSQL, ready for export to Zoho."],
] as const;

const today = () => new Date().toISOString().slice(0, 10);
const splitCsv = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
const unique = (xs: string[]) => [...new Set(xs)];
// crypto.randomUUID only exists on HTTPS/localhost; getRandomValues works on plain HTTP too.
const newId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );
// Mirrors Python truthiness: an empty dict/list/string counts as "nothing".
const hasContent = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : !!v;

function initialForm(config: LeadConfig) {
  const run = config.run_controls;
  return {
    country: config.geography.default_country,
    state: config.geography.default_state,
    selectedAreas: [] as string[],
    customAreas: "",
    industries: [...config.targeting.default_industries],
    roles: [...config.targeting.default_roles],
    inclusion: "",
    exclusion: "",
    sourceCount: run.source_count.default,
    leadCount: run.lead_count.default,
    discovery: Object.fromEntries(DISCOVERY_CONTROLS.map(([k]) => [k, run[k].default])) as Record<DiscoveryKey, number>,
  };
}
type Form = ReturnType<typeof initialForm>;

const store = createStore({
  form: null as Form | null,
  tab: "targeting" as TabId,
  // Name of the campaign the shown results came from (for the CSV filename).
  resultName: "",
  leadSources: [] as Row[],
  leads: [] as Row[],
  runSummary: null as RunSummary | null,
});

/** e.g. "Restaurants & Retail – Irvine, California" */
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
  // BOM so Excel opens it as UTF-8 (the Streamlit app used utf-8-sig).
  return "﻿" + [fields.join(","), ...rows.map((r) => fields.map((f) => esc(r[f])).join(","))].join("\r\n");
}

function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start.current) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

export function LeadSource({ config, warning }: { config: LeadConfig; warning: string | null }) {
  const [s, set] = store.useStore();
  const [running, setRunning] = useState(false);
  const [runNotice, setRunNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const elapsed = useElapsed(running);

  useEffect(() => {
    if (!store.get().form) store.set({ form: initialForm(config) });
  }, [config]);
  if (!s.form) return <PageHeader title={config.app.title} subtitle={config.app.caption} />;

  const form = s.form;
  const setForm = (patch: Partial<Form>) => set((st) => ({ form: { ...st.form!, ...patch } }));
  const { geography, targeting, run_controls: runCfg } = config;
  const isUS = form.country === "United States";
  const suggestedCities = isUS ? ((geography.state_areas as Record<string, string[]>)[form.state] ?? []) : [];

  const areas = unique([...form.selectedAreas, ...splitCsv(form.customAreas)]);
  const region = form.state || form.country;

  async function runCampaign() {
    setRunNotice(null);
    const name = campaignName(form.industries, areas, region);
    const payload = {
      campaign: {
        campaign_id: newId(),
        campaign_name: name,
        campaign_status: "active",
        period_start: today(),
        period_end: today(),
        country: form.country,
        state: form.state,
        geography: [...areas, form.state, form.country].filter(Boolean).join(", "),
        cities_or_areas: areas,
        industries: form.industries,
        subcategories: [],
        decision_maker_roles: form.roles,
        inclusion_keywords: splitCsv(form.inclusion),
        exclusion_keywords: splitCsv(form.exclusion),
      },
      source_count: form.sourceCount,
      lead_count: form.leadCount,
      // Every configured provider is always used, and results are always saved.
      discovery: { providers: Object.values(runCfg.provider_labels), ...form.discovery },
      persist_to_database: runCfg.persist_to_database,
    };
    setRunning(true);
    try {
      const result = await callApi<{ lead_sources: Row[]; leads: Row[]; run_summary: RunSummary }>(
        "lead", "v2/run-sourcing-campaign", payload,
      );
      // The backend isn't ours to change, so tolerate missing/renamed fields
      // rather than crashing the page.
      set({
        resultName: name,
        leadSources: Array.isArray(result?.lead_sources) ? result.lead_sources : [],
        leads: Array.isArray(result?.leads) ? result.leads : [],
        runSummary: result?.run_summary && typeof result.run_summary === "object" ? result.run_summary : null,
      });
      setRunNotice({ kind: "success", text: "Sourcing run completed." });
    } catch (e) {
      setRunNotice({ kind: "error", text: `Sourcing run failed: ${(e as Error).message}` });
    } finally {
      setRunning(false);
    }
  }

  const summary = s.runSummary;
  const discovery = summary?.discovery_metrics;
  const missing = !form.industries.length ? "an industry" : !form.state && !areas.length ? "a state or city" : null;

  return (
    <>
      <PageHeader title={config.app.title} subtitle={config.app.caption} />
      {warning && <div className="mb-5"><Alert kind="warning">{warning}</Alert></div>}

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Geography">
            <div className="space-y-4">
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
              {isUS && (
                <MultiSelect label="Suggested cities" options={suggestedCities} selected={form.selectedAreas}
                  placeholder={`All of ${form.state} — or pick cities`} emptyText="No suggested cities for this state."
                  onChange={(selectedAreas) => setForm({ selectedAreas })} />
              )}
              <TextInput label="Other cities or ZIP codes" placeholder="Tustin, 92780"
                value={form.customAreas} onChange={(v) => setForm({ customAreas: v })} />
            </div>
          </Card>

          <Card title="Business targeting">
            <div className="space-y-4">
              <MultiSelect label="Industries" options={targeting.industry_suggestions} selected={form.industries}
                placeholder="Pick one or more industries" onChange={(industries) => setForm({ industries })} />
              <MultiSelect label="Decision-maker roles" options={targeting.role_suggestions} selected={form.roles}
                placeholder="Any role" onChange={(roles) => setForm({ roles })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Include keywords" placeholder="independent, locally owned"
                  value={form.inclusion} onChange={(v) => setForm({ inclusion: v })} />
                <TextInput label="Exclude keywords" placeholder="permanently closed, franchise corporate office"
                  value={form.exclusion} onChange={(v) => setForm({ exclusion: v })} />
              </div>
            </div>
          </Card>
        </div>

        <Card title="Run controls" subtitle="Each run goes through four steps:">
          <div className="space-y-5">
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STEPS.map(([step, what], i) => (
                <li key={step} className="rounded-lg border border-line bg-canvas p-3">
                  <div className="text-sm font-semibold text-navy">{i + 1}. {step}</div>
                  <p className="mt-1 text-xs text-muted">{what}</p>
                </li>
              ))}
            </ol>
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <Slider label="Businesses to discover" min={runCfg.source_count.min} max={runCfg.source_count.max}
                value={form.sourceCount} onChange={(v) => setForm({ sourceCount: v })}
                hint="Businesses to find and enrich. More gives better choice but takes longer." />
              <Slider label="Qualified leads to return" min={runCfg.lead_count.min} max={runCfg.lead_count.max}
                value={form.leadCount} onChange={(v) => setForm({ leadCount: v })}
                hint="The best-scoring businesses returned and saved as leads." />
            </div>
            <Expander title="Advanced discovery settings">
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                {DISCOVERY_CONTROLS.map(([key, label, hint]) => (
                  <Slider key={key} label={label} hint={hint} min={runCfg[key].min} max={runCfg[key].max}
                    value={form.discovery[key]}
                    onChange={(v) => setForm({ discovery: { ...form.discovery, [key]: v } })} />
                ))}
              </div>
            </Expander>
            <Button variant="primary" icon={Play} block loading={running} disabled={!!missing} onClick={runCampaign}>
              {running
                ? `Running lead sourcing… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : "Run lead sourcing"}
            </Button>
            {missing && <p className="text-center text-xs text-muted">Choose {missing} to run lead sourcing.</p>}
            {running && (
              <p className="text-center text-xs text-muted">Large runs can take several minutes. Keep this tab open.</p>
            )}
            {runNotice && <Alert kind={runNotice.kind}>{runNotice.text}</Alert>}
          </div>
        </Card>

        <div>
          <Tabs
            tabs={[
              { id: "targeting", label: "1 · Targeting" },
              { id: "sources", label: "2 · Source discovery" },
              { id: "leads", label: "3 · Qualified leads" },
              { id: "handoff", label: "4 · Database handoff" },
            ]}
            active={s.tab}
            onChange={(tab) => set({ tab })}
          />

          {s.tab === "targeting" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{campaignName(form.industries, areas, region)}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="State / region" value={region || "—"} />
                <Metric label="Cities" value={areas.length || "All"} />
                <Metric label="Industries" value={form.industries.length} />
                <Metric label="Roles" value={form.roles.length || "Any"} />
              </div>
            </div>
          )}

          {s.tab === "sources" && (
            s.leadSources.length ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Sources discovered" value={s.leadSources.length} />
                  <Metric label="Verified" value={s.leadSources.filter((x) => x.verification_status === "verified").length} />
                  <Metric label="With phone" value={s.leadSources.filter((x) => !!x.public_phone).length} />
                </div>
                <DataTable rows={s.leadSources} />
              </div>
            ) : (
              <Alert>Run lead sourcing to discover public business sources.</Alert>
            )
          )}

          {s.tab === "leads" && (
            s.leads.length ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Leads returned" value={s.leads.length} />
                  <Metric label="Business emails" value={s.leads.filter((x) => !!x.business_email).length} />
                  <Metric label="Decision makers" value={s.leads.filter((x) => !!x.decision_maker_name).length} />
                  <Metric label="Verified" value={s.leads.filter((x) => x.verification_status === "verified").length} />
                </div>
                <DataTable
                  rows={s.leads}
                  columns={["business_name", "category", "city", "state", "phone", "business_email",
                    "decision_maker_name", "decision_maker_role", "verification_status", "lead_score"]}
                />
                <Button variant="primary" icon={Download} onClick={() => downloadText(
                  `${s.resultName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_leads.csv`,
                  toCsv(s.leads), "text/csv",
                )}>
                  Download leads CSV
                </Button>
                <Expander title="Lead evidence and marketing context">
                  <div className="space-y-4 text-sm">
                    {s.leads.map((lead, i) => (
                      <div key={i}>
                        <p>
                          <strong className="text-navy">{String(lead.business_name ?? lead.name ?? "")}</strong>
                          {" — "}{String(lead.marketing_notes || "No marketing note generated.")}
                        </p>
                        <ul className="mt-1 list-disc pl-5">
                          {((lead.source_urls as string[] | undefined) ?? []).map((url) => (
                            <li key={url}>
                              <a href={url} target="_blank" rel="noreferrer" className="break-all text-ocean hover:underline">{url}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Expander>
              </div>
            ) : (
              <Alert>Qualified leads will appear after a sourcing run.</Alert>
            )
          )}

          {s.tab === "handoff" && (
            summary ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Run ID" value={String(summary.run_id ?? "—").slice(0, 8)} />
                  <Metric label="Duration" value={typeof summary.duration_seconds === "number" ? `${summary.duration_seconds.toFixed(1)}s` : "—"} />
                  <Metric label="Sources" value={summary.sources_discovered} />
                  <Metric label="Leads" value={summary.leads_returned} />
                </div>
                {discovery && (
                  <Card title="Discovery funnel"
                    subtitle={`Enrichment: ${discovery.sources_attempted ?? 0} sources across ${discovery.enrichment_batches ?? 0} batches`}>
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label="Raw candidates" value={discovery.raw_candidates} />
                        <Metric label="Unique candidates" value={discovery.unique_candidates} />
                        <Metric label="Sources selected" value={discovery.sources_selected} />
                        <Metric label="Queries" value={`${discovery.queries_executed} / ${discovery.queries_planned}`} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-1.5 text-sm font-semibold text-navy">Candidates by provider</div>
                          <JsonView value={discovery.provider_counts ?? {}} />
                        </div>
                        <div>
                          <div className="mb-1.5 text-sm font-semibold text-navy">Rejected candidates</div>
                          <JsonView value={discovery.rejection_counts ?? {}} />
                        </div>
                      </div>
                      {hasContent(discovery.provider_errors) && (
                        <Alert kind="warning">Provider errors: {JSON.stringify(discovery.provider_errors)}</Alert>
                      )}
                      {discovery.exhausted_before_target && (
                        <Alert>Configured providers were exhausted before reaching the raw candidate target.</Alert>
                      )}
                    </div>
                  </Card>
                )}
                <Alert kind={summary.database_saved ? "success" : "warning"}>{summary.database_message || (summary.database_saved ? "Saved." : "Not saved to the database.")}</Alert>
                <Expander title="Full run summary">
                  <JsonView value={summary} />
                </Expander>
              </div>
            ) : (
              <Alert>The run summary and AWS PostgreSQL handoff status will appear here.</Alert>
            )
          )}
        </div>
      </div>
    </>
  );
}
