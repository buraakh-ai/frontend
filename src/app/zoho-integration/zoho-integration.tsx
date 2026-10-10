"use client";

import { useEffect, useState } from "react";
import { ListPlus, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, Select, TextInput } from "@/components/ui";

/** GET /zoho/crm/v8/Leads record: a CRM Lead or Contact (same keys for both, null when empty). */
type CrmRecord = {
  id: string;
  Module: "Leads" | "Contacts";
  Full_Name: string | null;
  First_Name: string | null;
  Last_Name: string | null;
  Email: string | null;
  Phone: string | null;
  Mobile: string | null;
  Company: string | null;
  City: string | null;
  Lead_Source: string | null;
  Lead_Status: string | null;
  Created_Time: string | null;
};
type LeadsResponse = { data: CrmRecord[]; info: { count: number; more_records: boolean } };
type CampaignList = { list_id: string; list_name: string | null };
/** POST /zoho/lists/members response. */
type MembersResponse = {
  list_key: string | null;
  list_name: string | null;
  results: { email: string; status: string; error?: string | null }[];
  total: number;
  succeeded: number;
  failed: number;
};
type Notice = { kind: "success" | "error" | "warning"; text: string };

const NEW_LIST = "__new__";
// The backend accepts at most this many emails per /zoho/lists/members request.
const MEMBERS_BATCH_SIZE = 200;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
const emailOf = (r: CrmRecord) => r.Email?.trim() ?? "";

// Kept for the life of the tab, so loaded records survive switching modules.
const store = createStore({
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The range the shown records were fetched for (the inputs may since have changed).
  loaded: null as { from: string; to: string; records: CrmRecord[] } | null,
  // Which loaded records to add (by row); every one with an email starts ticked.
  selected: [] as boolean[],
  lists: null as CampaignList[] | null,
  listChoice: "",
  newListName: "",
  result: null as MembersResponse | null,
});

export function ZohoIntegration() {
  const [s, set] = store.useStore();
  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Why "Add to list" can't run yet; shown beside the button.
  const [hint, setHint] = useState<string | null>(null);
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

  async function getRecords() {
    setNotice(null);
    setHint(null);
    setLoading(true);
    try {
      const query = new URLSearchParams({ created_from: s.from, created_to: s.to });
      const { data } = await callApi<LeadsResponse>("zoho", `zoho/crm/v8/Leads?${query}`);
      set({ loaded: { from: s.from, to: s.to, records: data }, selected: data.map((r) => Boolean(emailOf(r))), result: null });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not get leads from Zoho CRM: ${(e as Error).message}` });
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
  const records = s.loaded?.records ?? [];
  // A Campaigns list member is an email address, so records without one are skipped.
  const selectedEmails = [...new Set(records.filter((r, i) => s.selected[i] && emailOf(r)).map(emailOf))];
  const withoutEmail = records.filter((r) => !emailOf(r)).length;

  async function addToList() {
    // Say what's missing rather than leaving the button disabled with no reason.
    const missing = !selectedEmails.length
      ? "Select at least one lead with an email."
      : !s.listChoice
        ? "Choose a Zoho Campaigns list (or \"+ Create a new list\") first."
        : !listTarget
          ? "Enter a name for the new list first."
          : null;
    setHint(missing);
    if (missing || !listTarget) return;
    if (!window.confirm(`Add ${selectedEmails.length} email(s) to the Zoho Campaigns ${listLabel}?`)) return;
    setNotice(null);
    setAdding(true);
    // Batches go one after another; a new list is created by the first batch
    // and later batches find it again by name.
    const result: MembersResponse = { list_key: null, list_name: null, results: [], total: 0, succeeded: 0, failed: 0 };
    try {
      for (let start = 0; start < selectedEmails.length; start += MEMBERS_BATCH_SIZE) {
        const batch = await callApi<MembersResponse>("zoho", "zoho/lists/members", {
          emails: selectedEmails.slice(start, start + MEMBERS_BATCH_SIZE),
          ...listTarget,
        });
        result.list_key = batch.list_key;
        result.list_name = batch.list_name;
        result.results.push(...batch.results);
        result.total += batch.total;
        result.succeeded += batch.succeeded;
        result.failed += batch.failed;
      }
      set({ result });
      const list = result.list_name ? `"${result.list_name}"` : "the list";
      setNotice(
        result.failed
          ? { kind: "warning", text: `Added ${result.succeeded} of ${result.total} email(s) to ${list}; ${result.failed} failed. See details below.` }
          : { kind: "success", text: `Added all ${result.total} email(s) to ${list}.` },
      );
    } catch (e) {
      set({ result: result.total ? result : null });
      const done = result.total ? ` (${result.total} of ${selectedEmails.length} email(s) were processed before the error.)` : "";
      setNotice({ kind: "error", text: `Adding to the Zoho Campaigns list failed: ${(e as Error).message}${done}` });
    } finally {
      setAdding(false);
      // A newly created list should now be selectable.
      if (creatingList) void fetchLists();
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
        title="Zoho Campaigns Sync"
        subtitle="Get the leads and contacts created in Zoho CRM for a date range, review them, and add their emails to a Zoho Campaigns list."
      />

      <Card title="Created in Zoho CRM" subtitle="Leads and Contacts by their Zoho CRM created date.">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextInput label="From date" type="date" value={s.from} max={s.to} onChange={(v) => set({ from: v })} />
          <TextInput label="To date" type="date" value={s.to} min={s.from} onChange={(v) => set({ to: v })} />
          <Button variant="primary" icon={Search} loading={loading} disabled={rangeInvalid || adding} onClick={getRecords}>
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
        <Card title="Leads and contacts">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Metric label="Found in Zoho CRM" value={records.length} />
              <Metric label="Leads / Contacts"
                value={`${records.filter((r) => r.Module === "Leads").length} / ${records.filter((r) => r.Module === "Contacts").length}`} />
              <Metric label="Emails selected" value={selectedEmails.length} />
              <Metric label="Date range" value={`${s.loaded.from} – ${s.loaded.to}`} />
            </div>

            {records.length ? (
              <>
                {withoutEmail > 0 && (
                  <Alert kind="warning">
                    {withoutEmail} record(s) have no email, so they can&rsquo;t be added to a Campaigns list.
                  </Alert>
                )}
                <Checkbox
                  label={`Select all ${records.length - withoutEmail} with an email`}
                  checked={selectedEmails.length > 0 && records.every((r, i) => !emailOf(r) || s.selected[i])}
                  onChange={(v) => set({ selected: records.map((r) => v && Boolean(emailOf(r))) })}
                />
                <DataTable
                  rows={records.map((r) => ({
                    name: r.Full_Name || [r.First_Name, r.Last_Name].filter(Boolean).join(" "),
                    email: r.Email ?? "",
                    phone: r.Phone || r.Mobile || "",
                    company: r.Company ?? "",
                    type: r.Module === "Leads" ? "Lead" : "Contact",
                    source: r.Lead_Source ?? "",
                    created: (r.Created_Time ?? "").slice(0, 16).replace("T", " "),
                  }))}
                  columns={["name", "email", "phone", "company", "type", "source", "created"]}
                  selected={s.selected}
                  onSelectedChange={(selected) => set({ selected })}
                />
              </>
            ) : (
              <Alert>No leads or contacts were created in Zoho CRM in this date range.</Alert>
            )}

            {s.result && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Emails sent" value={s.result.total} />
                  <Metric label="Added" value={s.result.succeeded} />
                  <Metric label="Failed" value={s.result.failed} />
                </div>
                <DataTable
                  rows={s.result.results.map((r) => ({ email: r.email, status: r.status, error: r.error ?? "" }))}
                />
              </>
            )}

            {records.length > 0 && (
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
                      placeholder="e.g. Leads October 2026"
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
                  {hint && <Alert kind="warning">{hint}</Alert>}
                  <Button variant="primary" icon={ListPlus} loading={adding} disabled={loading} onClick={addToList}>
                    Add {selectedEmails.length} to list
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Alert>Pick a date range and click &ldquo;Get leads&rdquo; to review the Zoho CRM leads here.</Alert>
      )}
    </div>
  );
}
