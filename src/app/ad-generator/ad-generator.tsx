"use client";

import { useEffect, useState } from "react";
import {
  Building2, Download, FileText, History, RefreshCw, Rocket, Send, SlidersHorizontal, Sparkles, Zap,
} from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import {
  Alert, Button, Card, Checkbox, ChipSelect, DataTable, Expander, Metric, NumberInput, PageHeader, Select,
  Tabs, TextArea, TextInput, downloadText,
} from "@/components/ui";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok / Reels", color: "#FE2C55" },
  { key: "instagram", label: "Instagram", color: "#C13584" },
  { key: "twitter", label: "X / Twitter", color: "#0f172a" },
  { key: "facebook", label: "Facebook", color: "#1877f2" },
  { key: "linkedin", label: "LinkedIn", color: "#0a66c2" },
] as const;

// Mirrors the ad-generator backend's tools/linkedin_ads_tool.py COUNTRY_GEO_URNS;
// kept in sync by hand (the frontend never imports backend code).
const AD_COUNTRIES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", IN: "India", AU: "Australia",
};

const DETAIL_FIELDS = [
  ["What they do", "what_they_do"], ["Services", "services"], ["Target audience", "target_audience"],
  ["Brand tone", "brand_tone"], ["Key values", "key_values"], ["Tagline", "tagline"],
] as const;

type Dict = Record<string, unknown>;
type Campaign = Dict & {
  ads?: Record<string, string>;
  company_details?: Dict;
  detected_company_name?: string;
  detected_event?: string;
  quality_score?: number;
  quality_reason?: string;
  website_url?: string;
};
type AdImage = { clean_image_url: string; provider?: string; prompt?: string };
type ProviderFailed = { failed_provider: string; next_provider_label: string; next_provider_name: string };
type Draft = Dict & { _daily_budget: number; _days: number };
type TabId = "generate" | "review" | "publish";
type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

const store = createStore({
  initialized: false,
  tab: "generate" as TabId,
  form: { companyUrl: "", companyName: "", productDescription: "", adIdea: "", eventContext: "", contactUrl: "" },
  campaign: null as Campaign | null,
  captions: {} as Record<string, string>,
  image: null as AdImage | null,
  providerFailed: null as ProviderFailed | null,
  linkedinPostUrn: null as string | null,
  facebookAdDraft: null as Draft | null,
  linkedinAdDraft: null as Draft | null,
});

const scoreColor = (s: number) => (s >= 8 ? "text-success" : s >= 5 ? "text-warning" : "text-danger");
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PlatformName({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-navy">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  return notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null;
}

export function AdGenerator({ defaults, showPaidPromotion }: {
  defaults: { companyUrl: string; companyName: string; contactUrl: string };
  showPaidPromotion: boolean;
}) {
  const [s, set] = store.useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const notify = (key: string, notice: Notice) => setNotices((n) => ({ ...n, [key]: notice }));

  // Prefill the form once per tab session from the server's DEFAULT_* env.
  useEffect(() => {
    if (!store.get().initialized) {
      store.set((st) => ({ initialized: true, form: { ...st.form, ...defaults } }));
    }
  }, [defaults]);

  const { form, campaign } = s;
  const setForm = (patch: Partial<typeof form>) => set((st) => ({ form: { ...st.form, ...patch } }));
  const details = campaign?.company_details ?? {};
  const companyName = campaign?.detected_company_name ?? form.companyName;
  const effectiveContactUrl = (c: Campaign | null = campaign) =>
    form.contactUrl.trim() || form.companyUrl.trim() || String(c?.website_url ?? "").trim();

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function generateImage(c: Campaign, customPrompt = "") {
    const cDetails = c.company_details ?? {};
    const cAds = c.ads ?? {};
    try {
      const data = await callApi<Dict>("ad", "generate-image", {
        company_name: c.detected_company_name ?? form.companyName,
        instagram_copy: cAds.instagram ?? "",
        image_headline: cAds.image_headline ?? "",
        event_context: c.detected_event ?? "",
        company_details: cDetails,
        logo_url: cDetails.logo_url,
        custom_prompt: customPrompt,
        contact_url: effectiveContactUrl(c),
      });
      if (data.success && typeof data.clean_image_url === "string") {
        set({ image: data as unknown as AdImage, providerFailed: null });
        notify("image", null);
      } else if (data.success) {
        notify("image", { kind: "error", text: "The backend reported success but returned no image." });
      } else if (data.provider_failed) {
        set({ providerFailed: data as unknown as ProviderFailed });
      } else {
        set({ providerFailed: null });
        notify("image", { kind: "error", text: `Image error: ${data.error}` });
      }
    } catch (e) {
      notify("image", { kind: "error", text: `Something went wrong generating the image: ${(e as Error).message}` });
    }
  }

  const setCampaign = (data: Campaign) =>
    set({ campaign: data, image: null, captions: { ...(data.ads ?? {}) } });

  const onGenerate = () =>
    run("generate", async () => {
      if (!form.companyName && !form.companyUrl) {
        notify("generate", { kind: "error", text: "Please fill in at least the company name or website URL." });
        return;
      }
      notify("generate", null);
      let data: Campaign;
      try {
        data = await callApi<Campaign>("ad", "generate", {
          company_name: form.companyName,
          product_description: form.productDescription,
          ad_idea: form.adIdea,
          event_context: form.eventContext || null,
          company_url: form.companyUrl || null,
        });
      } catch (e) {
        notify("generate", { kind: "error", text: `Something went wrong talking to the backend: ${(e as Error).message}` });
        return;
      }
      if (data.exhausted) {
        notify("generate", { kind: "error", text: `All text generation providers are exhausted: ${data.error}` });
      } else if (data.success) {
        setCampaign(data);
        setBusy("generate-image");
        await generateImage(data);
      } else {
        notify("generate", { kind: "error", text: `Error: ${data.error}` });
      }
    });

  return (
    <>
      <PageHeader
        title="Ad generator"
        subtitle="Research a company, tie the campaign to a real event, and generate ad copy + images."
      />
      <Tabs
        tabs={[
          { id: "generate", label: "1. Generate" },
          { id: "review", label: "2. Review copy" },
          { id: "publish", label: "3. Image & publish" },
        ]}
        active={s.tab}
        onChange={(tab) => set({ tab })}
      />

      {s.tab === "generate" && (
        <div className="space-y-5">
          <Card title="Start a new campaign" subtitle="Paste your website. Get platform-ready ad copy tied to a real world event.">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                onGenerate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Company website URL (optional)" placeholder="https://www.nike.com"
                  value={form.companyUrl} onChange={(v) => setForm({ companyUrl: v })} />
                <TextInput label="Company name" placeholder="Nike"
                  value={form.companyName} onChange={(v) => setForm({ companyName: v })} />
              </div>
              <TextArea label="What does your product do? (optional — auto-filled from URL)"
                value={form.productDescription} onChange={(v) => setForm({ productDescription: v })} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextArea label="Your ad idea or angle (optional)"
                  value={form.adIdea} onChange={(v) => setForm({ adIdea: v })} />
                <TextInput label="Current event to connect to (optional)" placeholder="2026 World Cup, Diwali, ..."
                  value={form.eventContext} onChange={(v) => setForm({ eventContext: v })} />
              </div>
              <TextInput
                label="Contact URL for the ad's call-to-action (optional)"
                placeholder="https://yoursite.com/contact"
                hint="Printed as small plain text on the image in place of a CTA button — a generated image can't actually be clickable. Leave blank to use the company website URL above."
                value={form.contactUrl}
                onChange={(v) => setForm({ contactUrl: v })}
              />
              <Button type="submit" variant="primary" icon={Zap} block
                loading={busy === "generate" || busy === "generate-image"}>
                {busy === "generate-image" ? "Generating your ad image…" : busy === "generate"
                  ? "Researching company, detecting the best event, and writing your ad copy…" : "Generate ads"}
              </Button>
            </form>
          </Card>
          <NoticeLine notice={notices.generate ?? null} />
          {campaign && (
            <>
              <Alert kind="success">
                Campaign ready for <strong>{companyName}</strong> — open the <strong>Review copy</strong> tab to see
                it, or <strong>Image &amp; publish</strong> to generate the ad image.
              </Alert>
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label="Detected event" value={campaign.detected_event || "—"} />
                <Metric label="Quality score" value={`${campaign.quality_score ?? 0}/10`} />
                <Metric label="Platforms generated" value={PLATFORMS.length} />
              </div>
            </>
          )}
        </div>
      )}

      {s.tab === "review" && (
        !campaign ? (
          <Alert>Generate a campaign in the <strong>Generate</strong> tab first.</Alert>
        ) : (
          <div className="space-y-5">
            {campaign.detected_event && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <Alert>Event used: <strong>{campaign.detected_event}</strong></Alert>
                </div>
                <Button icon={RefreshCw} loading={busy === "retry"} onClick={() =>
                  run("retry", async () => {
                    try {
                      const data = await callApi<Campaign>("ad", "retry-event", {
                        company_name: companyName,
                        company_url: form.companyUrl,
                      });
                      if (data.success) {
                        setCampaign(data);
                        notify("retry", null);
                      } else {
                        notify("retry", { kind: "error", text: `Could not get a new event: ${data.error}` });
                      }
                    } catch (e) {
                      notify("retry", { kind: "error", text: `Something went wrong retrying the event: ${(e as Error).message}` });
                    }
                  })
                }>
                  Try different event
                </Button>
              </div>
            )}
            <NoticeLine notice={notices.retry ?? null} />

            {!!campaign.quality_score && (
              <Card>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className={`font-display text-3xl font-extrabold ${scoreColor(campaign.quality_score)}`}>
                      {campaign.quality_score}/10
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Quality</div>
                  </div>
                  <div>
                    <div className="font-semibold text-navy">Ad quality report</div>
                    <p className="mt-1 text-sm text-muted">{campaign.quality_reason}</p>
                  </div>
                </div>
              </Card>
            )}

            {Object.keys(details).length > 0 && (
              <Expander title="Company details used in generation" icon={Building2}>
                <DataTable rows={DETAIL_FIELDS.map(([label, field]) => ({ Field: label, Value: details[field] || "—" }))} />
              </Expander>
            )}

            <Card title="Platform captions" subtitle="Edit any caption here; your edits are what gets downloaded and posted.">
              <div className="divide-y divide-line">
                {PLATFORMS.map((p) => (
                  <div key={p.key} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[150px_1fr_auto] md:items-start">
                    <div className="md:pt-2"><PlatformName label={p.label} color={p.color} /></div>
                    <textarea
                      aria-label={`${p.label} caption`}
                      rows={4}
                      value={s.captions[p.key] ?? ""}
                      onChange={(e) => set((st) => ({ captions: { ...st.captions, [p.key]: e.target.value } }))}
                      className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/20"
                    />
                    <Button icon={Download} onClick={() => downloadText(`${p.key}_caption.txt`, s.captions[p.key] ?? "")}>
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )
      )}

      {s.tab === "publish" && (
        !campaign ? (
          <Alert>Generate a campaign in the <strong>Generate</strong> tab first.</Alert>
        ) : (
          <div className="space-y-5">
            <ImageCard
              image={s.image}
              providerFailed={s.providerFailed}
              busy={busy}
              notice={notices.image ?? null}
              onGenerate={(customPrompt) => run("image", () => generateImage(campaign, customPrompt))}
              onSwitchProvider={(p) => run("switch", async () => {
                try {
                  await callApi("ad", "switch-image-provider", { provider: p.next_provider_name });
                  set({ providerFailed: null });
                } catch (e) {
                  notify("image", { kind: "error", text: (e as Error).message });
                }
              })}
            />
            {s.image && (
              <PostCard
                imageUrl={s.image.clean_image_url}
                captions={s.captions}
                onLinkedInPosted={(urn) => set({ linkedinPostUrn: urn })}
              />
            )}
            {s.image && showPaidPromotion && (
              <PaidPromotionCard
                imageUrl={s.image.clean_image_url}
                campaignName={`${companyName} - ${campaign.detected_event || "campaign"}`}
                facebookMessage={s.captions.facebook ?? ""}
                link={effectiveContactUrl()}
              />
            )}
          </div>
        )
      )}
    </>
  );
}

function ImageCard({ image, providerFailed, busy, notice, onGenerate, onSwitchProvider }: {
  image: AdImage | null;
  providerFailed: ProviderFailed | null;
  busy: string | null;
  notice: Notice;
  onGenerate: (customPrompt: string) => void;
  onSwitchProvider: (p: ProviderFailed) => void;
}) {
  const [useCustom, setUseCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(image?.prompt ?? "");
  const src = image ? `/api/ad${image.clean_image_url}` : null;

  return (
    <Card title="Ad image">
      <div className="space-y-4">
        <Expander title="Customize image prompt" icon={SlidersHorizontal}>
          <div className="space-y-3">
            <p className="text-sm text-muted">
              By default the background scene is written automatically by AI, tailored to your company/event/copy — you
              don&apos;t need to fill this in. The box below is only for overriding that with your own description.
            </p>
            <Checkbox label="Use my own image prompt instead" checked={useCustom} onChange={setUseCustom} />
            <TextArea label="Describe the image you want" value={customPrompt} onChange={setCustomPrompt} disabled={!useCustom} />
          </div>
        </Expander>
        <Button variant="primary" icon={Sparkles} block loading={busy === "image"}
          onClick={() => onGenerate(useCustom ? customPrompt : "")}>
          {busy === "image" ? "Generating image…" : "Generate / regenerate image"}
        </Button>
        <NoticeLine notice={notice} />
        {providerFailed && (
          <Alert kind="warning">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {providerFailed.failed_provider} failed. Switch to {providerFailed.next_provider_label} and try again.
              </span>
              <Button loading={busy === "switch"} onClick={() => onSwitchProvider(providerFailed)}>
                Switch to {providerFailed.next_provider_label}
              </Button>
            </div>
          </Alert>
        )}
        {image && src && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated on the backend, served via our proxy */}
            <img src={src} alt="Generated ad" className="mx-auto w-full max-w-xl rounded-lg border border-line" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted">Image model: {image.provider ?? "openai_image"}</span>
              <a
                href={src}
                download={image.clean_image_url.split("/").pop()}
                className="inline-flex items-center gap-2 rounded-full border border-navy/25 bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy hover:border-navy hover:bg-canvas"
              >
                <Download className="size-4" /> Download ad image
              </a>
            </div>
            {image.prompt && (
              <Expander title="Background prompt used (AI-written)" icon={History} defaultOpen>
                <pre className="whitespace-pre-wrap text-xs text-ink">{image.prompt}</pre>
              </Expander>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PostCard({ imageUrl, captions, onLinkedInPosted }: {
  imageUrl: string;
  captions: Record<string, string>;
  onLinkedInPosted: (urn: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Notice>>({});
  const targets = [
    { key: "instagram", label: "Instagram", color: "#C13584" },
    { key: "facebook", label: "Facebook", color: "#1877f2" },
    { key: "linkedin", label: "LinkedIn", color: "#0a66c2" },
  ];

  async function post(key: string) {
    setBusy(key);
    try {
      const r = await callApi<Dict>("ad", `post-to-${key}`, { caption: captions[key] ?? "", image_url: imageUrl });
      if (r.success) {
        if (key === "linkedin" && r.post_id) onLinkedInPosted(String(r.post_id));
        setResults((x) => ({ ...x, [key]: { kind: "success", text: "Posted!" } }));
      } else {
        setResults((x) => ({ ...x, [key]: { kind: "error", text: String(r.error) } }));
      }
    } catch (e) {
      setResults((x) => ({ ...x, [key]: { kind: "error", text: (e as Error).message } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Post to your accounts" subtitle="Review the copy and image above, then approve posting to each platform individually.">
      <div className="grid gap-4 md:grid-cols-3">
        {targets.map((t) => (
          <div key={t.key} className="space-y-3 rounded-lg border border-line p-4">
            <PlatformName label={t.label} color={t.color} />
            <Button icon={Send} block loading={busy === t.key} disabled={!!busy && busy !== t.key} onClick={() => post(t.key)}>
              Post to {t.label}
            </Button>
            <NoticeLine notice={results[t.key] ?? null} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function DraftSummary({ draft, statusText, ids, onActivate, onDiscard }: {
  draft: Draft;
  statusText: string;
  ids: string;
  onActivate: (password: string) => Promise<Notice>;
  onDiscard: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const spend = draft._daily_budget * draft._days;
  return (
    <div className="space-y-4">
      <Alert kind="success">{statusText}</Alert>
      <p className="break-all font-mono text-xs text-muted">{ids}</p>
      <div className="max-w-xs">
        <Metric label="Estimated total spend" value={money(spend)} hint={`${money(draft._daily_budget)}/day x ${draft._days} days`} />
      </div>
      <TextInput
        type="password"
        label="Execution password (required to activate — this will start spending real budget)"
        value={password}
        onChange={setPassword}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="primary" icon={Rocket} loading={busy} disabled={!password} onClick={async () => {
          setBusy(true);
          setNotice(await onActivate(password));
          setBusy(false);
        }}>
          Activate campaign
        </Button>
        <Button onClick={onDiscard}>Discard draft</Button>
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

async function activate(path: string, body: Dict): Promise<Notice> {
  try {
    const r = await callApi<Dict>("ad", path, body);
    return r.success
      ? { kind: "success", text: "Campaign activated — it's now live and spending." }
      : { kind: "error", text: String(r.error) };
  } catch (e) {
    return { kind: "error", text: (e as Error).message };
  }
}

function PaidPromotionCard({ imageUrl, campaignName, facebookMessage, link }: {
  imageUrl: string;
  campaignName: string;
  facebookMessage: string;
  link: string;
}) {
  const [s, set] = store.useStore();
  const [tab, setTab] = useState<"meta" | "linkedin">("meta");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fb, setFb] = useState({ budget: 10, days: 7, countries: ["US"] });
  const [li, setLi] = useState({ budget: 10, days: 7, country: "US" });
  const countryCodes = Object.keys(AD_COUNTRIES);

  async function createDraft(path: string, body: Dict, budget: number, days: number, key: "facebookAdDraft" | "linkedinAdDraft") {
    setBusy(true);
    setNotice(null);
    try {
      const r = await callApi<Dict>("ad", path, body);
      if (r.success) set({ [key]: { ...r, _daily_budget: budget, _days: days } as Draft });
      else setNotice({ kind: "error", text: String(r.error) });
    } catch (e) {
      setNotice({ kind: "error", text: `Something went wrong creating the campaign: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Paid promotion (Meta & LinkedIn)"
      subtitle="Creates a draft campaign only — nothing is ever activated automatically. Review the numbers below, then explicitly activate when you're ready to spend."
    >
      <Tabs tabs={[{ id: "meta", label: "Meta (Facebook/Instagram)" }, { id: "linkedin", label: "LinkedIn" }]} active={tab} onChange={setTab} />
      {tab === "meta" && (
        s.facebookAdDraft ? (
          <DraftSummary
            draft={s.facebookAdDraft}
            statusText="Draft campaign created — status: PAUSED (not spending)."
            ids={`Campaign ${s.facebookAdDraft.campaign_id} / ad set ${s.facebookAdDraft.adset_id} / ad ${s.facebookAdDraft.ad_id}`}
            onActivate={(password) => activate("activate-facebook-ad-campaign", {
              campaign_id: s.facebookAdDraft!.campaign_id,
              adset_id: s.facebookAdDraft!.adset_id,
              ad_id: s.facebookAdDraft!.ad_id,
              password,
            })}
            onDiscard={() => set({ facebookAdDraft: null })}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Daily budget (USD)" min={1} value={fb.budget} onChange={(budget) => setFb({ ...fb, budget })} />
              <NumberInput label="Run for how many days" min={1} value={fb.days} onChange={(days) => setFb({ ...fb, days })} />
            </div>
            <ChipSelect label="Countries to target" options={countryCodes} format={(c) => AD_COUNTRIES[c]}
              selected={fb.countries} onChange={(countries) => setFb({ ...fb, countries })} />
            <Button icon={FileText} loading={busy} disabled={!fb.countries.length} onClick={() => {
              const start = new Date();
              const end = new Date(start.getTime() + fb.days * 86_400_000);
              // Same format the Streamlit app sent: %Y-%m-%dT%H:%M:%S%z in UTC.
              const fmt = (d: Date) => `${d.toISOString().slice(0, 19)}+0000`;
              createDraft("create-facebook-ad-campaign", {
                name: campaignName,
                image_url: imageUrl,
                message: facebookMessage,
                link,
                daily_budget_usd: fb.budget,
                countries: fb.countries,
                start_time: fmt(start),
                end_time: fmt(end),
              }, fb.budget, fb.days, "facebookAdDraft");
            }}>
              Create draft campaign
            </Button>
            <NoticeLine notice={notice} />
          </div>
        )
      )}
      {tab === "linkedin" && (
        !s.linkedinPostUrn ? (
          <Alert>
            Post to LinkedIn organically first (above) so there&apos;s content to promote — this reuses that post rather
            than creating new sponsored content from scratch.
          </Alert>
        ) : s.linkedinAdDraft ? (
          <DraftSummary
            draft={s.linkedinAdDraft}
            statusText="Draft campaign created — status: DRAFT (not spending)."
            ids={`Campaign group ${s.linkedinAdDraft.campaign_group_urn} / campaign ${s.linkedinAdDraft.campaign_urn} / creative ${s.linkedinAdDraft.creative_urn}`}
            onActivate={(password) => activate("activate-linkedin-ad-campaign", {
              campaign_group_urn: s.linkedinAdDraft!.campaign_group_urn,
              campaign_urn: s.linkedinAdDraft!.campaign_urn,
              creative_urn: s.linkedinAdDraft!.creative_urn,
              password,
            })}
            onDiscard={() => set({ linkedinAdDraft: null })}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Will promote the post you just published: <code className="text-navy">{s.linkedinPostUrn}</code>
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberInput label="Daily budget (USD)" min={1} value={li.budget} onChange={(budget) => setLi({ ...li, budget })} />
              <NumberInput label="Run for how many days" min={1} value={li.days} onChange={(days) => setLi({ ...li, days })} />
              <Select label="Country to target" options={countryCodes} format={(c) => AD_COUNTRIES[c]}
                value={li.country} onChange={(country) => setLi({ ...li, country })} />
            </div>
            <Button icon={FileText} loading={busy} onClick={() => {
              const startMs = Date.now();
              createDraft("create-linkedin-ad-campaign", {
                name: campaignName,
                share_urn: s.linkedinPostUrn,
                daily_budget_usd: li.budget,
                country_code: li.country,
                start_time_ms: startMs,
                end_time_ms: startMs + li.days * 86_400_000,
              }, li.budget, li.days, "linkedinAdDraft");
            }}>
              Create draft campaign
            </Button>
            <NoticeLine notice={notice} />
          </div>
        )
      )}
    </Card>
  );
}
