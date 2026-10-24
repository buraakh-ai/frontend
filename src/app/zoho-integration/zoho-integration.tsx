"use client";

import { useEffect, useState } from "react";
import { FolderPlus, ListPlus, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, SegmentedControl, Select, Tabs, TextInput,
} from "@/components/ui";
import { CloneCampaign } from "./clone-campaign";
import { CreateCampaign, type CampaignList } from "./create-campaign";

const CAMPAIGN_MODES = ["Copy an existing campaign", "New from a content URL"] as const;

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
/** POST /zoho/lists/members response. */
type MembersResponse = {
  list_key: string | null;
  list_name: string | null;
  results: { email: string; status: string; error?: string | null }[];
  total: number;
  succeeded: number;
  failed: number;
};
/** POST /zoho/lists response. */
type CreatedList = { list_key: string; list_name: string };
type Notice = { kind: "success" | "error" | "warning"; text: string };

// The backend accepts at most this many emails per /zoho/lists/members request.
const MEMBERS_BATCH_SIZE = 200;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
const emailOf = (r: CrmRecord) => r.Email?.trim() ?? "";
const looksLikeEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Kept for the life of the tab, so loaded records survive switching modules.
const store = createStore({
  // Manage lists comes first: build the list, then send a campaign to it.
  tab: "lists" as "lists" | "campaign",
  // On the campaign tab: copy a campaign (list -> clone -> send) or build one from a content URL.
  campaignMode: CAMPAIGN_MODES[0] as (typeof CAMPAIGN_MODES)[number],
  from: daysAgo(7),
  to: isoDay(new Date()),
  // The range the shown records were fetched for (the inputs may since have changed).
  loaded: null as { from: string; to: string; records: CrmRecord[] } | null,
  // Which loaded records to add (by row); every one with an email starts ticked.
  selected: [] as boolean[],
  lists: null as CampaignList[] | null,
  listsError: null as string | null,
  listChoice: "",
  // Ticked "Create a new list": the dropdown is read-only and the button
  // becomes "Create list and add contacts".
  creatingList: false,
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
      (lists) => set({ lists, listsError: null }),
      (e: Error) => {
        set({ listsError: e.message });
        setNotice({ kind: "error", text: `Could not load Zoho Campaigns lists: ${e.message}` });
      },
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

  const newListName = s.newListName.trim();
  const newListTaken = s.lists?.some((l) => (l.list_name ?? "").trim().toLowerCase() === newListName.toLowerCase());
  const records = s.loaded?.records ?? [];
  // A Campaigns list member is an email address, so records without one are skipped.
  const selectedEmails = [...new Set(records.filter((r, i) => s.selected[i] && emailOf(r)).map(emailOf))];
  const withoutEmail = records.filter((r) => !emailOf(r)).length;

  // The ticked "Create a new list" box decides the button: create a list and add
  // to it (two APIs), or add to the list chosen in the dropdown (one API).
  async function addToList() {
    const creating = s.creatingList;
    // Zoho can't create an empty list, so the new list is seeded with one valid email.
    const seed = selectedEmails.find(looksLikeEmail);
    // Say what's missing rather than leaving the button disabled with no reason.
    const missing = !selectedEmails.length
      ? "Select at least one lead with an email."
      : !creating
        ? !s.listChoice ? "Choose a Zoho Campaigns list first, or tick \"Create a new list\"." : null
        : !newListName
          ? "Enter a name for the new list first."
          : newListTaken
            ? `A list named "${newListName}" already exists: untick "Create a new list" and choose it instead.`
            : !seed
              ? "None of the selected emails is a valid address, so the list can't be created."
              : null;
    setHint(missing);
    if (missing) return;
    const question = creating
      ? `Create the Zoho Campaigns list "${newListName}" and add ${selectedEmails.length} email(s) to it?`
      : `Add ${selectedEmails.length} email(s) to the Zoho Campaigns list "${s.lists?.find((l) => l.list_id === s.listChoice)?.list_name ?? s.listChoice}"?`;
    if (!window.confirm(question)) return;
    setNotice(null);
    setAdding(true);
    let created: CreatedList | null = null;
    const result: MembersResponse = { list_key: null, list_name: null, results: [], total: 0, succeeded: 0, failed: 0 };
    try {
      if (creating) {
        created = await callApi<CreatedList>("zoho", "zoho/lists", { list_name: newListName, emails: [seed] });
      }
      const listTarget = created ? { list_key: created.list_key, list_name: created.list_name } : { list_key: s.listChoice };
      // Batches go one after another.
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
      const made = created ? "Created the list and added" : "Added";
      setNotice(
        result.failed
          ? { kind: "warning", text: `${made} ${result.succeeded} of ${result.total} email(s) to ${list}; ${result.failed} failed. See details below.` }
          : { kind: "success", text: `${made} all ${result.total} email(s) to ${list}.` },
      );
    } catch (e) {
      set({ result: result.total ? result : null });
      const done = result.total ? ` (${result.total} of ${selectedEmails.length} email(s) were processed before the error.)` : "";
      const step = creating && !created ? "Creating the Zoho Campaigns list" : "Adding to the Zoho Campaigns list";
      const exists = created ? ` The list "${created.list_name}" was created and is now chosen: click "Add to list" to retry.` : "";
      setNotice({ kind: "error", text: `${step} failed: ${(e as Error).message}${done}${exists}` });
    } finally {
      setAdding(false);
      if (created) {
        // Show the new list as the chosen one, ready for the next add.
        set({ listChoice: created.list_key, creatingList: false, newListName: "" });
        void fetchLists();
      }
    }
  }

  const listOptions = ["", ...(s.lists ?? []).map((l) => l.list_id)];
  const formatList = (id: string) => (id === "" ? "Choose a list…" : (s.lists?.find((l) => l.list_id === id)?.list_name ?? id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zoho Campaigns Sync"
        subtitle="Build Zoho Campaigns lists from Zoho CRM leads, then create and send email campaigns to them."
      />

      <Tabs
        tabs={[
          { id: "lists", label: "Manage lists" },
          { id: "campaign", label: "Create campaign" },
        ]}
        active={s.tab}
        onChange={(tab) => set({ tab })}
      />

      {s.tab === "campaign" ? (
        <div className="space-y-6">
          {/* "New from a content URL" is read-only for now: copying is the supported flow. */}
          <SegmentedControl label="Start from" options={CAMPAIGN_MODES} value={s.campaignMode}
            disabled={[CAMPAIGN_MODES[1]]} onChange={(campaignMode) => set({ campaignMode })} />
          {s.campaignMode === CAMPAIGN_MODES[0] ? (
            <CloneCampaign />
          ) : (
            <CreateCampaign lists={s.lists} listsError={s.listsError} refreshLists={fetchLists} />
          )}
        </div>
      ) : (
      <>

      <Card title="Add from Zoho CRM" subtitle="Leads and Contacts by their Zoho CRM created date.">
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
                    // Read-only while "Create a new list" is ticked.
                    disabled={s.creatingList || adding}
                    onChange={(v) => set({ listChoice: v })}
                  />
                  <div className="space-y-1.5">
                    <Checkbox
                      label="Create a new list"
                      checked={s.creatingList}
                      onChange={(creatingList) => {
                        set({ creatingList });
                        setHint(null);
                      }}
                    />
                    <TextInput
                      aria-label="New list name"
                      value={s.newListName}
                      placeholder="e.g. Leads October 2026"
                      disabled={!s.creatingList || adding}
                      onChange={(v) => set({ newListName: v })}
                    />
                  </div>
                  <Button icon={RefreshCw} loading={loadingLists} onClick={loadLists}>
                    Refresh lists
                  </Button>
                </div>
                <div className="flex flex-col items-end gap-3">
                  {hint && <Alert kind="warning">{hint}</Alert>}
                  {s.creatingList ? (
                    <Button variant="primary" icon={FolderPlus} loading={adding} disabled={loading} onClick={addToList}>
                      Create list and add {selectedEmails.length} contacts
                    </Button>
                  ) : (
                    <Button variant="primary" icon={ListPlus} loading={adding} disabled={loading} onClick={addToList}>
                      Add {selectedEmails.length} to list
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Alert>Pick a date range and click &ldquo;Get leads&rdquo; to review the Zoho CRM leads here.</Alert>
      )}
      </>
      )}
    </div>
  );
}
