"use client";

import { useEffect, useState } from "react";
import { CloudUpload, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, Select, TextInput } from "@/components/ui";

/** GET /leads?from&to item from the Lead Hub (a row of its v_campaign_contact view). */
type HubLead = {
  source_code: string;
  lead_id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  city: string | null;
  country: string | null;
  zoho_sync_status: string | null;
  zoho_contact_id: string | null;
  ingested_at: string;
};
type CampaignList = { list_id: string; list_name: string | null };
type Stage = { status: string; error?: string | null };
type ExportResult = { email: string | null; status: string; error: string | null; lead: Stage; campaigns: Stage };
type ExportResponse = { results: ExportResult[]; total: number; succeeded: number; failed: number };
type Notice = { kind: "success" | "error" | "warning"; text: string };

// The Lead Hub's source codes (its lead_source table).
const SOURCES: Record<string, string> = {
  WEB_SCRAPING: "Lead Finder",
  BITRIX24: "Bitrix24",
  ZOOM_WEBINAR: "Zoom webinar",
};
const ALL = "";
const NEW_LIST = "__new__";
// The Zoho export backend accepts at most this many records per /zoho/export request.
const EXPORT_BATCH_SIZE = 200;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
const sourceLabel = (s: string) => SOURCES[s] ?? s;
const stageText = (s: Stage) => (s.error ? `${s.status}: ${s.error}` : s.status);

// Zoho CRM needs an email and a last name; other leads can't be synced.
const syncable = (l: HubLead) => Boolean(l.email?.trim() && l.last_name?.trim());
const alreadySynced = (l: HubLead) => l.zoho_sync_status === "synced";

// Kept for the life of the tab, so loaded leads survive switching modules.
const store = createStore({
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The range the shown leads were fetched for (the inputs may since have changed).
  loaded: null as { from: string; to: string; leads: HubLead[] } | null,
  // Show only leads from this source ("" = all).
  source: ALL,
  // Which loaded leads to sync (by row of `loaded.leads`).
  selected: [] as boolean[],
  // Emails synced to Zoho in this tab.
  synced: [] as string[],
  lists: null as CampaignList[] | null,
  listChoice: "",
  newListName: "",
  syncResult: null as ExportResponse | null,
});

export function LeadHub({ hubConnected }: { hubConnected: boolean }) {
  const [s, set] = store.useStore();
  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Why a sync can't run yet; shown beside the buttons.
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const rangeInvalid = !s.from || !s.to || s.to < s.from;

  const fetchLists = () =>
    callApi<CampaignList[]>("zoho", "zoho/lists").then(
      (lists) => set({ lists }),
      (e: Error) => setNotice({ kind: "error", text: `Could not load Zoho Campaigns lists: ${e.message}` }),
    );

  async function loadLists() {
    setLoadingLists(true);
    await fetchLists();
    setLoadingLists(false);
  }

  // Populate the list selector once per tab.
  useEffect(() => {
    if (store.get().lists === null) void fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getLeads() {
    setNotice(null);
    setSyncHint(null);
    setLoading(true);
    try {
      const query = new URLSearchParams({ from: s.from, to: s.to });
      const items = await callApi<HubLead[]>("hub", `leads?${query}`);
      set({
        loaded: { from: s.from, to: s.to, leads: items },
        source: ALL,
        selected: items.map((l) => syncable(l) && !alreadySynced(l) && !store.get().synced.includes(l.email!.trim())),
        syncResult: null,
      });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not get leads from the Lead Hub: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  const creatingList = s.listChoice === NEW_LIST;
  const listTarget = creatingList
    ? s.newListName.trim() && { list_name: s.newListName.trim() }
    : s.listChoice && { list_key: s.listChoice };
  const listLabel = creatingList
    ? `new list "${s.newListName.trim()}"`
    : `list "${s.lists?.find((l) => l.list_id === s.listChoice)?.list_name ?? s.listChoice}"`;
  const leads = s.loaded?.leads ?? [];
  // Leads per source, most first.
  const sourceCounts = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.source_code]: (acc[l.source_code] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  // Rows of `leads` shown under the current source filter.
  const visible = leads.flatMap((l, i) => (s.source === ALL || l.source_code === s.source ? [i] : []));
  const selectedLeads = visible.filter((i) => s.selected[i]).map((i) => leads[i]);
  const syncableLeads = visible.map((i) => leads[i]).filter(syncable);
  const unsyncable = visible.length - syncableLeads.length;

  // Syncs the given leads (the ticked ones, or every syncable one) to Zoho CRM
  // and the chosen Campaigns list, through the Zoho export backend.
  async function syncToZoho(leads: HubLead[]) {
    // Say what's missing rather than leaving the buttons disabled with no reason.
    const missing = !leads.length
      ? "Select at least one lead to sync."
      : !s.listChoice
        ? "Choose a Zoho Campaigns list (or \"+ Create a new list\") before syncing."
        : !listTarget
          ? "Enter a name for the new list before syncing."
          : null;
    setSyncHint(missing);
    if (missing || !listTarget) return;
    if (!window.confirm(`Sync ${leads.length} lead(s) to Zoho CRM and the Campaigns ${listLabel}?`)) return;
    const records = leads.map((l) => ({ email: l.email ?? "", first_name: l.first_name ?? "", last_name: l.last_name ?? "" }));
    setNotice(null);
    setSyncing(true);
    // Send batches one after another; a new list is created by the first batch
    // and later batches find it again by name.
    const result: ExportResponse = { results: [], total: 0, succeeded: 0, failed: 0 };
    try {
      for (let start = 0; start < records.length; start += EXPORT_BATCH_SIZE) {
        const batch = await callApi<ExportResponse>("zoho", "zoho/export", {
          records: records.slice(start, start + EXPORT_BATCH_SIZE),
          ...listTarget,
        });
        result.results.push(...batch.results);
        result.total += batch.total;
        result.succeeded += batch.succeeded;
        result.failed += batch.failed;
        const done = batch.results.filter((r) => r.status === "success" && r.email).map((r) => r.email!.trim());
        set((st) => ({
          synced: [...st.synced, ...done],
          selected: st.selected.map((v, i) => v && !done.includes(st.loaded!.leads[i].email?.trim() ?? "")),
        }));
      }
      set({ syncResult: result });
      setNotice(
        result.failed
          ? { kind: "warning", text: `Synced ${result.succeeded} of ${result.total} lead(s); ${result.failed} failed. See details below.` }
          : { kind: "success", text: `Synced all ${result.total} lead(s) to Zoho.` },
      );
    } catch (e) {
      set({ syncResult: result.total ? result : null });
      const done = result.total ? ` (${result.total} of ${records.length} lead(s) were processed before the error.)` : "";
      setNotice({ kind: "error", text: `Sync to Zoho failed: ${(e as Error).message}${done}` });
    } finally {
      setSyncing(false);
      // A newly created list should now be selectable.
      if (creatingList) void fetchLists();
    }
  }

  const sourceOptions = [ALL, ...sourceCounts.map(([c]) => c)];
  const formatSource = (c: string) =>
    c === ALL ? `All sources (${leads.length})` : `${sourceLabel(c)} (${sourceCounts.find(([k]) => k === c)?.[1] ?? 0})`;
  const listOptions = ["", ...(s.lists ?? []).map((l) => l.list_id), NEW_LIST];
  const formatList = (id: string) =>
    id === ""
      ? "Choose a list…"
      : id === NEW_LIST
        ? "+ Create a new list"
        : (s.lists?.find((l) => l.list_id === id)?.list_name ?? id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Hub"
        subtitle="Review the leads every source has landed in the Lead Hub, then sync the ones you choose to Zoho CRM and a Zoho Campaigns list."
      />

      {!hubConnected && (
        <Alert kind="warning">
          The Lead Hub isn&rsquo;t connected yet (LEAD_HUB_BACKEND_URL is not set), so leads can&rsquo;t be loaded. This page
          works as soon as the Lead Hub backend is deployed.
        </Alert>
      )}

      <Card title="Date range" subtitle="When the leads landed in the Lead Hub (UTC).">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <TextInput label="From date" type="date" value={s.from} max={s.to} onChange={(v) => set({ from: v })} />
            <TextInput label="To date" type="date" value={s.to} min={s.from} onChange={(v) => set({ to: v })} />
            <Button variant="primary" icon={Search} loading={loading} disabled={!hubConnected || rangeInvalid || syncing}
              onClick={getLeads}>
              Get leads
            </Button>
          </div>
          {s.from && s.to && s.to < s.from && (
            <Alert kind="warning">&ldquo;To date&rdquo; must be on or after &ldquo;From date&rdquo;.</Alert>
          )}
        </div>
      </Card>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {s.loaded ? (
        <Card title="Leads">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Metric label="Leads found" value={leads.length} />
              <Metric label="Already in Zoho" value={leads.filter(alreadySynced).length} />
              <Metric label="Selected to sync" value={selectedLeads.length} />
              <Metric label="Date range" value={`${s.loaded.from} – ${s.loaded.to}`} />
            </div>

            {leads.length ? (
              <>
                <div className="max-w-sm">
                  <Select label="Source" value={s.source} options={sourceOptions} format={formatSource}
                    onChange={(source) => set({ source })} />
                </div>
                {unsyncable > 0 && (
                  <Alert kind="warning">
                    {unsyncable} lead(s) have no email or last name, which Zoho CRM requires, so they can&rsquo;t be synced.
                  </Alert>
                )}
                <Checkbox
                  label={`Select all ${visible.length} leads`}
                  checked={visible.length > 0 && selectedLeads.length === visible.length}
                  onChange={(v) => set((st) => ({ selected: st.selected.map((x, i) => (visible.includes(i) ? v : x)) }))}
                />
                <DataTable
                  rows={visible.map((i) => {
                    const l = leads[i];
                    return {
                      name: [l.first_name, l.last_name].filter(Boolean).join(" "),
                      email: l.email ?? "",
                      phone: l.phone ?? "",
                      company: l.company ?? "",
                      job_title: l.job_title ?? "",
                      source: sourceLabel(l.source_code),
                      landed: l.ingested_at.slice(0, 16).replace("T", " "),
                      // Synced in this tab, else what the Lead Hub has recorded.
                      zoho: s.synced.includes(l.email?.trim() ?? "") ? "synced" : (l.zoho_sync_status ?? ""),
                    };
                  })}
                  columns={["name", "email", "phone", "company", "job_title", "source", "landed", "zoho"]}
                  selected={visible.map((i) => s.selected[i])}
                  onSelectedChange={(shown) =>
                    set((st) => ({ selected: st.selected.map((x, i) => (visible.includes(i) ? shown[visible.indexOf(i)] : x)) }))}
                />
              </>
            ) : (
              <Alert>No leads landed in the Lead Hub in this date range.</Alert>
            )}

            {s.syncResult && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Synced" value={s.syncResult.total} />
                  <Metric label="Succeeded" value={s.syncResult.succeeded} />
                  <Metric label="Failed" value={s.syncResult.failed} />
                </div>
                <DataTable
                  rows={s.syncResult.results.map((r) => ({
                    email: r.email ?? "",
                    status: r.status,
                    lead: stageText(r.lead),
                    campaigns: stageText(r.campaigns),
                    error: r.error ?? "",
                  }))}
                />
              </>
            )}

            {visible.length > 0 && (
              <div className="space-y-4 border-t border-line pt-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Select label="Zoho Campaigns list" value={s.listChoice} options={listOptions} format={formatList}
                    onChange={(v) => set({ listChoice: v })} />
                  {creatingList ? (
                    <TextInput label="New list name" value={s.newListName} placeholder="e.g. Lead Hub leads October 2026"
                      onChange={(v) => set({ newListName: v })} />
                  ) : (
                    <div />
                  )}
                  <Button icon={RefreshCw} loading={loadingLists} onClick={loadLists}>
                    Refresh lists
                  </Button>
                </div>
                <div className="flex flex-col items-end gap-3">
                  {syncHint && <Alert kind="warning">{syncHint}</Alert>}
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button icon={CloudUpload} disabled={loading || syncing || !syncableLeads.length}
                      onClick={() => syncToZoho(syncableLeads)}>
                      Sync all {syncableLeads.length} to Zoho
                    </Button>
                    <Button variant="primary" icon={CloudUpload} loading={syncing} disabled={loading}
                      onClick={() => syncToZoho(selectedLeads)}>
                      Sync selected ({selectedLeads.length}) to Zoho
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        hubConnected && <Alert>Pick a date range, then click &ldquo;Get leads&rdquo; to review them here.</Alert>
      )}
    </div>
  );
}
