"use client";

import { useState } from "react";
import { DatabaseZap, Download, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, Select, TextInput, downloadText,
} from "@/components/ui";

type Contact = { email: string | null; first_name: string | null; last_name: string | null; phone: string | null };
// GET /getBitrixLeads item (with contact_details=true). Only id is guaranteed.
// Sent back unchanged to /exportToLeadHub, which maps it for the Lead Hub.
type BitrixLead = {
  id: number;
  createdTime?: string | null;
  contact?: Contact | null;
  name?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  stageId?: string | null;
  category?: string | null;
  category_type?: string | null;
  [field: string]: unknown;
};
type LeadsResponse = { count: number; categories?: Record<string, number>; items: BitrixLead[] };
type ExportResponse = { sent: number; items: { lead_id: number; bitrix_lead_id: number }[] };
type Notice = { kind: "success" | "error" | "warning"; text: string };

const ALL = "";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
const clean = (v: string | null | undefined) => v?.trim() || null;

// The same fallbacks the backend applies when it sends a lead to the Lead Hub.
const firstName = (l: BitrixLead) => clean(l.name) ?? clean(l.contact?.first_name);
const lastName = (l: BitrixLead) => clean(l.lastName) ?? clean(l.contact?.last_name);
const email = (l: BitrixLead) => clean(l.email) ?? clean(l.contact?.email);
const phone = (l: BitrixLead) => clean(l.phone) ?? clean(l.contact?.phone);
// A lead nobody can contact isn't selected by default (it can still be ticked).
const reachable = (l: BitrixLead) => Boolean(email(l) || phone(l));

// Kept for the life of the tab, so loaded leads survive switching modules.
const store = createStore({
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The range the shown leads were fetched for (the inputs may since have changed).
  loaded: null as { from: string; to: string; leads: BitrixLead[] } | null,
  // Show only leads of this category ("" = all).
  category: ALL,
  // Which loaded leads to export (by row of `loaded.leads`).
  selected: [] as boolean[],
  // Bitrix lead ids already exported to the Lead Hub in this tab.
  exported: [] as number[],
});

export function BitrixExport() {
  const [s, set] = store.useStore();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const rangeInvalid = !s.from || !s.to || s.to < s.from;

  async function getLeads() {
    setNotice(null);
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: s.from, date_to: s.to, contact_details: "true" });
      const { items } = await callApi<LeadsResponse>("bitrix", `getBitrixLeads?${query}`);
      set({
        loaded: { from: s.from, to: s.to, leads: items },
        category: ALL,
        selected: items.map((l) => reachable(l) && !store.get().exported.includes(l.id)),
      });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not get leads from Bitrix: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  const leads = s.loaded?.leads ?? [];
  // Category counts, most leads first.
  const categories = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      const c = l.category ?? "Uncategorized";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  // Rows of `leads` shown under the current category filter.
  const visible = leads.flatMap((l, i) => (s.category === ALL || (l.category ?? "Uncategorized") === s.category ? [i] : []));
  const selectedRows = visible.filter((i) => s.selected[i]);
  const unreachable = visible.filter((i) => !reachable(leads[i])).length;

  // Sends the given leads (by row) to the Lead Hub, after the user confirms.
  async function exportToHub(rows: number[]) {
    if (!rows.length) {
      setNotice({ kind: "warning", text: "Select at least one lead to export." });
      return;
    }
    if (!window.confirm(`Export ${rows.length} lead(s) to the Lead Hub?`)) return;
    setNotice(null);
    setExporting(true);
    try {
      const { sent } = await callApi<ExportResponse>("bitrix", "exportToLeadHub", { leads: rows.map((i) => leads[i]) });
      const ids = rows.map((i) => leads[i].id);
      set((st) => ({
        exported: [...st.exported, ...ids],
        selected: st.selected.map((v, i) => v && !rows.includes(i)),
      }));
      setNotice({ kind: "success", text: `Exported ${sent} lead(s) to the Lead Hub. Exporting a lead again updates it rather than duplicating it.` });
    } catch (e) {
      setNotice({ kind: "error", text: `Export to the Lead Hub failed: ${(e as Error).message}` });
    } finally {
      setExporting(false);
    }
  }

  function downloadSelected() {
    const name = `bitrix-leads_${s.loaded!.from}_${s.loaded!.to}.json`;
    downloadText(name, JSON.stringify({ leads: selectedRows.map((i) => leads[i]) }, null, 2), "application/json");
  }

  const categoryOptions = [ALL, ...categories.map(([c]) => c)];
  const formatCategory = (c: string) =>
    c === ALL ? `All categories (${leads.length})` : `${c} (${categories.find(([k]) => k === c)?.[1] ?? 0})`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bitrix24 Export"
        subtitle="Get the leads created in Bitrix24 CRM for a date range, review them, and export the ones you approve to the Lead Hub."
      />

      <Card title="Date range">
        <div className="space-y-4">
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
              <Metric label="Leads found" value={leads.length} />
              <Metric label="Categories" value={categories.length} />
              <Metric label="Selected to export" value={selectedRows.length} />
              <Metric label="Date range" value={`${s.loaded.from} – ${s.loaded.to}`} />
            </div>

            {leads.length ? (
              <>
                <div className="max-w-sm">
                  <Select label="Category" value={s.category} options={categoryOptions} format={formatCategory}
                    onChange={(category) => set({ category })} />
                </div>
                {unreachable > 0 && (
                  <Alert kind="warning">
                    {unreachable} lead(s) have no email or phone, so they are not selected. You can still tick them.
                  </Alert>
                )}
                <Checkbox
                  label={`Select all ${visible.length} leads`}
                  checked={visible.length > 0 && selectedRows.length === visible.length}
                  onChange={(v) => set((st) => ({ selected: st.selected.map((x, i) => (visible.includes(i) ? v : x)) }))}
                />
                <DataTable
                  rows={visible.map((i) => {
                    const l = leads[i];
                    return {
                      name: [firstName(l), lastName(l)].filter(Boolean).join(" ") || clean(l.title) || "",
                      email: email(l) ?? "",
                      phone: phone(l) ?? "",
                      category: l.category ?? "",
                      stage: l.stageId ?? "",
                      // Bitrix returns the portal's local time, e.g. 2026-09-06T22:43:48+03:00.
                      created: l.createdTime?.slice(0, 16).replace("T", " ") ?? "",
                      bitrix_lead_id: l.id,
                      lead_hub: s.exported.includes(l.id) ? "Exported" : "",
                    };
                  })}
                  columns={["name", "email", "phone", "category", "stage", "created", "bitrix_lead_id", "lead_hub"]}
                  selected={visible.map((i) => s.selected[i])}
                  onSelectedChange={(shown) =>
                    set((st) => ({ selected: st.selected.map((x, i) => (visible.includes(i) ? shown[visible.indexOf(i)] : x)) }))}
                />
              </>
            ) : (
              <Alert>No leads were created in Bitrix24 in this date range.</Alert>
            )}

            {visible.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">
                  Leads are not saved until you export them. Review them, then export the ones you approve to the Lead Hub.
                </p>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <Button icon={Download} disabled={!selectedRows.length} onClick={downloadSelected}>
                    Download JSON
                  </Button>
                  <Button icon={DatabaseZap} disabled={loading || exporting} onClick={() => exportToHub(visible)}>
                    Export all {visible.length}
                  </Button>
                  <Button variant="primary" icon={DatabaseZap} loading={exporting}
                    disabled={loading || !selectedRows.length}
                    onClick={() => exportToHub(selectedRows)}>
                    Export to Lead Hub ({selectedRows.length})
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Alert>Pick a date range, then click &ldquo;Get leads&rdquo; to review them here.</Alert>
      )}
    </div>
  );
}
