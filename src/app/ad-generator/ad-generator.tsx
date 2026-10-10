"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Building2, Download, FileText, History, RefreshCw, Rocket, Send, SlidersHorizontal, Sparkles, X, Zap,
} from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { zip } from "@/lib/zip";
import {
  Alert, Button, Card, Checkbox, ChipSelect, DataTable, Expander, Metric, NumberInput, PageHeader, Select,
  Stepper, Tabs, TextArea, TextInput, downloadBlob, downloadText,
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
type Form = { companyUrl: string; companyName: string; productDescription: string; adIdea: string; eventContext: string; contactUrl: string };
type Brand = { tone: string; audience: string; colors: string[] };
type SavedDraft = {
  id: string;
  savedAt: number;
  form: Form;
  platforms: string[];
  campaign: Campaign | null;
  captions: Record<string, string>;
  image: AdImage | null;
};

const EVENT_SUGGESTIONS = ["Interest rates", "Year-end planning", "Tax deadlines"];

// Overrides brand_tone / target_audience in the company details sent to the
// image endpoint, so the poster follows the house style.
const DEFAULT_BRAND: Brand = {
  tone: "Professional, advisory, trustworthy",
  audience: "Business owners and cross-border families",
  colors: ["#03045e", "#fa5f11", "#c9a94e"],
};

// Drafts and the brand profile are kept in this browser only.
const LS_DRAFTS = "adStudio.drafts";
const LS_BRAND = "adStudio.brand";
const MAX_DRAFTS = 20;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory copy still works for this tab.
  }
}

const draftTitle = (d: SavedDraft) =>
  d.campaign?.ads?.image_headline || d.form.adIdea || d.form.companyName || "Untitled draft";
const draftEvent = (d: SavedDraft) => d.campaign?.detected_event || d.form.eventContext || "Not generated yet";

const store = createStore({
  initialized: false,
  tab: "generate" as TabId,
  form: { companyUrl: "", companyName: "", productDescription: "", adIdea: "", eventContext: "", contactUrl: "" } as Form,
  platforms: PLATFORMS.map((p) => p.key) as string[],
  brand: DEFAULT_BRAND,
  drafts: [] as SavedDraft[],
  draftId: null as string | null,
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

  // Prefill the form once per tab session from the server's DEFAULT_* env,
  // and load this browser's saved drafts and brand profile.
  useEffect(() => {
    if (!store.get().initialized) {
      store.set((st) => ({
        initialized: true,
        form: { ...st.form, ...defaults },
        drafts: readLocal<SavedDraft[]>(LS_DRAFTS, []),
        brand: readLocal<Brand>(LS_BRAND, DEFAULT_BRAND),
      }));
    }
  }, [defaults]);

  // Upserts the current brief/campaign as the active draft.
  function saveDraft() {
    const st = store.get();
    const draft: SavedDraft = {
      id: st.draftId ?? crypto.randomUUID(),
      savedAt: Date.now(),
      form: st.form,
      platforms: st.platforms,
      campaign: st.campaign,
      captions: st.captions,
      image: st.image,
    };
    const drafts = [draft, ...st.drafts.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);
    writeLocal(LS_DRAFTS, drafts);
    store.set({ drafts, draftId: draft.id });
  }

  function loadDraft(d: SavedDraft) {
    set({
      form: d.form,
      platforms: d.platforms,
      campaign: d.campaign,
      captions: d.captions,
      image: d.image,
      providerFailed: null,
      draftId: d.id,
      tab: d.campaign ? "review" : "generate",
    });
    setNotices({});
  }

  function deleteDraft(id: string) {
    const drafts = s.drafts.filter((d) => d.id !== id);
    writeLocal(LS_DRAFTS, drafts);
    set((st) => ({ drafts, draftId: st.draftId === id ? null : st.draftId }));
  }

  function saveBrand(brand: Brand) {
    writeLocal(LS_BRAND, brand);
    set({ brand });
  }

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
    const { brand } = store.get();
    const cDetails = c.company_details ?? {};
    const cAds = c.ads ?? {};
    try {
      const data = await callApi<Dict>("ad", "generate-image", {
        company_name: c.detected_company_name ?? form.companyName,
        instagram_copy: cAds.instagram ?? "",
        image_headline: cAds.image_headline ?? "",
        event_context: c.detected_event ?? "",
        company_details: {
          ...cDetails,
          brand_tone: brand.tone || cDetails.brand_tone,
          target_audience: brand.audience || cDetails.target_audience,
        },
        logo_url: cDetails.logo_url,
        custom_prompt: customPrompt,
        contact_url: effectiveContactUrl(c),
      });
      if (data.success && typeof data.clean_image_url === "string") {
        set({ image: data as unknown as AdImage, providerFailed: null });
        notify("image", null);
        saveDraft();
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

  const requestCampaign = (eventContext: string) =>
    callApi<Campaign>("ad", "generate", {
      company_name: form.companyName,
      product_description: form.productDescription,
      ad_idea: form.adIdea,
      event_context: eventContext || null,
      company_url: form.companyUrl || null,
    });

  const setCaption = (key: string, text: string) => {
    set((st) => ({ captions: { ...st.captions, [key]: text } }));
    saveDraft();
  };

  // The backend has no per-caption rewrite, so this re-runs generation with the
  // same brief and event and keeps only this platform's new caption.
  const rewriteCaption = (key: string) =>
    run(`rewrite-${key}`, async () => {
      notify("captions", null);
      try {
        const data = await requestCampaign(campaign?.detected_event || form.eventContext);
        const text = data.success ? data.ads?.[key] : undefined;
        if (text) setCaption(key, text);
        else notify("captions", { kind: "error", text: `Could not rewrite the caption: ${data.error ?? "no caption returned"}` });
      } catch (e) {
        notify("captions", { kind: "error", text: `Something went wrong rewriting the caption: ${(e as Error).message}` });
      }
    });

  const onGenerate = () =>
    run("generate", async () => {
      if (!form.companyName.trim()) {
        notify("generate", { kind: "error", text: "Please enter the company name." });
        return;
      }
      if (!s.platforms.length) {
        notify("generate", { kind: "error", text: "Pick at least one platform." });
        return;
      }
      notify("generate", null);
      let data: Campaign;
      try {
        data = await requestCampaign(form.eventContext);
      } catch (e) {
        notify("generate", { kind: "error", text: `Something went wrong talking to the backend: ${(e as Error).message}` });
        return;
      }
      if (data.exhausted) {
        notify("generate", { kind: "error", text: `All text generation providers are exhausted: ${data.error}` });
      } else if (data.success) {
        setCampaign(data);
        set({ tab: "review" });
        saveDraft();
        setBusy("generate-image");
        await generateImage(data);
      } else {
        notify("generate", { kind: "error", text: `Error: ${data.error}` });
      }
    });

  return (
    <>
      {s.tab !== "generate" && campaign ? (
        <PageHeader
          eyebrow="Create · Ad Studio"
          title={campaign.ads?.image_headline || companyName}
          subtitle={s.tab === "review"
            ? `${companyName} · Draft saved automatically`
            : "Generate the ad image, then publish or download."}
          actions={s.tab === "review" ? (
            <>
              <Button onClick={() => set({ tab: "generate" })}>Edit brief</Button>
              <Button variant="primary" onClick={() => set({ tab: "publish" })}>Continue to image</Button>
            </>
          ) : (
            <Button onClick={() => set({ tab: "review" })}>Back to copy</Button>
          )}
        />
      ) : (
        <PageHeader
          eyebrow="Create"
          title="Ad Studio"
          subtitle="Research a company, tie the campaign to a real event, and generate ad copy and images."
        />
      )}
      <Stepper
        steps={[
          { id: "generate", label: "Brief" },
          { id: "review", label: "Review copy", disabled: !campaign },
          { id: "publish", label: "Image & publish", disabled: !campaign },
        ]}
        active={s.tab}
        onChange={(tab) => set({ tab })}
      />

      {s.tab === "generate" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card title="Campaign brief" subtitle="Only the company name is required. Everything else sharpens the result.">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                onGenerate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Company website" placeholder="https://www.agfintax.com/"
                  value={form.companyUrl} onChange={(v) => setForm({ companyUrl: v })} />
                <TextInput label="Company name *" placeholder="AGFinTax"
                  value={form.companyName} onChange={(v) => setForm({ companyName: v })} />
              </div>
              <TextArea label="What does the company do?" placeholder="Auto-filled from the website if left blank"
                value={form.productDescription} onChange={(v) => setForm({ productDescription: v })} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextArea label="Ad idea or angle" placeholder="e.g. Year-end tax moves for small business owners"
                  value={form.adIdea} onChange={(v) => setForm({ adIdea: v })} />
                <div className="space-y-2.5">
                  <TextInput label="Current event to connect to" placeholder="Leave blank and AI picks a trending event"
                    value={form.eventContext} onChange={(v) => setForm({ eventContext: v })} />
                  <div className="flex flex-wrap gap-2">
                    {EVENT_SUGGESTIONS.map((ev) => (
                      <button key={ev} type="button" onClick={() => setForm({ eventContext: ev })}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          form.eventContext === ev
                            ? "border-accent/40 bg-accent/10 text-accent"
                            : "border-line bg-canvas text-navy hover:border-navy/30"
                        }`}>
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-navy">Platforms</legend>
                <div className="flex flex-wrap gap-3">
                  {PLATFORMS.map((p) => (
                    <label key={p.key}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-navy transition-colors hover:border-navy/30">
                      <input type="checkbox" className="size-4 accent-accent"
                        checked={s.platforms.includes(p.key)}
                        onChange={(e) => set((st) => ({
                          platforms: e.target.checked
                            ? PLATFORMS.map((x) => x.key as string).filter((k) => k === p.key || st.platforms.includes(k))
                            : st.platforms.filter((k) => k !== p.key),
                        }))} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextInput
                label="Call-to-action URL"
                placeholder="https://www.agfintax.com/contact/"
                hint="Printed as plain text on the image. Leave blank to use the website URL."
                value={form.contactUrl}
                onChange={(v) => setForm({ contactUrl: v })}
              />
              <NoticeLine notice={notices.generate ?? null} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button onClick={() => {
                  saveDraft();
                  notify("generate", { kind: "success", text: "Draft saved." });
                }}>
                  Save draft
                </Button>
                <Button type="submit" variant="primary" icon={Zap}
                  loading={busy === "generate" || busy === "generate-image"}>
                  {busy === "generate-image" ? "Generating ad image…" : busy === "generate"
                    ? "Researching and writing…" : "Generate campaign"}
                </Button>
              </div>
            </form>
          </Card>

          <aside className="space-y-6">
            <BrandProfileCard brand={s.brand} onSave={saveBrand} />
            <SideCard title="What happens next">
              <ol className="list-decimal space-y-2 pl-4 text-sm text-ink marker:text-muted">
                <li>We research the company and find a relevant current event.</li>
                <li>You review and edit captions for each platform.</li>
                <li>Generate the ad image, then publish or download.</li>
              </ol>
            </SideCard>
            <RecentDrafts drafts={s.drafts} activeId={s.draftId} onOpen={loadDraft} onDelete={deleteDraft} />
          </aside>
        </div>
      )}

      {s.tab === "review" && (
        !campaign ? (
          <Alert>Generate a campaign from the <strong>Brief</strong> step first.</Alert>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className={`rounded-xl border border-ocean/15 bg-tint p-5 ${campaign.quality_score ? "" : "lg:col-span-2"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-navy/70">Event used</div>
                  <button
                    type="button"
                    disabled={busy === "retry"}
                    onClick={() =>
                      run("retry", async () => {
                        try {
                          const data = await callApi<Campaign>("ad", "retry-event", {
                            company_name: companyName,
                            company_url: form.companyUrl,
                          });
                          if (data.success) {
                            setCampaign(data);
                            saveDraft();
                            notify("retry", null);
                          } else {
                            notify("retry", { kind: "error", text: `Could not get a new event: ${data.error}` });
                          }
                        } catch (e) {
                          notify("retry", { kind: "error", text: `Something went wrong retrying the event: ${(e as Error).message}` });
                        }
                      })
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-navy/20 bg-white/70 px-3 py-1 text-xs font-semibold text-navy hover:bg-white disabled:opacity-60"
                  >
                    <RefreshCw className={`size-3.5 ${busy === "retry" ? "animate-spin" : ""}`} aria-hidden />
                    {busy === "retry" ? "Finding a new event…" : "Try another event"}
                  </button>
                </div>
                <p className="mt-2 text-[15px] font-medium leading-relaxed text-navy">
                  {campaign.detected_event || "No specific event was used."}
                </p>
              </section>
              {!!campaign.quality_score && (
                <section className="flex items-center gap-5 rounded-xl border border-line bg-white p-5 shadow-sm">
                  <div className="shrink-0 text-center">
                    <div className={`font-display text-4xl font-extrabold ${scoreColor(campaign.quality_score)}`}>
                      {campaign.quality_score}/10
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Quality</div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{campaign.quality_reason}</p>
                </section>
              )}
            </div>
            <NoticeLine notice={notices.retry ?? null} />

            {Object.keys(details).length > 0 && (
              <Expander title="Company details used in generation" icon={Building2}>
                <DataTable rows={DETAIL_FIELDS.map(([label, field]) => ({ Field: label, Value: details[field] || "—" }))} />
              </Expander>
            )}

            <CaptionsPanel
              platforms={PLATFORMS.filter((p) => s.platforms.includes(p.key))}
              captions={s.captions}
              busy={busy}
              notice={notices.captions ?? null}
              onChange={setCaption}
              onRewrite={rewriteCaption}
            />
          </div>
        )
      )}

      {s.tab === "publish" && (
        !campaign ? (
          <Alert>Generate a campaign from the <strong>Brief</strong> step first.</Alert>
        ) : (
          <div className="space-y-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <ImageCard
                image={s.image}
                providerFailed={s.providerFailed}
                busy={busy === "generate-image" ? "image" : busy}
                notice={notices.image ?? null}
                background={s.brand.colors[0] ?? DEFAULT_BRAND.colors[0]}
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
              <aside className="space-y-6">
                <PublishCard
                  imageUrl={s.image?.clean_image_url ?? null}
                  captions={s.captions}
                  platforms={s.platforms}
                  onLinkedInPosted={(urn) => set({ linkedinPostUrn: urn })}
                />
                <NotPostingCard
                  image={s.image}
                  captionsFile={captionsFile(PLATFORMS.filter((p) => s.platforms.includes(p.key)), s.captions)}
                  onSave={saveDraft}
                />
              </aside>
            </div>
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

const captionsFile = (platforms: readonly { key: string; label: string }[], captions: Record<string, string>) =>
  platforms.map((p) => `${p.label}\n${"-".repeat(p.label.length)}\n${captions[p.key] ?? ""}`).join("\n\n");

const hashtags = (text: string) => [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];

function CaptionsPanel({ platforms, captions, busy, notice, onChange, onRewrite }: {
  platforms: readonly (typeof PLATFORMS)[number][];
  captions: Record<string, string>;
  busy: string | null;
  notice: Notice;
  onChange: (key: string, text: string) => void;
  onRewrite: (key: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const active = platforms.find((p) => p.key === selected) ?? platforms[0];
  if (!active) return <Alert>No platforms selected — pick at least one in the brief.</Alert>;
  const text = captions[active.key] ?? "";
  const rewriting = busy === `rewrite-${active.key}`;

  return (
    <section className="grid overflow-hidden rounded-xl border border-line bg-white shadow-sm md:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="border-b border-line bg-canvas/60 p-3 md:border-r md:border-b-0">
        <div className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Platform captions</div>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {platforms.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => setSelected(p.key)}
                aria-current={p.key === active.key ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                  p.key === active.key ? "bg-white font-semibold text-navy shadow-sm" : "text-ink hover:bg-white/70"
                }`}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{active.label} caption</h2>
          <span className="text-xs text-muted">Your edits are what gets downloaded and posted</span>
        </div>
        <textarea
          aria-label={`${active.label} caption`}
          rows={7}
          value={text}
          disabled={rewriting}
          onChange={(e) => onChange(active.key, e.target.value)}
          className="w-full rounded-lg border border-line px-3.5 py-3 text-sm leading-relaxed focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/20 disabled:bg-canvas"
        />
        <div className="flex flex-wrap items-center gap-2">
          {hashtags(text).map((tag) => (
            <span key={tag} className="rounded-md bg-canvas px-2 py-1 text-xs font-medium text-navy">{tag}</span>
          ))}
          <div className="ml-auto flex gap-2">
            <Button loading={rewriting} disabled={!!busy && !rewriting} onClick={() => onRewrite(active.key)}>
              {rewriting ? "Rewriting…" : "Rewrite"}
            </Button>
            <Button onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard blocked: nothing to do, the text is still selectable.
              }
            }}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => downloadText(`${active.key}_caption.txt`, text)}>Download</Button>
          </div>
        </div>
        <NoticeLine notice={notice} />
        <div className="flex flex-col gap-3 rounded-lg bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted">Happy with every caption? Download them all as one file.</span>
          <Button onClick={() => downloadText("captions.txt", captionsFile(platforms, captions))}>
            Download all captions
          </Button>
        </div>
      </div>
    </section>
  );
}

function SideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkButton = "text-sm font-semibold text-accent hover:text-accent-dark";

function BrandProfileCard({ brand, onSave }: { brand: Brand; onSave: (b: Brand) => void }) {
  const [edit, setEdit] = useState<Brand | null>(null);
  const label = "text-[11px] font-bold uppercase tracking-wider text-muted";

  if (edit) {
    return (
      <SideCard title="Brand profile">
        <div className="space-y-3">
          <TextInput label="Tone" value={edit.tone} onChange={(tone) => setEdit({ ...edit, tone })} />
          <TextInput label="Audience" value={edit.audience} onChange={(audience) => setEdit({ ...edit, audience })} />
          <div>
            <div className="mb-1.5 text-sm font-medium text-navy">Colors</div>
            <div className="flex gap-2">
              {edit.colors.map((c, i) => (
                <input key={i} type="color" value={c} aria-label={`Brand color ${i + 1}`}
                  onChange={(e) => setEdit({ ...edit, colors: edit.colors.map((x, j) => (j === i ? e.target.value : x)) })}
                  className="size-8 cursor-pointer rounded border border-line bg-white p-0.5" />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              onSave(edit);
              setEdit(null);
            }}>
              Save
            </Button>
          </div>
        </div>
      </SideCard>
    );
  }

  return (
    <SideCard title="Brand profile" action={<button type="button" className={linkButton} onClick={() => setEdit(brand)}>Edit</button>}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className={label}>Tone</dt>
          <dd className="mt-0.5 text-ink">{brand.tone || "—"}</dd>
        </div>
        <div>
          <dt className={label}>Audience</dt>
          <dd className="mt-0.5 text-ink">{brand.audience || "—"}</dd>
        </div>
        <div>
          <dt className={label}>Colors</dt>
          <dd className="mt-1.5 flex gap-1.5">
            {brand.colors.map((c, i) => (
              <span key={i} className="size-5 rounded border border-black/10" style={{ background: c }} title={c} />
            ))}
          </dd>
        </div>
      </dl>
    </SideCard>
  );
}

function RecentDrafts({ drafts, activeId, onOpen, onDelete }: {
  drafts: SavedDraft[];
  activeId: string | null;
  onOpen: (d: SavedDraft) => void;
  onDelete: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? drafts : drafts.slice(0, 3);
  return (
    <SideCard
      title="Recent drafts"
      action={drafts.length > 3 && (
        <button type="button" className={linkButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Less" : "All"}
        </button>
      )}
    >
      {!drafts.length ? (
        <p className="text-sm text-muted">Saved and generated campaigns show up here.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {shown.map((d) => (
            <li key={d.id} className="group flex items-start gap-1">
              <button type="button" onClick={() => onOpen(d)}
                className={`min-w-0 flex-1 rounded-md px-2 py-2.5 text-left hover:bg-canvas ${d.id === activeId ? "bg-tint/60" : ""}`}>
                <div className="truncate text-sm font-semibold text-navy">{draftTitle(d)}</div>
                <div className="truncate text-xs text-muted">{draftEvent(d)}</div>
              </button>
              <button type="button" aria-label="Delete draft" onClick={() => onDelete(d.id)}
                className="mt-2.5 rounded p-1 text-muted opacity-0 hover:bg-canvas hover:text-danger focus:opacity-100 group-hover:opacity-100">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SideCard>
  );
}

const RATIOS = {
  "4:5": { size: [4, 5], frame: "aspect-[4/5] max-w-sm" },
  "1:1": { size: [1, 1], frame: "aspect-square max-w-sm" },
  "9:16": { size: [9, 16], frame: "aspect-[9/16] max-w-[290px]" },
} as const;
type Ratio = keyof typeof RATIOS;

// The backend renders one size; other ratios are produced by fitting the whole
// image (nothing cropped) onto a canvas filled with the brand background.
async function framedImage(src: string, ratio: Ratio, background: string): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const [w, h] = RATIOS[ratio].size;
  const { naturalWidth: iw, naturalHeight: ih } = img;
  const [cw, ch] = iw / ih > w / h ? [iw, Math.round((iw * h) / w)] : [Math.round((ih * w) / h), ih];
  const canvas = Object.assign(document.createElement("canvas"), { width: cw, height: ch });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, Math.round((cw - iw) / 2), Math.round((ch - ih) / 2));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not export the image."))), "image/png"),
  );
}

const imageName = (image: AdImage) => image.clean_image_url.split("/").pop() || "ad-image.png";

function ImageCard({ image, providerFailed, busy, notice, background, onGenerate, onSwitchProvider }: {
  image: AdImage | null;
  providerFailed: ProviderFailed | null;
  busy: string | null;
  notice: Notice;
  background: string;
  onGenerate: (customPrompt: string) => void;
  onSwitchProvider: (p: ProviderFailed) => void;
}) {
  const [ratio, setRatio] = useState<Ratio>("4:5");
  const [useCustom, setUseCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(image?.prompt ?? "");
  const [downloadError, setDownloadError] = useState<Notice>(null);
  const src = image ? `/api/ad${image.clean_image_url}` : null;
  const generating = busy === "image";

  async function download() {
    if (!image || !src) return;
    setDownloadError(null);
    try {
      const blob = await framedImage(src, ratio, background);
      downloadBlob(imageName(image).replace(/\.\w+$/, "") + `_${ratio.replace(":", "x")}.png`, blob);
    } catch (e) {
      setDownloadError({ kind: "error", text: `Could not download the image: ${(e as Error).message}` });
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Ad image</h2>
        <div className="inline-flex rounded-md border border-line bg-canvas p-0.5" role="group" aria-label="Aspect ratio">
          {(Object.keys(RATIOS) as Ratio[]).map((r) => (
            <button key={r} type="button" aria-pressed={r === ratio} onClick={() => setRatio(r)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                r === ratio ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={`relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-lg ${RATIOS[ratio].frame}`}
        style={{ background: src ? background : undefined }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated on the backend, served via our proxy
          <img src={src} alt="Generated ad" className={`size-full object-contain ${generating ? "opacity-40" : ""}`} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 border border-dashed border-line bg-canvas text-sm text-muted">
            <Sparkles className={`size-6 ${generating ? "animate-pulse text-accent" : ""}`} aria-hidden />
            {generating ? "Generating your ad image…" : "No image yet"}
          </div>
        )}
        {src && generating && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
            Generating a new image…
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="primary" icon={Sparkles} className="flex-1" loading={generating}
          onClick={() => onGenerate(useCustom ? customPrompt : "")}>
          {generating ? "Generating image…" : image ? "Regenerate image" : "Generate image"}
        </Button>
        <Button icon={Download} disabled={!image || generating} onClick={download}>Download</Button>
      </div>
      {image && <p className="text-xs text-muted">Image model: {image.provider ?? "openai_image"}</p>}
      <NoticeLine notice={notice ?? downloadError} />
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
      {image?.prompt && (
        <Expander title="Background prompt used (AI-written)" icon={History}>
          <pre className="whitespace-pre-wrap text-xs text-ink">{image.prompt}</pre>
        </Expander>
      )}
    </section>
  );
}

// Platforms the backend can post to; the rest can only be downloaded.
const POST_TARGETS = ["instagram", "facebook", "linkedin"] as const;

type PostState = { status: "posting" | "posted" | "failed"; error?: string };

function PublishCard({ imageUrl, captions, platforms, onLinkedInPosted }: {
  imageUrl: string | null;
  captions: Record<string, string>;
  platforms: string[];
  onLinkedInPosted: (urn: string) => void;
}) {
  const targets = PLATFORMS.filter((p) => (POST_TARGETS as readonly string[]).includes(p.key) && platforms.includes(p.key));
  const unsupported = PLATFORMS.filter((p) => !(POST_TARGETS as readonly string[]).includes(p.key) && platforms.includes(p.key));
  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});
  const [states, setStates] = useState<Record<string, PostState>>({});
  const [busy, setBusy] = useState(false);
  const ready = (key: string) => !!imageUrl && !!captions[key]?.trim();
  const chosen = targets.filter((t) => !unchecked[t.key] && ready(t.key) && states[t.key]?.status !== "posted");

  async function publish() {
    setBusy(true);
    for (const t of chosen) {
      setStates((x) => ({ ...x, [t.key]: { status: "posting" } }));
      try {
        const r = await callApi<Dict>("ad", `post-to-${t.key}`, { caption: captions[t.key] ?? "", image_url: imageUrl });
        if (r.success) {
          if (t.key === "linkedin" && r.post_id) onLinkedInPosted(String(r.post_id));
          setStates((x) => ({ ...x, [t.key]: { status: "posted" } }));
        } else {
          setStates((x) => ({ ...x, [t.key]: { status: "failed", error: String(r.error) } }));
        }
      } catch (e) {
        setStates((x) => ({ ...x, [t.key]: { status: "failed", error: (e as Error).message } }));
      }
    }
    setBusy(false);
  }

  const badge = (key: string) => {
    const st = states[key]?.status;
    if (st === "posting") return <span className="text-xs font-semibold text-muted">Posting…</span>;
    if (st === "posted") return <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Posted</span>;
    if (st === "failed") return <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Failed</span>;
    if (!imageUrl) return <span className="text-xs text-muted">Needs image</span>;
    if (!captions[key]?.trim()) return <span className="text-xs text-muted">No caption</span>;
    return <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Ready</span>;
  };

  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Publish</h2>
      <p className="mt-1 text-sm text-muted">Pick the accounts to post to. Each uses its own caption.</p>

      <ul className="mt-4 space-y-2.5">
        {targets.map((t) => {
          const st = states[t.key];
          const disabled = !ready(t.key) || st?.status === "posted" || busy;
          return (
            <li key={t.key} className="rounded-lg border border-line px-3.5 py-3">
              <label className={`flex items-center gap-3 ${disabled ? "" : "cursor-pointer"}`}>
                <input type="checkbox" className="size-4 shrink-0 accent-accent" disabled={disabled}
                  checked={!unchecked[t.key] && ready(t.key) && st?.status !== "posted"}
                  onChange={(e) => setUnchecked((x) => ({ ...x, [t.key]: !e.target.checked }))} />
                <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-navy">{t.label}</span>
                  <span className="block truncate text-xs text-muted">{captions[t.key]?.trim() || "—"}</span>
                </span>
                {badge(t.key)}
              </label>
              {st?.status === "failed" && <p className="mt-2 text-xs text-danger">{st.error}</p>}
            </li>
          );
        })}
        {unsupported.length > 0 && (
          <li className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3.5 py-3"
            title="Posting to these isn't supported yet; download the image and captions instead.">
            <input type="checkbox" disabled className="size-4 shrink-0" aria-label="Not available" />
            <span className="flex-1 text-sm text-muted">{unsupported.map((p) => p.label).join(" · ")}</span>
            <span className="text-xs font-semibold text-muted">Coming soon</span>
          </li>
        )}
      </ul>

      <div className="mt-5">
        <div className="mb-2 text-sm font-medium text-navy">When</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border-2 border-navy px-3.5 py-2.5 text-sm font-semibold text-navy">
            <span className="flex size-4 items-center justify-center rounded-full border-2 border-accent">
              <span className="size-1.5 rounded-full bg-accent" />
            </span>
            Post now
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-2.5 text-sm text-muted"
            title="Scheduling isn't supported by the backend yet">
            <span className="size-4 rounded-full border-2 border-line" />
            Schedule
            <span className="ml-auto rounded bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Soon</span>
          </div>
        </div>
      </div>

      <Button variant="primary" icon={Send} block className="mt-5" loading={busy} disabled={!chosen.length}
        onClick={publish}>
        {busy ? "Publishing…" : `Publish to ${chosen.length} account${chosen.length === 1 ? "" : "s"}`}
      </Button>
      {!imageUrl && <p className="mt-2 text-center text-xs text-muted">Generate the ad image first.</p>}
    </section>
  );
}

function NotPostingCard({ image, captionsFile, onSave }: {
  image: AdImage | null;
  captionsFile: string;
  onSave: () => void;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function downloadPackage() {
    setBusy(true);
    setNotice(null);
    try {
      const files = [{ name: "captions.txt", data: new TextEncoder().encode(captionsFile) }];
      if (image) {
        const res = await fetch(`/api/ad${image.clean_image_url}`);
        if (!res.ok) throw new Error(`image download failed (${res.status})`);
        files.unshift({ name: imageName(image), data: new Uint8Array(await res.arrayBuffer()) });
      }
      downloadBlob("ad-package.zip", zip(files));
    } catch (e) {
      setNotice({ kind: "error", text: `Could not build the package: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SideCard title="Not posting yet?">
      <p className="text-sm text-muted">Save it to your drafts or download the image and captions as one package.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => {
          onSave();
          setNotice({ kind: "success", text: "Saved to Recent drafts." });
        }}>
          Save to drafts
        </Button>
        <Button loading={busy} onClick={downloadPackage}>Download package</Button>
      </div>
      {notice && <div className="mt-3"><NoticeLine notice={notice} /></div>}
    </SideCard>
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
              // The format the backend expects: %Y-%m-%dT%H:%M:%S%z in UTC.
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
