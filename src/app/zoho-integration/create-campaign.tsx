"use client";

import { useEffect, useState } from "react";
import { Megaphone, RefreshCw, RotateCcw, Send } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, Checkbox, DataTable, TextInput } from "@/components/ui";
import { campaignsStore, loadCampaigns, RECENT_CAMPAIGNS } from "./campaigns";

export type CampaignList = { list_id: string; list_name: string | null };

type Notice = { kind: "success" | "error" | "warning"; text: string };

const looksLikeEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

const emptyForm = { campaignName: "", subject: "", fromEmail: "", fromName: "", contentUrl: "" };

const store = createStore({
  // Ticked lists, by list key, so a filter doesn't lose the selection.
  chosen: [] as string[],
  filter: "",
  form: emptyForm,
  // The draft made by "Create campaign"; "Send campaign" sends this one.
  created: null as { key: string; name: string; lists: number; sent: boolean } | null,
});

export function CreateCampaign({ lists, listsError, refreshLists }: {
  lists: CampaignList[] | null;
  listsError: string | null;
  refreshLists: () => Promise<void>;
}) {
  const [s, set] = store.useStore();
  const [c] = campaignsStore.useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Recent campaigns load once per tab, like the lists.
  useEffect(() => {
    if (campaignsStore.get().campaigns === null) void loadCampaigns();
  }, []);

  const form = s.form;
  const setForm = (patch: Partial<typeof emptyForm>) => set((st) => ({ form: { ...st.form, ...patch } }));
  const all = lists ?? [];
  const term = s.filter.trim().toLowerCase();
  const shown = term ? all.filter((l) => (l.list_name ?? "").toLowerCase().includes(term)) : all;
  const chosen = new Set(s.chosen);
  const chosenLists = all.filter((l) => chosen.has(l.list_id));
  const allShownChosen = shown.length > 0 && shown.every((l) => chosen.has(l.list_id));

  function setShownChosen(on: boolean) {
    const next = new Set(chosen);
    for (const l of shown) {
      if (on) next.add(l.list_id);
      else next.delete(l.list_id);
    }
    set({ chosen: [...next] });
  }

  const problem = !chosenLists.length
    ? "Select at least one list."
    : !form.campaignName.trim()
      ? "Enter a campaign name."
      : !form.subject.trim()
        ? "Enter a subject."
        : !looksLikeEmail(form.fromEmail.trim())
          ? "Enter a valid from email."
          : !/^https?:\/\/\S+$/i.test(form.contentUrl.trim())
            ? "Enter the content URL: a public http(s) link to the email's HTML."
            : null;

  async function createCampaign() {
    if (problem) return;
    setNotice(null);
    setCreating(true);
    try {
      const name = form.campaignName.trim();
      const { campaign_key } = await callApi<{ campaign_key: string; message?: string }>("zoho", "zoho/campaigns", {
        campaign_name: name,
        subject: form.subject.trim(),
        from_email: form.fromEmail.trim(),
        ...(form.fromName.trim() ? { from_name: form.fromName.trim() } : {}),
        list_keys: chosenLists.map((l) => l.list_id),
        content_url: form.contentUrl.trim(),
      });
      set({ created: { key: campaign_key, name, lists: chosenLists.length, sent: false } });
      setNotice({ kind: "success", text: `Created the draft campaign "${name}". Check it, then click "Send campaign".` });
      void loadCampaigns();
    } catch (e) {
      const message = (e as Error).message;
      // Zoho's createCampaign fails with a bare HTTP 5xx page when it dislikes the input.
      const checks = /HTTP 5\d\d/.test(message)
        ? " Zoho rejected it without saying why. Check that the From email is a sender verified in Zoho Campaigns " +
          "(Gmail and other free addresses are often refused), that the content URL is a plain public HTML page " +
          "(not a Zoho preview link), and, if your Zoho account uses topics, that the backend has a default topic set."
        : "";
      setNotice({ kind: "error", text: `Could not create the campaign: ${message}.${checks}` });
    } finally {
      setCreating(false);
    }
  }

  async function sendCampaign() {
    const created = s.created;
    if (!created || created.sent) return;
    if (!window.confirm(
      `Send "${created.name}" now?\n\n` +
      `Zoho emails every active contact on the ${created.lists} selected list(s). This cannot be undone.`,
    )) return;
    setNotice(null);
    setSending(true);
    try {
      const result = await callApi<{ message?: string }>("zoho", `zoho/campaigns/${created.key}/send`, {});
      set({ created: { ...created, sent: true } });
      setNotice({ kind: "success", text: result.message || `Sent "${created.name}".` });
      void loadCampaigns();
    } catch (e) {
      setNotice({ kind: "error", text: `Could not send the campaign: ${(e as Error).message}` });
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    set({ created: null, form: emptyForm, chosen: [] });
    setNotice(null);
  }

  async function refresh() {
    setRefreshing(true);
    await refreshLists();
    setRefreshing(false);
  }

  const locked = Boolean(s.created);

  return (
    <div className="space-y-6">
      <Card title="1. Choose lists" subtitle="The Zoho Campaigns lists the campaign is sent to.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <TextInput label="Find a list" value={s.filter} placeholder="Type part of a list name"
              onChange={(v) => set({ filter: v })} />
            <Button icon={RefreshCw} loading={refreshing} disabled={locked} onClick={refresh}>
              Refresh lists
            </Button>
          </div>
          {listsError && <Alert kind="error">Could not load Zoho Campaigns lists: {listsError}</Alert>}
          {lists === null ? (
            !listsError && <Alert>Loading Zoho Campaigns lists…</Alert>
          ) : all.length ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Checkbox
                  label={term ? `Select all ${shown.length} matching` : `Select all ${all.length} lists`}
                  checked={allShownChosen}
                  onChange={(v) => !locked && setShownChosen(v)}
                />
                <span className="text-sm font-semibold text-navy">{chosenLists.length} selected</span>
              </div>
              <DataTable
                rows={shown.map((l) => ({ list: l.list_name ?? l.list_id }))}
                columns={["list"]}
                selected={shown.map((l) => chosen.has(l.list_id))}
                onSelectedChange={(sel) => {
                  if (locked) return;
                  const next = new Set(chosen);
                  shown.forEach((l, i) => (sel[i] ? next.add(l.list_id) : next.delete(l.list_id)));
                  set({ chosen: [...next] });
                }}
              />
              {term && !shown.length && <Alert>No list name contains &ldquo;{s.filter}&rdquo;.</Alert>}
            </>
          ) : (
            <Alert>There are no Zoho Campaigns lists yet.</Alert>
          )}
        </div>
      </Card>

      <Card title="2. Campaign details" subtitle="Zoho creates the campaign as a draft. Nothing is emailed until you click “Send campaign”.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Campaign name" value={form.campaignName} disabled={locked}
              placeholder="e.g. FBAR deadline reminder" onChange={(v) => setForm({ campaignName: v })} />
            <TextInput label="Subject" value={form.subject} disabled={locked}
              placeholder="The email's subject line" onChange={(v) => setForm({ subject: v })} />
            <TextInput label="From email" type="email" value={form.fromEmail} disabled={locked}
              hint="Must be a sender address verified in Zoho Campaigns." onChange={(v) => setForm({ fromEmail: v })} />
            <TextInput label="From name (optional)" value={form.fromName} disabled={locked}
              placeholder="e.g. AG FinTax" onChange={(v) => setForm({ fromName: v })} />
          </div>
          <TextInput label="Content URL" type="url" value={form.contentUrl} disabled={locked}
            placeholder="https://…/email.html"
            hint="A public link to the email's HTML. Zoho downloads the content from it."
            onChange={(v) => setForm({ contentUrl: v })} />

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
            {!locked && (chosenLists.length > 0 || Object.values(form).some(Boolean)) && problem && (
              <span className="text-sm text-muted sm:mr-auto">{problem}</span>
            )}
            {locked && (
              <Button icon={RotateCcw} disabled={sending} onClick={startOver}>
                New campaign
              </Button>
            )}
            <Button variant={locked ? "secondary" : "primary"} icon={Megaphone} loading={creating}
              disabled={locked || !!problem} onClick={createCampaign}>
              {locked ? "Campaign created" : "Create campaign"}
            </Button>
            <Button variant="primary" icon={Send} loading={sending}
              disabled={!s.created || s.created.sent || creating} onClick={sendCampaign}>
              {s.created?.sent ? "Sent" : "Send campaign"}
            </Button>
          </div>
        </div>
      </Card>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <Card title="Recent campaigns" subtitle={`The last ${RECENT_CAMPAIGNS} campaigns in Zoho Campaigns.`}>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button icon={RefreshCw} loading={c.campaignsLoading} onClick={loadCampaigns}>Refresh</Button>
          </div>
          {c.campaignsError && <Alert kind="error">Could not load campaigns: {c.campaignsError}</Alert>}
          {c.campaigns?.length ? (
            <DataTable
              rows={c.campaigns.map((x) => ({
                campaign: x.campaign_name,
                status: x.campaign_status,
                created: x.created_date_string ?? "",
                sent: x.sent_date_string ?? "",
              }))}
            />
          ) : (
            c.campaigns && <Alert>No campaigns yet.</Alert>
          )}
        </div>
      </Card>
    </div>
  );
}
