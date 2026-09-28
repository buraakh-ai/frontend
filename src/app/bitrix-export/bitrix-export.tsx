"use client";

import { useEffect, useState } from "react";
import { CloudUpload, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, Select, TextInput } from "@/components/ui";

type BitrixForm = { id: number; name: string };
type Contact = { email: string | null; first_name: string | null; last_name: string | null; phone: string | null };
type BitrixLead = { id: number; createdTime: string | null; contact: Contact };
type LeadsResponse = { count: number; items: BitrixLead[] };
type Lead = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created: string;
  bitrix_lead_id: number;
};
type CampaignList = { list_id: string; list_name: string | null };
type Stage = { status: string; error?: string | null; message?: string };
type ExportResult = { email: string | null; status: string; error: string | null; lead: Stage; campaigns: Stage };
type ExportResponse = { results: ExportResult[]; total: number; succeeded: number; failed: number };
type Notice = { kind: "success" | "error" | "warning"; text: string };

const NEW_LIST = "__new__";
// The Zoho export backend accepts at most this many records per /zoho/export request.
const EXPORT_BATCH_SIZE = 200;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

// Zoho CRM needs an email and a last name; leads without them start unchecked.
const exportable = (l: Lead) => Boolean(l.email && l.last_name);

const toLead = ({ id, createdTime, contact }: BitrixLead): Lead => ({
  email: contact.email ?? "",
  first_name: contact.first_name ?? "",
  last_name: contact.last_name ?? "",
  phone: contact.phone ?? "",
  // Bitrix returns the portal's local time, e.g. 2026-09-06T22:43:48+03:00.
  created: createdTime?.slice(0, 16).replace("T", " ") ?? "",
  bitrix_lead_id: id,
});

// Kept for the life of the tab, so loaded leads survive switching modules.
const store = createStore({
  forms: null as BitrixForm[] | null,
  formId: "",
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The form and range the shown leads were fetched for (the inputs may since have changed).
  loaded: null as { form: string; from: string; to: string; leads: Lead[] } | null,
  // Which loaded leads to export (by row).
  selected: [] as boolean[],
  lists: null as CampaignList[] | null,
  listChoice: "",
  newListName: "",
  exportResult: null as ExportResponse | null,
});

const stageText = (s: Stage) => (s.error ? `${s.status}: ${s.error}` : s.status);

export function BitrixExport() {
  const [s, set] = store.useStore();
  const [loading, setLoading] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Why "Export to Zoho" can't run yet; shown beside the button.
  const [exportHint, setExportHint] = useState<string | null>(null);
  const rangeInvalid = !s.from || !s.to || s.to < s.from;
  const formName = (id: string) => s.forms?.find((f) => String(f.id) === id)?.name ?? id;

  const fetchForms = () =>
    callApi<{ items: BitrixForm[] }>("bitrix", "forms").then(
      ({ items }) => set({ forms: items }),
      (e: Error) => setNotice({ kind: "error", text: `Could not load Bitrix forms: ${e.message}` }),
    );

  const fetchLists = () =>
    callApi<CampaignList[]>("zoho", "zoho/lists").then(
      (lists) => set({ lists }),
      (e: Error) => setNotice({ kind: "error", text: `Could not load Zoho Campaigns lists: ${e.message}` }),
    );

  async function loadForms() {
    setLoadingForms(true);
    await fetchForms();
    setLoadingForms(false);
  }

  async function loadLists() {
    setLoadingLists(true);
    await fetchLists();
    setLoadingLists(false);
  }

  // Populate the form and list selectors once per tab.
  useEffect(() => {
    if (store.get().forms === null) void fetchForms();
    if (store.get().lists === null) void fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getLeads() {
    setNotice(null);
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: s.from, date_to: s.to, contact_details: "true" });
      if (s.formId) query.set("form_id", s.formId);
      const { items } = await callApi<LeadsResponse>("bitrix", `leads?${query}`);
      const leads = items.map(toLead);
      set({
        loaded: { form: s.formId ? formName(s.formId) : "All forms", from: s.from, to: s.to, leads },
        selected: leads.map(exportable),
        exportResult: null,
      });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not get leads from Bitrix: ${(e as Error).message}` });
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
  const selectedLeads = s.loaded?.leads.filter((_, i) => s.selected[i]) ?? [];
  const unexportable = s.loaded?.leads.filter((l) => !exportable(l)).length ?? 0;

  async function exportToZoho() {
    // Say what's missing rather than leaving the button disabled with no reason.
    const missing = !selectedLeads.length
      ? "Select at least one lead to export."
      : !s.listChoice
        ? "Choose a Zoho Campaigns list (or \"+ Create a new list\") before exporting."
        : !listTarget
          ? "Enter a name for the new list before exporting."
          : null;
    setExportHint(missing);
    if (missing || !listTarget) return;
    const records = selectedLeads.map(({ email, first_name, last_name }) => ({ email, first_name, last_name }));
    if (!window.confirm(`Export ${records.length} lead(s) to Zoho CRM and the Campaigns ${listLabel}?`)) return;
    setNotice(null);
    setExporting(true);
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
      }
      set({ exportResult: result });
      setNotice(
        result.failed
          ? { kind: "warning", text: `Exported ${result.succeeded} of ${result.total} lead(s); ${result.failed} failed. See details below.` }
          : { kind: "success", text: `Exported all ${result.total} lead(s) to Zoho.` },
      );
    } catch (e) {
      set({ exportResult: result.total ? result : null });
      const done = result.total ? ` (${result.total} of ${records.length} lead(s) were processed before the error.)` : "";
      setNotice({ kind: "error", text: `Export to Zoho failed: ${(e as Error).message}${done}` });
    } finally {
      setExporting(false);
      // A newly created list should now be selectable.
      if (creatingList) void fetchLists();
    }
  }

  const formOptions = ["", ...(s.forms ?? []).map((f) => String(f.id))];
  const formatForm = (id: string) => (id === "" ? (s.forms ? "All forms" : "Loading forms…") : formName(id));

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
        title="Bitrix Export"
        subtitle="Get leads submitted through a Bitrix24 CRM form for a date range, review them, and export them to Zoho CRM and a Zoho Campaigns list."
      />

      <Card title="Bitrix form and date range">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select label="Form name" value={s.formId} options={formOptions} format={formatForm} onChange={(v) => set({ formId: v })} />
            <Button icon={RefreshCw} loading={loadingForms} onClick={loadForms}>
              Refresh forms
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <TextInput label="From date" type="date" value={s.from} max={s.to} onChange={(v) => set({ from: v })} />
            <TextInput label="To date" type="date" value={s.to} min={s.from} onChange={(v) => set({ to: v })} />
            <Button variant="primary" icon={Search} loading={loading} disabled={rangeInvalid || exporting} onClick={getLeads}>
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
              <Metric label="Form" value={s.loaded.form} />
              <Metric label="Leads found" value={s.loaded.leads.length} />
              <Metric label="Selected to export" value={selectedLeads.length} />
              <Metric label="Date range" value={`${s.loaded.from} – ${s.loaded.to}`} />
            </div>

            {s.loaded.leads.length ? (
              <>
                {unexportable > 0 && (
                  <Alert kind="warning">
                    {unexportable} lead(s) have no email or last name, which Zoho CRM requires, so they are not selected.
                  </Alert>
                )}
                <Checkbox
                  label={`Select all ${s.loaded.leads.length} leads`}
                  checked={selectedLeads.length === s.loaded.leads.length}
                  onChange={(v) => set({ selected: s.loaded!.leads.map(() => v) })}
                />
                <DataTable
                  rows={s.loaded.leads}
                  columns={["email", "first_name", "last_name", "phone", "created", "bitrix_lead_id"]}
                  selected={s.selected}
                  onSelectedChange={(selected) => set({ selected })}
                />
              </>
            ) : (
              <Alert>No leads were submitted through this form in this date range.</Alert>
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
                      placeholder="e.g. Bitrix newsletter leads September 2026"
                      onChange={(v) => set({ newListName: v })}
                    />
                  ) : (
                    <div />
                  )}
                  <Button icon={RefreshCw} loading={loadingLists} onClick={loadLists}>
                    Refresh lists
                  </Button>
                </div>
                <div className="flex flex-col items-end gap-3">
                  {exportHint && <Alert kind="warning">{exportHint}</Alert>}
                  <Button variant="primary" icon={CloudUpload} loading={exporting} disabled={loading} onClick={exportToZoho}>
                    Export {selectedLeads.length} to Zoho
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Alert>Pick a form and a date range, then click &ldquo;Get leads&rdquo; to review them here.</Alert>
      )}
    </div>
  );
}
