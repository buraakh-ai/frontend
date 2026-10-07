"use client";

import { CheckCircle2, CircleStop, ExternalLink, Mail, Phone, UserRound } from "lucide-react";
import { Checkbox, DataTable, Expander, JsonView } from "@/components/ui";
import { formatCount, formatDuration, formatUsd, num, text, type Row, type Usage } from "./format";

/** Hero summary of a finished run: what it found, how long it took, what it cost. */
export function RunSummaryBanner({ leads, seconds, usage, target, stopped }: {
  leads: Row[];
  seconds: number;
  usage: Usage | null;
  target: number;
  stopped: boolean;
}) {
  const count = leads.length;
  const cost = num(usage?.total_cost_usd);
  const count_of = (f: (l: Row) => boolean) => leads.filter(f).length;

  return (
    <section className="overflow-hidden rounded-2xl bg-navy text-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-6 px-6 pt-6 md:px-8 md:pt-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            {stopped
              ? <><CircleStop className="size-4" aria-hidden /> Run stopped</>
              : <><CheckCircle2 className="size-4" aria-hidden /> Run complete</>}
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-4xl">
            {count} qualified lead{count === 1 ? "" : "s"}
            <span className="font-medium text-white/70"> in {formatDuration(seconds)}</span>
          </h2>
          {stopped ? (
            <p className="mt-1 text-sm text-white/60">You stopped the run; these are the leads qualified before that.</p>
          ) : count < target && (
            <p className="mt-1 text-sm text-white/60">
              {target} requested; widen the area or industries, or use a deeper search, to find more.
            </p>
          )}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 md:grid-cols-4">
        <Stat label="Total cost" value={usage ? formatUsd(cost) : "—"}
          hint={usage ? `AI ${formatUsd(num(usage.llm_cost_usd))} · search ${formatUsd(num(usage.api_cost_usd))}` : "Not reported by the backend"} />
        <Stat label="Cost per lead" value={usage && count ? formatUsd(cost / count) : "—"} />
        <Stat label="AI tokens" value={usage ? formatCount(num(usage.total_tokens)) : "—"}
          hint={usage?.model ? `${usage.model} · ${num(usage.llm_runs)} calls` : undefined} />
        <Stat label="Time per lead" value={count ? formatDuration(seconds / count) : "—"} />
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/10 md:grid-cols-4">
        <Stat label="With phone" value={count_of((l) => !!l.phone)} small />
        <Stat label="With email" value={count_of((l) => !!(l.business_email || l.personal_email))} small />
        <Stat label="Decision makers" value={count_of((l) => !!l.decision_maker_name)} small />
        <Stat label="Fully verified" value={count_of((l) => l.verification_status === "verified")} small />
      </div>
    </section>
  );
}

function Stat({ label, value, hint, small }: { label: string; value: React.ReactNode; hint?: string; small?: boolean }) {
  return (
    <div className="bg-navy px-6 py-4 md:px-8">
      <div className="text-[11px] font-bold uppercase tracking-wider text-white/55">{label}</div>
      <div className={`mt-1 font-display font-bold tabular-nums text-white ${small ? "text-xl" : "text-2xl"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-white/55">{hint}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-success/10 text-success",
  enriched: "bg-tint text-ocean",
  incomplete: "bg-canvas text-muted",
};

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-success" : score >= 45 ? "bg-ocean" : "bg-muted/50";
  return (
    <div className="flex items-center gap-2" title={`Lead score ${score} / 100`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-navy">{score}</span>
    </div>
  );
}

const link = "inline-flex items-center gap-1.5 text-ocean hover:underline";

/** Only real linkedin.com links are shown as LinkedIn. */
function linkedinUrl(lead: Row): string | null {
  for (const value of [lead.linkedin_url, lead.company_linkedin_url]) {
    const raw = text(value);
    if (!raw) continue;
    const url = raw.includes("//") ? raw : `https://${raw}`;
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return url;
    } catch {
      // not a URL
    }
  }
  return null;
}

/** The qualified leads, each with a tick box for the Lead Hub export. */
export function LeadTable({ leads, selected, exported, onSelectedChange }: {
  leads: Row[];
  selected: boolean[];
  exported: boolean[];
  onSelectedChange: (selected: boolean[]) => void;
}) {
  const all = leads.length > 0 && selected.every(Boolean);
  const toggle = (i: number, v: boolean) => onSelectedChange(leads.map((_, j) => (j === i ? v : (selected[j] ?? false))));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3">
        <Checkbox label={`Select all ${leads.length}`} checked={all} onChange={(v) => onSelectedChange(leads.map(() => v))} />
        <span className="text-xs text-muted">Every lead has a phone number or an email.</span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--color-line)]">
            <tr className="text-xs font-bold uppercase tracking-wide text-muted">
              <th className="w-10 px-4 py-2.5" aria-label="Select" />
              <th className="px-3 py-2.5">Business</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5">Decision maker</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => {
              const status = text(lead.verification_status) || "incomplete";
              const website = text(lead.website);
              const email = text(lead.business_email || lead.personal_email);
              const linkedin = linkedinUrl(lead);
              return (
                <tr key={i} className={`border-b border-line align-top last:border-0 ${selected[i] ? "bg-tint/40" : "hover:bg-canvas/60"}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected[i] ?? false} onChange={(e) => toggle(i, e.target.checked)}
                      aria-label={`Select ${text(lead.business_name || lead.name)}`}
                      className="mt-0.5 size-4 cursor-pointer rounded border-line accent-accent" />
                  </td>
                  <td className="max-w-64 px-3 py-3">
                    <div className="font-semibold text-navy">{text(lead.business_name || lead.name)}</div>
                    <div className="text-xs text-muted">
                      {[lead.category, lead.city, lead.state].filter(Boolean).map(text).join(" · ")}
                    </div>
                    {website && (
                      <a href={website} target="_blank" rel="noreferrer" className={`${link} mt-1 max-w-full truncate text-xs`}>
                        <ExternalLink className="size-3 shrink-0" />{website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {lead.phone ? <div className="flex items-center gap-1.5 text-ink"><Phone className="size-3 text-muted" />{text(lead.phone)}</div> : null}
                    {email ? <a href={`mailto:${email}`} className={`${link} mt-1`}><Mail className="size-3" />{email}</a> : null}
                    {!lead.phone && !email && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {lead.decision_maker_name ? (
                      <>
                        <div className="font-semibold text-navy">{text(lead.decision_maker_name)}</div>
                        <div className="text-muted">{text(lead.decision_maker_role)}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                    {linkedin ? (
                      <a href={linkedin} target="_blank" rel="noreferrer" className={`${link} mt-1`}>
                        <UserRound className="size-3" />LinkedIn
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-3"><ScoreBar score={num(lead.lead_score)} /></td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[status] ?? STATUS_STYLE.incomplete}`}>
                      {status}
                    </span>
                    {exported[i] && (
                      <div className="mt-1.5 text-[11px] font-semibold text-success">In Lead Hub</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Funnel, providers, cost breakdown and the raw discovered sources. */
export function RunDetails({ summary, sources, usage, leads }: { summary: Row | null; sources: Row[]; usage: Usage | null; leads: Row[] }) {
  const d = (summary?.discovery_metrics ?? {}) as Row;
  const providerCounts = (d.provider_counts ?? {}) as Record<string, number>;
  const errors = (d.provider_errors ?? {}) as Record<string, number>;
  const funnel: [string, number][] = [
    ["Search results read", num(d.raw_candidates)],
    ["Unique businesses", num(d.unique_candidates)],
    ["Businesses checked", num(d.sources_attempted)],
    ["Qualified leads", leads.length],
  ];
  const top = Math.max(...funnel.map(([, v]) => v), 1);

  return (
    <div className="space-y-3">
      <Expander title="How this run worked: funnel, sources and cost">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold text-navy">Funnel</div>
            <ul className="space-y-2.5">
              {funnel.map(([label, value]) => (
                <li key={label}>
                  <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-semibold tabular-nums text-navy">{value}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-sky" style={{ width: `${(value / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 mb-2 text-sm font-semibold text-navy">Businesses found per source</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(providerCounts).map(([p, n]) => (
                <span key={p} className="rounded-full bg-canvas px-3 py-1 text-xs text-navy">
                  {p.replaceAll("_", " ")} <strong className="tabular-nums">{n}</strong>
                </span>
              ))}
              {!Object.keys(providerCounts).length && <span className="text-xs text-muted">—</span>}
            </div>
            {Object.keys(errors).length > 0 && (
              <p className="mt-3 text-xs text-warning">
                Some searches failed: {Object.entries(errors).map(([p, n]) => `${p.replaceAll("_", " ")} (${n})`).join(", ")}.
              </p>
            )}
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold text-navy">Cost breakdown (estimated from list prices)</div>
            {usage ? (
              <dl className="divide-y divide-line rounded-lg border border-line text-sm">
                {([
                  ["AI model", usage.model ?? "—"],
                  ["AI calls", num(usage.llm_runs)],
                  ["Tokens in / out", `${formatCount(num(usage.input_tokens))} / ${formatCount(num(usage.output_tokens))}`],
                  ["AI cost", usage.llm_priced || !usage.total_tokens ? formatUsd(num(usage.llm_cost_usd)) : "No price set for this model"],
                  ["Web searches (SerpAPI)", num(usage.serpapi_searches)],
                  ["Google Places lookups", num(usage.places_text_searches) + num(usage.places_details)],
                  ["Search cost", formatUsd(num(usage.api_cost_usd))],
                  ["Total", formatUsd(num(usage.total_cost_usd))],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-semibold tabular-nums text-navy">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">The backend did not report usage for this run.</p>
            )}
          </div>
        </div>
      </Expander>
      <Expander title={`Discovered businesses (${sources.length})`}>
        <DataTable rows={sources}
          columns={["source_name", "source_type", "category", "city", "public_phone", "url", "rating", "review_count"]} />
      </Expander>
      <Expander title="Why each lead may need AGFinTax (marketing notes and evidence)">
        <div className="space-y-4 text-sm">
          {leads.map((lead, i) => (
            <div key={i}>
              <p>
                <strong className="text-navy">{text(lead.business_name ?? lead.name)}</strong>
                {" — "}{text(lead.marketing_notes) || "No marketing note generated."}
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
      {summary && (
        <Expander title="Full run summary (technical)">
          <JsonView value={summary} />
        </Expander>
      )}
    </div>
  );
}
