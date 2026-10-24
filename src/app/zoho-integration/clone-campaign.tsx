"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, RotateCcw, Send } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, DataTable, Select, TextInput } from "@/components/ui";
import {
  CAMPAIGN_STATUSES, campaignsStore, fetchCampaigns, loadCampaigns, RECENT_CAMPAIGNS, type CampaignStatus,
} from "./campaigns";

type Notice = { kind: "success" | "error" | "warning"; text: string };
/** POST /zoho/campaigns/{key}/clone response: Zoho's own, the new key is somewhere in `details`. */
type CloneResponse = { campaign_status?: string | null; details?: unknown };

const looksLikeEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** The new campaign's key in Zoho's clone response ("campaign_key" or "campaignKey", possibly nested). */
function findCampaignKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const key = findCampaignKey(item);
      if (key) return key;
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // Not "oldcampaignkey": that is the original's.
      if (/^campaign_?key$/i.test(k) && typeof v === "string" && v) return v;
    }
    for (const v of Object.values(value)) {
      const key = findCampaignKey(v);
      if (key) return key;
    }
  }
  return null;
}

const emptyForm = { campaignName: "", subject: "", fromName: "", fromEmail: "", replyTo: "" };

const store = createStore({
  filter: "",
  // The campaign to copy (its key and name).
  source: null as { key: string; name: string } | null,
  form: emptyForm,
  // The copy made by "Clone campaign"; "Send campaign" sends it. key is null
  // until it is known (Zoho's reply or the refreshed campaign list); before =
  // the campaign keys that existed before the clone.
  cloned: null as { key: string | null; name: string; sourceName: string; sent: boolean; before: string[] } | null,
});

export function CloneCampaign() {
  const [s, set] = store.useStore();
  const [c] = campaignsStore.useStore();
  const [cloning, setCloning] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (campaignsStore.get().campaigns === null) void loadCampaigns();
  }, []);

  const form = s.form;
  const setForm = (patch: Partial<typeof emptyForm>) => set((st) => ({ form: { ...st.form, ...patch } }));
  const locked = Boolean(s.cloned);
  const all = c.campaigns ?? [];
  const term = s.filter.trim().toLowerCase();
  const shown = term ? all.filter((x) => x.campaign_name.toLowerCase().includes(term)) : all;

  function choose(selected: boolean[]) {
    if (locked) return;
    // One campaign at a time: the newly ticked row wins.
    const picked = shown.find((x, i) => selected[i] && x.campaign_key !== s.source?.key)
      ?? shown.find((x, i) => selected[i]);
    if (!picked) {
      set({ source: null });
      return;
    }
    const autoName = s.source ? `${s.source.name} (copy)` : "";
    set({ source: { key: picked.campaign_key, name: picked.campaign_name } });
    // Suggest a name for the copy unless the person typed their own.
    if (!form.campaignName || form.campaignName === autoName) setForm({ campaignName: `${picked.campaign_name} (copy)` });
  }

  // A new name also lets the copy be found by name if Zoho's reply lacks its key.
  const nameTaken = all.some((x) => x.campaign_name.trim().toLowerCase() === form.campaignName.trim().toLowerCase());
  const problem = !s.source
    ? "Choose the campaign to copy."
    : !form.campaignName.trim()
      ? "Enter a name for the copy."
      : nameTaken && !locked
        ? "A campaign with this name already exists: give the copy a new name."
      : !form.subject.trim()
        ? "Enter a subject."
        : form.fromEmail.trim() && !looksLikeEmail(form.fromEmail.trim())
          ? "Enter a valid from email, or leave it empty."
          : form.replyTo.trim() && !looksLikeEmail(form.replyTo.trim())
            ? "Enter a valid reply-to email, or leave it empty."
            : null;

  /** The copy's key from a fresh list of all campaigns (whatever the Status
   * filter shows): one with its name that wasn't there before the clone, never
   * the original or an old one, since "Send campaign" emails real people. */
  async function findCopyKey(name: string, before: string[]): Promise<string | null> {
    const known = new Set(before);
    const latest = await fetchCampaigns("all");
    void loadCampaigns();
    return latest.find((x) => x.campaign_name === name && !known.has(x.campaign_key))?.campaign_key ?? null;
  }

  function chooseStatus(status: CampaignStatus) {
    campaignsStore.set({ status });
    void loadCampaigns();
  }

  async function cloneCampaign() {
    if (problem || !s.source) return;
    setNotice(null);
    setCloning(true);
    const name = form.campaignName.trim();
    try {
      // All recent campaigns, not just the filtered ones: the name must be new,
      // and the copy is told apart from these afterwards.
      const existing = await fetchCampaigns("all");
      if (existing.some((x) => x.campaign_name.trim().toLowerCase() === name.toLowerCase())) {
        setNotice({ kind: "warning", text: `A campaign named "${name}" already exists: give the copy a new name.` });
        return;
      }
      const before = existing.map((x) => x.campaign_key);
      const optional = { from_name: form.fromName.trim(), from_email: form.fromEmail.trim(), reply_to: form.replyTo.trim() };
      const result = await callApi<CloneResponse>("zoho", `zoho/campaigns/${s.source.key}/clone`, {
        campaign_name: name,
        subject: form.subject.trim(),
        // Empty = keep the original campaign's value.
        ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v)),
      });
      const replied = findCampaignKey(result);
      // Never the original's key, whatever the reply holds.
      const key = (replied !== s.source.key ? replied : null) ?? (await findCopyKey(name, before));
      set({ cloned: { key, name, sourceName: s.source.name, sent: false, before } });
      setNotice(key
        ? { kind: "success", text: `Created the draft "${name}", a copy of "${s.source.name}". Check it, then click "Send campaign".` }
        : { kind: "warning", text: `Zoho made the copy "${name}", but its key isn't known yet. Click "Refresh" above in a moment, then send it.` });
      void loadCampaigns();
    } catch (e) {
      setNotice({ kind: "error", text: `Could not copy the campaign: ${(e as Error).message}` });
    } finally {
      setCloning(false);
    }
  }

  async function refreshCampaigns() {
    const cloned = s.cloned;
    if (cloned && !cloned.key) {
      const key = await findCopyKey(cloned.name, cloned.before);
      if (key) {
        set({ cloned: { ...cloned, key } });
        setNotice({ kind: "success", text: `Found the draft "${cloned.name}". Check it, then click "Send campaign".` });
      }
    } else {
      await loadCampaigns();
    }
  }

  async function sendCampaign() {
    const cloned = s.cloned;
    if (!cloned?.key || cloned.sent) return;
    if (!window.confirm(
      `Send "${cloned.name}" now?\n\n` +
      `Zoho emails every active contact on the lists of the original campaign "${cloned.sourceName}". This cannot be undone.`,
    )) return;
    setNotice(null);
    setSending(true);
    try {
      const result = await callApi<{ message?: string }>("zoho", `zoho/campaigns/${cloned.key}/send`, {});
      set({ cloned: { ...cloned, sent: true } });
      setNotice({ kind: "success", text: result.message || `Sent "${cloned.name}".` });
      void loadCampaigns();
    } catch (e) {
      setNotice({ kind: "error", text: `Could not send the campaign: ${(e as Error).message}` });
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    set({ cloned: null, source: null, form: emptyForm });
    setNotice(null);
  }

  return (
    <div className="space-y-6">
      <Card title="1. Choose a campaign to copy"
        subtitle={`The last ${RECENT_CAMPAIGNS} campaigns in Zoho Campaigns (in the chosen status). The copy keeps its email content and its lists.`}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <TextInput label="Find a campaign" value={s.filter} placeholder="Type part of a campaign name"
              onChange={(v) => set({ filter: v })} />
            <Select
              label="Status"
              value={c.status}
              options={Object.keys(CAMPAIGN_STATUSES) as CampaignStatus[]}
              format={(v) => CAMPAIGN_STATUSES[v]}
              disabled={c.campaignsLoading || cloning || sending}
              onChange={chooseStatus}
            />
            <Button icon={RefreshCw} loading={c.campaignsLoading} disabled={cloning || sending} onClick={refreshCampaigns}>
              Refresh
            </Button>
          </div>
          {c.campaignsError && <Alert kind="error">Could not load campaigns: {c.campaignsError}</Alert>}
          {c.campaigns === null ? (
            !c.campaignsError && <Alert>Loading campaigns…</Alert>
          ) : all.length ? (
            <>
              <DataTable
                rows={shown.map((x) => ({
                  campaign: x.campaign_name,
                  status: x.campaign_status,
                  created: x.created_date_string ?? "",
                  sent: x.sent_date_string ?? "",
                }))}
                columns={["campaign", "status", "created", "sent"]}
                selected={shown.map((x) => x.campaign_key === s.source?.key)}
                onSelectedChange={choose}
              />
              {term && !shown.length && <Alert>No campaign name contains &ldquo;{s.filter}&rdquo;.</Alert>}
            </>
          ) : (
            <Alert>
              {c.status === "all" ? "There are no Zoho campaigns yet." : `No ${CAMPAIGN_STATUSES[c.status].toLowerCase()} campaigns.`}
            </Alert>
          )}
        </div>
      </Card>

      <Card title="2. Copy and send"
        subtitle="Zoho creates the copy as a draft. Nothing is emailed until you click “Send campaign”.">
        <div className="space-y-4">
          {s.source && (
            <p className="text-sm text-muted">
              Copying <span className="font-semibold text-navy">{s.source.name}</span>.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Name of the copy" value={form.campaignName} disabled={locked}
              placeholder="e.g. FBAR deadline reminder (November)" onChange={(v) => setForm({ campaignName: v })} />
            <TextInput label="Subject" value={form.subject} disabled={locked}
              placeholder="The email's subject line" onChange={(v) => setForm({ subject: v })} />
            <TextInput label="From email (optional)" type="email" value={form.fromEmail} disabled={locked}
              hint="Empty = the original's. Must be a sender verified in Zoho Campaigns." onChange={(v) => setForm({ fromEmail: v })} />
            <TextInput label="From name (optional)" value={form.fromName} disabled={locked}
              hint="Empty = the original's." onChange={(v) => setForm({ fromName: v })} />
            <TextInput label="Reply-to email (optional)" type="email" value={form.replyTo} disabled={locked}
              hint="Empty = the original's." onChange={(v) => setForm({ replyTo: v })} />
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
            {!locked && (s.source || Object.values(form).some(Boolean)) && problem && (
              <span className="text-sm text-muted sm:mr-auto">{problem}</span>
            )}
            {locked && (
              <Button icon={RotateCcw} disabled={sending} onClick={startOver}>
                Copy another
              </Button>
            )}
            <Button variant={locked ? "secondary" : "primary"} icon={Copy} loading={cloning}
              disabled={locked || !!problem} onClick={cloneCampaign}>
              {locked ? "Campaign copied" : "Clone campaign"}
            </Button>
            <Button variant="primary" icon={Send} loading={sending}
              disabled={!s.cloned?.key || s.cloned.sent || cloning} onClick={sendCampaign}>
              {s.cloned?.sent ? "Sent" : "Send campaign"}
            </Button>
          </div>
        </div>
      </Card>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
    </div>
  );
}
