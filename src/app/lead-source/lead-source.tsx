"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Play, Upload } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import type { LeadConfig } from "@/lib/server/lead-config";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Card, Checkbox, ChipSelect, DataTable, Expander, JsonView, Metric, PageHeader,
  SegmentedControl, Select, Slider, Tabs, TextInput, downloadText,
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
type TabId = "campaign" | "sources" | "leads" | "handoff";

const V2_CONTROLS = [
  ["oversampling_factor", "Candidate coverage"],
  ["max_queries", "Maximum discovery queries"],
  ["results_per_query", "Results per query"],
  ["max_pages_per_query", "Pages per query"],
  ["enrichment_batch_size", "Enrichment batch size"],
] as const;
type V2Key = (typeof V2_CONTROLS)[number][0];

const today = () => new Date().toISOString().slice(0, 10);
const splitCsv = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
const unique = (xs: string[]) => [...new Set(xs)];
// Mirrors Python truthiness: an empty dict/list/string counts as "nothing".
const hasContent = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : !!v;

function initialForm(config: LeadConfig) {
  const run = config.run_controls;
  return {
    campaignId: crypto.randomUUID(),
    campaignName: config.campaign.default_name,
    campaignStatus: config.campaign.default_status,
    periodStart: today(),
    periodEnd: today(),
    country: config.geography.default_country,
    state: config.geography.default_state,
    selectedAreas: [] as string[],
    customAreas: "",
    industries: [...config.targeting.default_industries],
    customIndustries: "",
    subcategories: "",
    roles: [...config.targeting.default_roles],
    customRoles: "",
    inclusion: "",
    exclusion: "",
    pipelineVersion: run.default_pipeline_version,
    sourceCount: run.source_count_v2.default,
    leadCount: run.lead_count.default,
    providers: [...run.default_providers],
    v2: Object.fromEntries(V2_CONTROLS.map(([k]) => [k, run[k].default])) as Record<V2Key, number>,
    persistToDatabase: run.persist_to_database,
  };
}
type Form = ReturnType<typeof initialForm>;

const store = createStore({
  form: null as Form | null,
  tab: "campaign" as TabId,
  leadSources: [] as Row[],
  leads: [] as Row[],
  runSummary: null as RunSummary | null,
});

/** Applies an uploaded campaign JSON (the payload's `campaign` shape). */
function formFromCampaign(config: LeadConfig, base: Form, c: Row): Form {
  const str = (k: string, fallback: string) => (typeof c[k] === "string" ? (c[k] as string) : fallback);
  const list = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : []);
  const { industry_suggestions: industryOptions, role_suggestions: roleOptions } = config.targeting;
  const industries = Array.isArray(c.industries) ? list("industries") : base.industries;
  const roles = Array.isArray(c.decision_maker_roles) ? list("decision_maker_roles") : base.roles;
  const status = str("campaign_status", base.campaignStatus);
  const country = str("country", config.geography.default_country);
  return {
    ...base,
    campaignId: str("campaign_id", crypto.randomUUID()),
    campaignName: str("campaign_name", config.campaign.default_name),
    campaignStatus: config.campaign.statuses.includes(status) ? status : config.campaign.statuses[0],
    periodStart: str("period_start", today()),
    periodEnd: str("period_end", today()),
    country: config.geography.countries.includes(country) ? country : config.geography.countries[0],
    state: str("state", base.state),
    selectedAreas: [],
    customAreas: list("cities_or_areas").join(", "),
    industries: industries.filter((x) => industryOptions.includes(x)),
    customIndustries: industries.filter((x) => !industryOptions.includes(x)).join(", "),
    subcategories: list("subcategories").join(", "),
    roles: roles.filter((x) => roleOptions.includes(x)),
    customRoles: roles.filter((x) => !roleOptions.includes(x)).join(", "),
    inclusion: list("inclusion_keywords").join(", "),
    exclusion: list("exclusion_keywords").join(", "),
  };
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

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit" });

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
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const elapsed = useElapsed(running);

  // The form needs crypto.randomUUID and today's date, so build it on the client.
  useEffect(() => {
    if (!store.get().form) store.set({ form: initialForm(config) });
  }, [config]);
  if (!s.form) return <PageHeader title={config.app.title} subtitle={config.app.caption} />;

  const form = s.form;
  const setForm = (patch: Partial<Form>) => set((st) => ({ form: { ...st.form!, ...patch } }));
  const { geography, targeting, run: runCfg } = { ...config, run: config.run_controls };
  const isV2 = form.pipelineVersion === runCfg.v2_pipeline_version;
  const sourceControl = isV2 ? runCfg.source_count_v2 : runCfg.source_count_v1;
  const sourceCount = Math.min(Math.max(form.sourceCount, sourceControl.min), sourceControl.max);
  const isUS = form.country === "United States";
  const suggestedAreas = (geography.state_areas as Record<string, string[]>)[form.state] ?? [];

  const areas = unique([...form.selectedAreas, ...splitCsv(form.customAreas)]);
  const industries = unique([...form.industries, ...splitCsv(form.customIndustries)]);
  const roles = unique([...form.roles, ...splitCsv(form.customRoles)]);
  const campaign = {
    campaign_id: form.campaignId,
    campaign_name: form.campaignName,
    campaign_status: form.campaignStatus,
    period_start: form.periodStart,
    period_end: form.periodEnd,
    country: form.country,
    state: form.state,
    geography: [...areas, form.state, form.country].join(", "),
    cities_or_areas: areas,
    industries,
    subcategories: splitCsv(form.subcategories),
    decision_maker_roles: roles,
    inclusion_keywords: splitCsv(form.inclusion),
    exclusion_keywords: splitCsv(form.exclusion),
  };
  const periodInvalid = form.periodEnd < form.periodStart;

  async function applyUpload() {
    if (!upload) return;
    try {
      const parsed: unknown = JSON.parse(await upload.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected a JSON object");
      setForm(formFromCampaign(config, form, parsed as Row));
      setUploadError(null);
    } catch (e) {
      setUploadError(`Invalid campaign file: ${(e as Error).message}`);
    }
  }

  async function runCampaign() {
    setRunNotice(null);
    if (isV2 && !form.providers.length) {
      setRunNotice({ kind: "error", text: "Sourcing run failed: Select at least one V2 discovery provider." });
      return;
    }
    const payload: Row = {
      campaign,
      source_count: sourceCount,
      lead_count: form.leadCount,
      persist_to_database: form.persistToDatabase,
    };
    if (isV2) {
      payload.discovery = {
        providers: form.providers.map((label) => (runCfg.provider_labels as Record<string, string>)[label]),
        ...form.v2,
      };
    }
    setRunning(true);
    try {
      const result = await callApi<{ lead_sources: Row[]; leads: Row[]; run_summary: RunSummary }>(
        "lead",
        isV2 ? "v2/run-sourcing-campaign" : "run-sourcing-campaign",
        payload,
      );
      // The backend isn't ours to change, so tolerate missing/renamed fields
      // rather than crashing the page.
      set({
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

  return (
    <>
      <PageHeader title={config.app.title} subtitle={config.app.caption} />
      {warning && <div className="mb-5"><Alert kind="warning">{warning}</Alert></div>}

      <div className="space-y-5">
        <Card title="Sourcing campaign">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line bg-canvas p-3 sm:flex-row sm:items-center">
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-muted">
                <Upload className="size-4 text-navy" />
                <span className="truncate">{upload ? upload.name : "Load campaign JSON"}</span>
                <input type="file" accept=".json,application/json" className="sr-only"
                  onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
              </label>
              <Button disabled={!upload} onClick={applyUpload}>Apply uploaded campaign</Button>
            </div>
            {uploadError && <Alert kind="error">{uploadError}</Alert>}
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Campaign name" value={form.campaignName} onChange={(v) => setForm({ campaignName: v })} />
              <Select label="Status" options={config.campaign.statuses} value={form.campaignStatus}
                onChange={(v) => setForm({ campaignStatus: v })} />
              <TextInput type="date" label="Start" value={form.periodStart} onChange={(v) => setForm({ periodStart: v })} />
              <TextInput type="date" label="End" value={form.periodEnd} onChange={(v) => setForm({ periodEnd: v })} />
            </div>
            {periodInvalid && <Alert kind="warning">The end date must be on or after the start date.</Alert>}
          </div>
        </Card>

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
              <ChipSelect label="Suggested counties or cities" options={suggestedAreas} selected={form.selectedAreas}
                onChange={(selectedAreas) => setForm({ selectedAreas })} />
              <TextInput label="Additional cities, counties or ZIP codes" placeholder="Irvine, Tustin, 92780"
                value={form.customAreas} onChange={(v) => setForm({ customAreas: v })} />
            </div>
          </Card>

          <Card title="Business targeting">
            <div className="space-y-4">
              <ChipSelect label="Industries" options={targeting.industry_suggestions} selected={form.industries}
                onChange={(v) => setForm({ industries: v })} />
              <TextInput label="Additional industries" placeholder="Accountants, hotels, manufacturers"
                value={form.customIndustries} onChange={(v) => setForm({ customIndustries: v })} />
              <TextInput label="Subcategories" placeholder="Independent restaurants, specialty retailers"
                value={form.subcategories} onChange={(v) => setForm({ subcategories: v })} />
              <ChipSelect label="Decision-maker roles" options={targeting.role_suggestions} selected={form.roles}
                onChange={(v) => setForm({ roles: v })} />
              <TextInput label="Additional roles" placeholder="Managing Partner, Controller"
                value={form.customRoles} onChange={(v) => setForm({ customRoles: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Include keywords" placeholder="independent, locally owned"
                  value={form.inclusion} onChange={(v) => setForm({ inclusion: v })} />
                <TextInput label="Exclude keywords" placeholder="permanently closed, franchise corporate office"
                  value={form.exclusion} onChange={(v) => setForm({ exclusion: v })} />
              </div>
            </div>
          </Card>
        </div>

        <Card title="Run controls">
          <div className="space-y-5">
            <SegmentedControl label="Pipeline version" options={runCfg.pipeline_versions} value={form.pipelineVersion}
              onChange={(pipelineVersion) => setForm({ pipelineVersion })} />
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <Slider label="Businesses to discover" min={sourceControl.min} max={sourceControl.max} value={sourceCount}
                onChange={(v) => setForm({ sourceCount: v })} />
              <Slider label="Qualified leads to return" min={runCfg.lead_count.min} max={runCfg.lead_count.max}
                value={form.leadCount} onChange={(v) => setForm({ leadCount: v })} />
              {isV2 && V2_CONTROLS.map(([key, label]) => (
                <Slider key={key} label={label} min={runCfg[key].min} max={runCfg[key].max} value={form.v2[key]}
                  onChange={(v) => setForm({ v2: { ...form.v2, [key]: v } })} />
              ))}
            </div>
            {isV2 && (
              <ChipSelect label="Discovery providers" options={Object.keys(runCfg.provider_labels)}
                selected={form.providers} onChange={(providers) => setForm({ providers })} />
            )}
            <Checkbox label="Push results to AWS PostgreSQL" checked={form.persistToDatabase}
              onChange={(persistToDatabase) => setForm({ persistToDatabase })} />
            <Button variant="primary" icon={Play} block loading={running}
              disabled={!industries.length || periodInvalid} onClick={runCampaign}>
              {running
                ? `Running public-source discovery… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : "Run lead sourcing"}
            </Button>
            {running && (
              <p className="text-center text-xs text-muted">Large runs can take several minutes. Keep this tab open.</p>
            )}
            {runNotice && <Alert kind={runNotice.kind}>{runNotice.text}</Alert>}
          </div>
        </Card>

        <div>
          <Tabs
            tabs={[
              { id: "campaign", label: "1 · Campaign" },
              { id: "sources", label: "2 · Source discovery" },
              { id: "leads", label: "3 · Qualified leads" },
              { id: "handoff", label: "4 · Database handoff" },
            ]}
            active={s.tab}
            onChange={(tab) => set({ tab })}
          />

          {s.tab === "campaign" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{form.campaignName}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Period" value={`${fmtDay(form.periodStart)} – ${fmtDay(form.periodEnd)}`} />
                <Metric label="State / region" value={form.state || "—"} />
                <Metric label="Target locations" value={areas.length} />
                <Metric label="Industries" value={industries.length} />
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
              <Alert>Run the campaign to discover public business sources.</Alert>
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
                  `${form.campaignName.toLowerCase().replaceAll(" ", "_")}_leads.csv`, toCsv(s.leads), "text/csv",
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
                  <Card title="V2 discovery funnel"
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
