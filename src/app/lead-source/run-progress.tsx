"use client";

import { Building2, Check, Loader2, Mail, Phone, Radar, ScanSearch, Sparkles, Square, UserRound } from "lucide-react";
import { Button } from "@/components/ui";
import { clock, formatCount, formatUsd, num, searchCalls, text, type Row, type Usage } from "./format";

/** GET /v2/sourcing-jobs/{id} while the run is in progress. A stopped run
 * ends as "cancelled", with a result holding the leads found so far. */
export type JobStatus = {
  job_id: string;
  status: "running" | "succeeded" | "cancelled" | "failed";
  stage: "starting" | "discovering" | "enriching" | "finishing" | "done";
  progress: Row;
  elapsed_seconds: number;
  usage: Usage;
  error: string | null;
  stop_requested?: boolean;
  leads?: Row[];
  result?: Row;
};

const STEPS = [
  { id: "discovering", label: "Discover", icon: Radar, what: "Searching Google, the web and directories" },
  { id: "enriching", label: "Enrich", icon: ScanSearch, what: "Reading websites for contacts and owners" },
  { id: "finishing", label: "Qualify", icon: Sparkles, what: "Scoring and removing duplicates" },
] as const;

/** 0–100: discovery fills the first fifth, enrichment most of the rest. */
function percent(job: JobStatus): number {
  const p = job.progress;
  if (job.stage === "starting") return 2;
  if (job.stage === "discovering") {
    const found = num(p.unique_candidates) / Math.max(num(p.candidate_target), 1);
    const queries = num(p.queries_executed) / Math.max(num(p.queries_planned), 1);
    return 2 + 18 * Math.min(1, Math.max(found, queries));
  }
  if (job.stage === "enriching") {
    const researched = num(p.sources_researched) / Math.max(num(p.sources_total), 1);
    const leads = num(p.leads_found) / Math.max(num(p.lead_target), 1);
    return 20 + 75 * Math.min(1, Math.max(researched * 0.9, leads));
  }
  return 97;
}

export function RunProgress({ job, campaignName, elapsed, target, stopping, onStop }: {
  job: JobStatus;
  campaignName: string;
  elapsed: number;
  target: number;
  stopping: boolean;
  onStop: () => void;
}) {
  const p = job.progress;
  const active = STEPS.findIndex((s) => s.id === job.stage);
  const pct = Math.round(percent(job));
  const leads = job.leads ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm" aria-live="polite">
      <div className="bg-navy px-6 py-5 text-white md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
              {stopping ? "Stopping — keeping the leads found so far" : "Finding leads"}
            </p>
            <h2 className="mt-1 truncate text-xl font-bold text-white md:text-2xl">{campaignName}</h2>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="font-display text-3xl font-bold tabular-nums">{clock(elapsed)}</div>
              <div className="text-xs text-white/60">elapsed</div>
            </div>
            <Button icon={Square} loading={stopping} disabled={stopping} onClick={onStop}
              title="Stop searching. Leads found so far are kept; no further searches or AI calls are made.">
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((step, i) => {
            const done = active > i || (active === -1 && job.stage !== "starting");
            const current = active === i;
            const Icon = step.icon;
            return (
              <li key={step.id} className={`flex items-start gap-2.5 ${done || current ? "text-white" : "text-white/45"}`}>
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-success" : current ? "bg-accent" : "bg-white/10"}`}>
                  {done ? <Check className="size-3.5" strokeWidth={3} />
                    : current ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step.label}</span>
                  <span className="hidden text-xs text-white/60 sm:block">{step.what}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        <Counter label="Businesses found" value={num(p.unique_candidates)} />
        <Counter label="Businesses checked"
          value={p.sources_total ? `${num(p.sources_researched)} / ${num(p.sources_total)}` : "—"} />
        <Counter label="Qualified leads" value={`${num(p.leads_found)} / ${num(p.lead_target) || target}`} accent />
        <Counter label="Cost so far" value={formatUsd(num(job.usage?.total_cost_usd))}
          hint={`${formatCount(num(job.usage?.total_tokens))} AI tokens · ${searchCalls(job.usage ?? ({} as Usage))} search calls`} />
      </div>

      <div className="px-6 py-5 md:px-8">
        <div className="mb-3 text-sm font-semibold text-navy">
          {leads.length ? "Latest leads" : "Leads will appear here as they are qualified…"}
        </div>
        {leads.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leads.slice(0, 6).map((lead, i) => <LeadChip key={`${text(lead.business_name ?? lead.name)}-${i}`} lead={lead} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

function Counter({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${accent ? "text-accent" : "text-navy"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function LeadChip({ lead }: { lead: Row }) {
  return (
    <li className="animate-[fadein_.5s_ease-out] rounded-lg border border-line bg-canvas px-4 py-3">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 shrink-0 text-ocean" aria-hidden />
        <span className="truncate text-sm font-semibold text-navy">{text(lead.business_name || lead.name)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {!!lead.city && <span>{text(lead.city)}</span>}
        {!!lead.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />Phone</span>}
        {!!lead.business_email && <span className="inline-flex items-center gap-1"><Mail className="size-3" />Email</span>}
        {!!lead.decision_maker_name && (
          <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{text(lead.decision_maker_name)}</span>
        )}
      </div>
    </li>
  );
}
