"use client";

import { useEffect, useState } from "react";
import { CloudUpload, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, DataTable, Metric, PageHeader, Select, TextInput } from "@/components/ui";

type Lead = Record<string, unknown>;
type CampaignList = { list_id: string; list_name: string | null };
type Stage = { status: string; error?: string | null; message?: string };
type ExportResult = {
  email: string | null;
  status: string;
  error: string | null;
  lead: Stage;
  contact: Stage;
  campaigns: Stage;
};
type ExportResponse = { results: ExportResult[]; total: number; succeeded: number; failed: number };
type Notice = { kind: "success" | "error" | "warning"; text: string };

const NEW_LIST = "__new__";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

// Kept for the life of the tab, so loaded leads survive switching modules.
const store = createStore({
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The range the shown leads were fetched for (the inputs may since have changed).
  loaded: null as { from: string; to: string; leads: Lead[] } | null,
  lists: null as CampaignList[] | null,
  listChoice: "",
  newListName: "",
  exportResult: null as ExportResponse | null,
});

const stageText = (s: Stage) => (s.error ? `${s.status}: ${s.error}` : s.status);

export function ZohoIntegration() {
  const [s, set] = store.useStore();
  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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
    setLoading(true);
    try {
      const query = new URLSearchParams({ start_date: s.from, end_date: s.to });
      const leads = await callApi<Lead[]>("zoho", `records?${query}`);
      set({ loaded: { from: s.from, to: s.to, leads }, exportResult: null });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not get leads: ${(e as Error).message}` });
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

  async function exportToZoho() {
    if (!s.loaded || !listTarget) return;
    const { leads } = s.loaded;
    if (!window.confirm(`Export ${leads.length} lead(s) to Zoho CRM and the Campaigns ${listLabel}?`)) return;
    setNotice(null);
    setExporting(true);
    try {
      const result = await callApi<ExportResponse>("zoho", "zoho/export", { records: leads, ...listTarget });
      set({ exportResult: result });
      setNotice(
        result.failed
          ? { kind: "warning", text: `Exported ${result.succeeded} of ${result.total} lead(s); ${result.failed} failed. See details below.` }
          : { kind: "success", text: `Exported all ${result.total} lead(s) to Zoho.` },
      );
      // A newly created list should now be selectable.
      if (creatingList) void fetchLists();
    } catch (e) {
      setNotice({ kind: "error", text: `Export to Zoho failed: ${(e as Error).message}` });
    } finally {
      setExporting(false);
    }
  }

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
        title="Export Leads to Zoho"
        subtitle="Get leads saved in the database for a date range, review them, and export them to Zoho CRM and a Zoho Campaigns list."
      />

      <Card title="Lead date range">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextInput label="From date" type="date" value={s.from} max={s.to} onChange={(v) => set({ from: v })} />
          <TextInput label="To date" type="date" value={s.to} min={s.from} onChange={(v) => set({ to: v })} />
          <Button variant="primary" icon={Search} loading={loading} disabled={rangeInvalid || exporting} onClick={getLeads}>
            Get leads
          </Button>
        </div>
        {s.from && s.to && s.to < s.from && (
          <div className="mt-4">
            <Alert kind="warning">&ldquo;To date&rdquo; must be on or after &ldquo;From date&rdquo;.</Alert>
          </div>
        )}
      </Card>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {s.loaded ? (
        <Card title="Leads">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Metric label="Leads found" value={s.loaded.leads.length} />
              <Metric label="Date range" value={`${s.loaded.from} – ${s.loaded.to}`} />
            </div>

            {s.loaded.leads.length ? (
              <DataTable rows={s.loaded.leads} />
            ) : (
              <Alert>No leads were saved in this date range.</Alert>
            )}

            {s.exportResult && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Exported" value={s.exportResult.total} />
                  <Metric label="Succeeded" value={s.exportResult.succeeded} />
                  <Metric label="Failed" value={s.exportResult.failed} />
                </div>
                <DataTable
                  rows={s.exportResult.results.map((r) => ({
                    email: r.email ?? "",
                    status: r.status,
                    lead: stageText(r.lead),
                    contact: stageText(r.contact),
                    campaigns: stageText(r.campaigns),
                    error: r.error ?? "",
                  }))}
                />
              </>
            )}

            {s.loaded.leads.length > 0 && (
              <div className="space-y-4 border-t border-line pt-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Select
                    label="Zoho Campaigns list"
                    value={s.listChoice}
                    options={listOptions}
                    format={formatList}
                    onChange={(v) => set({ listChoice: v })}
                  />
                  {creatingList ? (
                    <TextInput
                      label="New list name"
                      value={s.newListName}
                      placeholder="e.g. Leads September 2026"
                      onChange={(v) => set({ newListName: v })}
                    />
                  ) : (
                    <div />
                  )}
                  <Button icon={RefreshCw} loading={loadingLists} onClick={loadLists}>
                    Refresh lists
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    icon={CloudUpload}
                    loading={exporting}
                    disabled={!listTarget || loading}
                    onClick={exportToZoho}
                  >
                    Export to Zoho
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Alert>Pick a date range and click &ldquo;Get leads&rdquo; to review them here.</Alert>
      )}
    </div>
  );
}
