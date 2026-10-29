"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Building2, ChevronDown, FileText, Pause, RefreshCw, Rocket, Send, Settings2, Users, Wallet, X, Zap,
} from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { zip } from "@/lib/zip";
import {
  EMPTY_FLYER, FieldGrid, FlyerCard, FlyerPreviewCard, TemplatePicker, detailFields, fieldError, fieldsFor,
  flyerErrors, flyerFields, flyerKey, imageName,
  type AdImage, type FlyerConfig, type FlyerField, type FlyerState, type FlyerTemplateId, type ProviderFailed,
} from "./flyer-studio";
import {
  Alert, Button, Card, ChipSelect, DataTable, Expander, Metric, NumberInput, PageHeader, Select,
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
  // The flyer template the captions were written for (set by this page).
  _template?: FlyerTemplateId;
};
type Draft = Dict & { _daily_budget: number; _days: number };
type TabId = "generate" | "review" | "publish";
type Notice = { kind: "success" | "error" | "warning"; text: string } | null;
type Form = { companyUrl: string; companyName: string; productDescription: string; adIdea: string; eventContext: string; contactUrl: string };
// details: the flyers' speaker/contact text (speaker_name, contact_email, ...);
// an empty or missing value means the template's approved default.
type Brand = { tone: string; audience: string; colors: string[]; details?: Record<string, string> };
type SavedDraft = {
  id: string;
  savedAt: number;
  form: Form;
  platforms: string[];
  campaign: Campaign | null;
  captions: Record<string, string>;
  image: AdImage | null;
  // Flyer template and per-template inputs; kept even before an image exists.
  flyer?: FlyerState;
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

/** Prefills the Generic template's headline from the campaign's. */
function withGenericTopic(flyer: FlyerState, c: Campaign | null): FlyerState {
  const topic = c?.ads?.image_headline;
  if (!topic) return flyer;
  return { ...flyer, values: { ...flyer.values, generic: { ...flyer.values.generic, topic } } };
}

/** The selected template's inputs plus the Brand profile's speaker/contact text. */
function flyerInputs(flyer: FlyerState, brand: Brand): Record<string, string> {
  const details = Object.fromEntries(Object.entries(brand.details ?? {}).filter(([, v]) => v.trim()));
  return { ...flyer.values[flyer.template], ...details };
}

function formatWhen(date: string, time: string, zone: string) {
  const day = new Date(`${date}T00:00`).toLocaleDateString("en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const [h, m] = time.split(":").map(Number);
  const clock = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
  return `${day}, ${clock} ${zone}`;
}

/** What the caption writer gets for the selected template. Service and
 * Webinar pass their own topic as the event, so no trending event is picked,
 * and the captions mention the same date and link as the flyer. */
function campaignBrief(config: FlyerConfig | null, flyer: FlyerState, brand: Brand, form: Form) {
  const t = flyer.template;
  if (!config || t === "generic") return { ad_idea: form.adIdea, event_context: form.eventContext };
  const v = flyerFields(config, t, flyerInputs(flyer, brand));
  const extra = (v.message || v.description || "").replace(/\s+/g, " ").trim();
  if (t === "service") {
    return {
      ad_idea: `Service promotion: ${v.topic}. ${extra} Call to action link: ${v.qr_url}`,
      event_context: `Service promotion: ${v.topic}`,
    };
  }
  const zone = config.timezones.find((z) => z.key === v.timezone)?.label ?? v.timezone;
  const when = formatWhen(v.date, v.time, zone);
  return {
    ad_idea: `Free live webinar: "${v.topic}". ${extra} When: ${when}. Speaker: ${v.speaker_name}, ${v.speaker_title}. `
      + `Registration link: ${v.qr_url}`,
    event_context: `Free live webinar on ${when}: ${v.topic}`,
  };
}

const draftTitle = (d: SavedDraft) =>
  d.campaign?.ads?.image_headline || (d.flyer && d.flyer.template !== "generic" && d.flyer.values[d.flyer.template].topic)
  || d.form.adIdea || d.form.companyName || "Untitled draft";
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
  flyer: EMPTY_FLYER as FlyerState,
  providerFailed: null as ProviderFailed | null,
  linkedinPostUrn: null as string | null,
  facebookAdDraft: null as Draft | null,
  linkedinAdDraft: null as Draft | null,
});

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
    flyer: st.flyer,
  };
  const drafts = [draft, ...st.drafts.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);
  writeLocal(LS_DRAFTS, drafts);
  store.set({ drafts, draftId: draft.id });
}

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
        brand: { ...DEFAULT_BRAND, ...readLocal<Partial<Brand>>(LS_BRAND, {}) },
      }));
    }
  }, [defaults]);

  // The flyer templates (fields, saved assets) come from the backend.
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig | null>(null);
  const [flyerConfigError, setFlyerConfigError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    callApi<FlyerConfig & { success?: boolean; error?: string }>("ad", "flyer-templates").then(
      (r) => (r.success ? setFlyerConfig(r) : setFlyerConfigError(r.error || "unknown error")),
      (e: Error) => setFlyerConfigError(e.message),
    );
  }, []);

  function loadDraft(d: SavedDraft) {
    set({
      form: d.form,
      platforms: d.platforms,
      campaign: d.campaign,
      captions: d.captions,
      image: d.image,
      flyer: d.flyer ?? withGenericTopic(EMPTY_FLYER, d.campaign),
      providerFailed: null,
      draftId: d.id,
      tab: d.campaign ? "review" : "generate",
    });
    setNotices({});
    setFieldErrors({});
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

  const { form, campaign, flyer } = s;
  const template = flyer.template;
  const inputs = flyerInputs(flyer, s.brand);
  const setForm = (patch: Partial<typeof form>) => set((st) => ({ form: { ...st.form, ...patch } }));
  const details = campaign?.company_details ?? {};
  const companyName = campaign?.detected_company_name ?? form.companyName;
  // Service and Webinar have one link, used for the QR and the captions.
  const effectiveContactUrl = (c: Campaign | null = campaign) =>
    (template !== "generic" && flyerConfig ? flyerFields(flyerConfig, template, inputs).qr_url : "")
    || form.contactUrl.trim() || form.companyUrl.trim() || String(c?.website_url ?? "").trim();

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const setFlyerValue = (key: string, value: string) => {
    set((st) => {
      const t = st.flyer.template;
      return { flyer: { ...st.flyer, values: { ...st.flyer.values, [t]: { ...st.flyer.values[t], [key]: value } } } };
    });
    setFieldErrors((errors) => Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key)));
  };

  async function generateFlyer() {
    const { brand, flyer: f, campaign: c } = store.get();
    if (!flyerConfig || !c) return;
    const t = f.template;
    const values = flyerInputs(f, brand);
    const errors = flyerErrors(flyerConfig, t, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const inBrand = detailFields(flyerConfig).some((d) => errors[d.key]);
      notify("image", { kind: "error", text: inBrand
        ? "Check the speaker and contact details in the Brand profile (Brief step)."
        : "Some details need fixing first." });
      return;
    }
    notify("image", null);
    const cDetails = c.company_details ?? {};
    const inputsKey = flyerKey(flyerConfig, t, values);
    try {
      const data = await callApi<Dict>("ad", "generate-flyer", {
        template: t,
        fields: flyerFields(flyerConfig, t, values),
        // Context for the Generic template's existing topic flow.
        campaign: {
          company_name: c.detected_company_name ?? form.companyName,
          instagram_copy: c.ads?.instagram ?? "",
          image_headline: c.ads?.image_headline ?? "",
          event_context: c.detected_event ?? "",
          company_details: {
            ...cDetails,
            brand_tone: brand.tone || cDetails.brand_tone,
            target_audience: brand.audience || cDetails.target_audience,
          },
        },
      });
      if (data.success && typeof data.clean_image_url === "string") {
        set({
          image: {
            clean_image_url: data.clean_image_url,
            provider: data.provider as string | undefined,
            prompt: data.prompt as string | undefined,
            template: t,
            inputsKey,
          },
          providerFailed: null,
        });
        saveDraft();
      } else if (data.field_errors) {
        setFieldErrors(data.field_errors as Record<string, string>);
        notify("image", { kind: "error", text: "Some details need fixing first." });
      } else if (data.provider_failed) {
        set({ providerFailed: data as unknown as ProviderFailed });
      } else {
        set({ providerFailed: null });
        notify("image", { kind: "error", text: `Flyer error: ${data.error}` });
      }
    } catch (e) {
      notify("image", { kind: "error", text: `Something went wrong generating the flyer: ${(e as Error).message}` });
    }
  }

  const setCampaign = (data: Campaign, t: FlyerTemplateId) =>
    set((st) => ({
      campaign: { ...data, _template: t },
      image: null,
      captions: { ...(data.ads ?? {}) },
      flyer: withGenericTopic(st.flyer, data),
    }));

  const requestCampaign = (eventOverride?: string) => {
    const brief = campaignBrief(flyerConfig, flyer, s.brand, form);
    return callApi<Campaign>("ad", "generate", {
      company_name: form.companyName,
      product_description: form.productDescription,
      ad_idea: brief.ad_idea,
      event_context: (eventOverride ?? brief.event_context) || null,
      company_url: form.companyUrl || null,
    });
  };

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
        const data = await requestCampaign(campaign?.detected_event || undefined);
        const text = data.success ? data.ads?.[key] : undefined;
        if (text) setCaption(key, text);
        else notify("captions", { kind: "error", text: `Could not rewrite the caption: ${data.error ?? "no caption returned"}` });
      } catch (e) {
        notify("captions", { kind: "error", text: `Something went wrong rewriting the caption: ${(e as Error).message}` });
      }
    });

  const [companyOpen, setCompanyOpen] = useState(false);
  const briefFields = flyerConfig ? fieldsFor(flyerConfig, template, "brief") : [];

  const onGenerate = () =>
    run("generate", async () => {
      if (!form.companyName.trim()) {
        setCompanyOpen(true);
        notify("generate", { kind: "error", text: "Please enter the company name under Company." });
        return;
      }
      if (!s.platforms.length) {
        notify("generate", { kind: "error", text: "Pick at least one platform." });
        return;
      }
      if (flyerConfig) {
        const errors = flyerErrors(flyerConfig, template, inputs, briefFields);
        setFieldErrors(errors);
        if (Object.keys(errors).length) {
          notify("generate", { kind: "error", text: "Fill in the highlighted fields first." });
          return;
        }
      }
      notify("generate", null);
      let data: Campaign;
      try {
        data = await requestCampaign();
      } catch (e) {
        notify("generate", { kind: "error", text: `Something went wrong talking to the backend: ${(e as Error).message}` });
        return;
      }
      if (data.exhausted) {
        notify("generate", { kind: "error", text: `All text generation providers are exhausted: ${data.error}` });
      } else if (data.success) {
        setCampaign(data, template);
        set({ tab: "review" });
        saveDraft();
      } else {
        notify("generate", { kind: "error", text: `Error: ${data.error}` });
      }
    });

  // The generated flyer, only while it still matches the selected template
  // and its inputs; publishing and downloading use nothing else.
  const readyImage = s.image && flyerConfig && s.image.template === template
    && s.image.inputsKey === flyerKey(flyerConfig, template, inputs)
    ? s.image : null;
  // Captions are written for one template; switching after that needs a rerun.
  const captionsMismatch = !!campaign?._template && campaign._template !== template && flyerConfig
    ? `The captions were written for the ${flyerConfig.templates[campaign._template].label} template. `
      + "Generate the campaign again from the Brief to match the selected template."
    : null;
  // The Generic sample shows the ad idea until the AI writes a headline.
  const previewValues = template === "generic" && !inputs.topic?.trim() ? { ...inputs, topic: form.adIdea } : inputs;

  return (
    <>
      {s.tab !== "generate" && campaign ? (
        <PageHeader
          eyebrow="Create · Ad Studio"
          title={campaign.ads?.image_headline || companyName}
          subtitle={s.tab === "review"
            ? `${companyName} · Draft saved automatically`
            : "Generate the flyer, then publish or download."}
          actions={s.tab === "review" ? (
            <>
              <Button onClick={() => set({ tab: "generate" })}>Edit brief</Button>
              <Button variant="primary" onClick={() => set({ tab: "publish" })}>Continue to flyer</Button>
            </>
          ) : (
            <Button onClick={() => set({ tab: "review" })}>Back to copy</Button>
          )}
        />
      ) : (
        <PageHeader
          eyebrow="Create"
          title="Ad Studio"
          subtitle="Pick what you're creating, fill in the details, and get captions and a flyer."
        />
      )}
      <Stepper
        steps={[
          { id: "generate", label: "Brief" },
          { id: "review", label: "Review copy", disabled: !campaign },
          { id: "publish", label: "Flyer & publish", disabled: !campaign },
        ]}
        active={s.tab}
        onChange={(tab) => set({ tab })}
      />

      {s.tab === "generate" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card title="Campaign brief" subtitle="Pick what you're creating, then fill in the details.">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                onGenerate();
              }}
            >
              {flyerConfig ? (
                <TemplatePicker config={flyerConfig} template={template} onChange={(t) => {
                  set((st) => ({ flyer: { ...st.flyer, template: t } }));
                  setFieldErrors({});
                }} />
              ) : flyerConfigError ? (
                <Alert kind="error">Could not load the flyer templates: {flyerConfigError}</Alert>
              ) : (
                <p className="text-sm text-muted">Loading templates…</p>
              )}

              {template === "generic" ? (
                <>
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
                  <TextInput
                    label="Call-to-action URL"
                    placeholder="https://www.agfintax.com/contact/"
                    hint="Used in the captions. Leave blank to use the website URL."
                    value={form.contactUrl}
                    onChange={(v) => setForm({ contactUrl: v })}
                  />
                </>
              ) : flyerConfig && (
                <FieldGrid fields={briefFields} values={inputs} errors={fieldErrors}
                  timezones={flyerConfig.timezones} onChange={setFlyerValue} />
              )}

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

              <CompanySection form={form} setForm={setForm} open={companyOpen} setOpen={setCompanyOpen} />

              <NoticeLine notice={notices.generate ?? null} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button onClick={() => {
                  saveDraft();
                  notify("generate", { kind: "success", text: "Draft saved." });
                }}>
                  Save draft
                </Button>
                <Button type="submit" variant="primary" icon={Zap} loading={busy === "generate"}>
                  {busy === "generate" ? "Researching and writing…" : "Generate campaign"}
                </Button>
              </div>
            </form>
          </Card>

          <aside className="space-y-6">
            {flyerConfig && <FlyerPreviewCard config={flyerConfig} template={template} values={previewValues} />}
            <BrandProfileCard brand={s.brand} detailFields={flyerConfig ? detailFields(flyerConfig) : []} onSave={saveBrand} />
            <RecentDrafts drafts={s.drafts} activeId={s.draftId} onOpen={loadDraft} onDelete={deleteDraft} />
          </aside>
        </div>
      )}

      {s.tab === "review" && (
        !campaign ? (
          <Alert>Generate a campaign from the <strong>Brief</strong> step first.</Alert>
        ) : (
          <div className="space-y-5">
            {captionsMismatch && <Alert kind="warning">{captionsMismatch}</Alert>}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className={`rounded-xl border border-ocean/15 bg-tint p-5 ${campaign.quality_score ? "" : "lg:col-span-2"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-navy/70">
                    {template === "generic" ? "Event used" : "Written for"}
                  </div>
                  {/* Service and Webinar are tied to their own topic, not a trending event. */}
                  {template === "generic" && (
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
                              setCampaign(data, template);
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
                  )}
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

            {flyerConfig && fieldsFor(flyerConfig, template, "review").length > 0 && (
              <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
                <FieldGrid fields={fieldsFor(flyerConfig, template, "review")} values={inputs} errors={fieldErrors}
                  timezones={flyerConfig.timezones} onChange={setFlyerValue} />
              </section>
            )}

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
            {captionsMismatch && <Alert kind="warning">{captionsMismatch}</Alert>}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <FlyerCard
                config={flyerConfig}
                configError={flyerConfigError}
                template={template}
                values={inputs}
                image={s.image}
                generating={busy === "image"}
                switching={busy === "switch"}
                fieldErrors={fieldErrors}
                notice={notices.image ?? null}
                providerFailed={s.providerFailed}
                onChange={setFlyerValue}
                onEditDetails={() => set({ tab: template === "generic" ? "review" : "generate" })}
                onGenerate={() => run("image", generateFlyer)}
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
                  imageUrl={readyImage?.clean_image_url ?? null}
                  needsImageText={s.image && !readyImage
                    ? "The flyer is outdated. Generate a new preview to publish."
                    : "Generate a preview to publish."}
                  captions={s.captions}
                  platforms={s.platforms}
                  onLinkedInPosted={(urn) => set({ linkedinPostUrn: urn })}
                />
                <NotPostingCard
                  image={readyImage}
                  captionsFile={captionsFile(PLATFORMS.filter((p) => s.platforms.includes(p.key)), s.captions)}
                  onSave={saveDraft}
                />
              </aside>
            </div>
            {readyImage && showPaidPromotion && (
              <PaidPromotionCard
                imageUrl={readyImage.clean_image_url}
                campaignName={`${companyName} - ${campaign.detected_event || "campaign"}`}
                facebookMessage={s.captions.facebook ?? ""}
                headline={campaign.ads?.image_headline ?? ""}
                link={effectiveContactUrl()}
              />
            )}
          </div>
        )
      )}
    </>
  );
}

/** Company website, name and description: nearly always the same, so folded
 * away with a one-line summary. */
function CompanySection({ form, setForm, open, setOpen }: {
  form: Form;
  setForm: (patch: Partial<Form>) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const site = form.companyUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const summary = [form.companyName || "No company name yet", site].filter(Boolean).join(" · ");
  return (
    <div className="rounded-lg border border-line bg-white">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Building2 className="size-5 text-navy" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy">Company</span>
          <span className="block truncate text-xs text-muted">{summary}</span>
        </span>
        <span className="text-xs font-semibold text-accent">{open ? "Close" : "Edit"}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Company website" placeholder="https://www.agfintax.com/"
              value={form.companyUrl} onChange={(v) => setForm({ companyUrl: v })} />
            <TextInput label="Company name *" placeholder="AGFinTax"
              value={form.companyName} onChange={(v) => setForm({ companyName: v })} />
          </div>
          <TextArea label="What does the company do?" placeholder="Auto-filled from the website if left blank"
            value={form.productDescription} onChange={(v) => setForm({ productDescription: v })} />
        </div>
      )}
    </div>
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

/** Tone, audience and colours steer the AI; the speaker and contact details
 * are printed on every flyer exactly as entered (empty = approved default). */
function BrandProfileCard({ brand, detailFields, onSave }: {
  brand: Brand;
  detailFields: FlyerField[];
  onSave: (b: Brand) => void;
}) {
  const [edit, setEdit] = useState<Brand | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const label = "text-[11px] font-bold uppercase tracking-wider text-muted";
  const detail = (b: Brand, f: FlyerField) => b.details?.[f.key]?.trim() || f.default || "";
  const byPrefix = (prefix: string) =>
    detailFields.filter((f) => f.key.startsWith(prefix)).map((f) => detail(brand, f)).filter(Boolean).join(" · ");

  if (edit) {
    const setDetail = (key: string, value: string) => {
      setEdit({ ...edit, details: { ...edit.details, [key]: value } });
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
    };
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
          {detailFields.length > 0 && (
            <div className="space-y-3 border-t border-line pt-3">
              <p className="text-xs text-muted">Printed on the flyers exactly as entered. Leave empty for the default.</p>
              {detailFields.map((f) => (
                <div key={f.key}>
                  <TextInput label={f.label} type={f.type === "email" ? "email" : "text"} maxLength={f.max}
                    placeholder={f.default} value={edit.details?.[f.key] ?? f.default ?? ""}
                    onChange={(v) => setDetail(f.key, v)} />
                  {errors[f.key] && <p className="mt-1 text-xs font-medium text-danger">{errors[f.key]}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => {
              setEdit(null);
              setErrors({});
            }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => {
              const found = Object.fromEntries(detailFields
                .map((f) => [f.key, fieldError(f, edit.details?.[f.key] ?? "")])
                .filter(([, e]) => e));
              if (Object.keys(found).length) {
                setErrors(found);
                return;
              }
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
        {byPrefix("speaker_") && (
          <div>
            <dt className={label}>Webinar speaker</dt>
            <dd className="mt-0.5 text-ink">{byPrefix("speaker_")}</dd>
          </div>
        )}
        {byPrefix("contact_") && (
          <div>
            <dt className={label}>Flyer contact details</dt>
            <dd className="mt-0.5 break-words text-ink">{byPrefix("contact_")}</dd>
          </div>
        )}
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

// Platforms the backend can post to; the rest can only be downloaded.
const POST_TARGETS = ["instagram", "facebook", "linkedin"] as const;

type PostState = { status: "posting" | "posted" | "failed"; error?: string };

function PublishCard({ imageUrl, needsImageText, captions, platforms, onLinkedInPosted }: {
  imageUrl: string | null;
  needsImageText: string;
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
    if (!imageUrl) return <span className="text-xs text-muted">Needs flyer</span>;
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
      {!imageUrl && <p className="mt-2 text-center text-xs text-muted">{needsImageText}</p>}
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
        <Button loading={busy} disabled={!image} onClick={downloadPackage}>Download package</Button>
      </div>
      {!image && <p className="mt-3 text-xs text-muted">Generate a preview to enable download.</p>}
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

/** GET /facebook-ad-config: the backend's active Meta ad settings (no secrets). */
type MetaAdConfig = {
  configured: boolean;
  ad_account_id: string;
  currency: string;
  page_id: string;
  instagram_user_id: string;
  whatsapp_number: string;
  objective: string;
  budget_level: string;
  bid_strategy: string;
  special_ad_categories: string[];
  destination_type: string;
  optimization_goal: string;
  cta_type: string;
  countries: string[];
  advantage_audience: boolean;
  saved_audience_id: string;
};
/** One level (campaign / ad set / ad) of POST /facebook-ad-campaign-status. */
type MetaLevelStatus = {
  effective_status?: string;
  issues_info?: { error_message?: string }[];
  ad_review_feedback?: unknown;
};
/** POST /facebook-ad-insights: Meta's numbers come as strings; {} before any delivery. */
type MetaInsights = {
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

/** An amount in the ad account's currency ("₹800.00", "$10.00"). */
function moneyIn(n: number, currency: string) {
  try {
    return n.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** A Meta ads management call; the backend answers {success, data} (or {success: false, error}). */
async function metaAds<T>(path: string, body?: Dict): Promise<T> {
  const r = await callApi<{ success?: boolean; data?: T; error?: string }>("ad", path, body);
  if (!r.success) throw new Error(r.error || `${path} failed`);
  return r.data as T;
}

function MetaDraftPanel({ draft, onBudgetChanged, onDiscard }: {
  draft: Draft;
  onBudgetChanged: (dailyBudget: number) => void;
  onDiscard: () => void;
}) {
  const currency = String(draft.currency || "USD");
  const ids = { campaign_id: String(draft.campaign_id), adset_id: String(draft.adset_id), ad_id: String(draft.ad_id) };
  const [password, setPassword] = useState("");
  const [newBudget, setNewBudget] = useState(draft._daily_budget);
  const [busy, setBusy] = useState<"status" | "results" | "pause" | "activate" | "budget" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [status, setStatus] = useState<Record<string, MetaLevelStatus> | null>(null);
  const [results, setResults] = useState<MetaInsights | null>(null);
  const spend = draft._daily_budget * draft._days;

  async function run(action: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(action);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alert kind="success">Draft campaign created as PAUSED — not spending until you activate it.</Alert>
      <p className="break-all font-mono text-xs text-muted">
        Campaign {ids.campaign_id} / ad set {ids.adset_id} / ad {ids.ad_id}
      </p>
      <div className="max-w-xs">
        <Metric label="Estimated total spend" value={moneyIn(spend, currency)}
          hint={`${moneyIn(draft._daily_budget, currency)}/day x ${draft._days} days`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button icon={RefreshCw} loading={busy === "status"} disabled={busy !== null} onClick={() => run("status", async () => {
          setStatus(await metaAds<Record<string, MetaLevelStatus>>("facebook-ad-campaign-status", ids));
        })}>
          Refresh status
        </Button>
        <Button icon={BarChart3} loading={busy === "results"} disabled={busy !== null} onClick={() => run("results", async () => {
          setResults(await metaAds<MetaInsights>("facebook-ad-insights", { object_id: ids.campaign_id }));
        })}>
          Results so far
        </Button>
        <Button icon={Pause} loading={busy === "pause"} disabled={busy !== null} onClick={() => run("pause", async () => {
          // No password: pausing only ever stops spend.
          await metaAds("pause-facebook-ad-campaign", ids);
          setNotice({ kind: "success", text: "Campaign paused — no further spend." });
        })}>
          Pause campaign
        </Button>
      </div>

      {status && (
        <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
          {(["campaign", "adset", "ad"] as const).map((level) => {
            const info = status[level] ?? {};
            return (
              <div key={level} className="space-y-1">
                <p><span className="font-semibold text-navy">{level === "adset" ? "Ad set" : level[0].toUpperCase() + level.slice(1)}:</span>{" "}
                  {info.effective_status ?? "?"}</p>
                {(info.issues_info ?? []).map((issue, i) => (
                  <Alert key={i} kind="warning">{issue.error_message || JSON.stringify(issue)}</Alert>
                ))}
                {Boolean(info.ad_review_feedback) && (
                  <Alert kind="warning">Review feedback: {JSON.stringify(info.ad_review_feedback)}</Alert>
                )}
              </div>
            );
          })}
        </div>
      )}

      {results && (
        Object.keys(results).length ? (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Spend" value={moneyIn(Number(results.spend ?? 0), currency)} />
              <Metric label="Reach" value={Number(results.reach ?? 0).toLocaleString("en-US")} />
              <Metric label="Impressions" value={Number(results.impressions ?? 0).toLocaleString("en-US")} />
              <Metric label="Clicks" value={Number(results.clicks ?? 0).toLocaleString("en-US")} />
            </div>
            {(results.actions ?? []).map((a) => (
              <p key={a.action_type} className="text-xs text-muted">{a.action_type}: {a.value}</p>
            ))}
          </div>
        ) : (
          <Alert>No results yet — the campaign hasn&apos;t delivered.</Alert>
        )
      )}

      <TextInput
        type="password"
        label="Execution password (required to activate or change the budget — this spends real money)"
        value={password}
        onChange={setPassword}
      />
      <div className="max-w-xs">
        <NumberInput label={`New daily budget (${currency})`} min={1} value={newBudget} onChange={setNewBudget} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="primary" icon={Rocket} loading={busy === "activate"} disabled={!password || busy !== null}
          onClick={() => run("activate", async () => {
            setNotice(await activate("activate-facebook-ad-campaign", { ...ids, password }));
          })}>
          Activate campaign
        </Button>
        <Button icon={Wallet} loading={busy === "budget"} disabled={!password || busy !== null}
          onClick={() => run("budget", async () => {
            await metaAds("update-facebook-ad-budget", {
              campaign_id: ids.campaign_id, adset_id: ids.adset_id, daily_budget: newBudget, password,
            });
            onBudgetChanged(newBudget);
            setNotice({ kind: "success", text: `Daily budget set to ${moneyIn(newBudget, currency)}.` });
          })}>
          Update budget
        </Button>
        <Button disabled={busy !== null} onClick={onDiscard}>Discard draft</Button>
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

function PaidPromotionCard({ imageUrl, campaignName, facebookMessage, headline, link }: {
  imageUrl: string;
  campaignName: string;
  facebookMessage: string;
  headline: string;
  link: string;
}) {
  const [s, set] = store.useStore();
  const [tab, setTab] = useState<"meta" | "linkedin">("meta");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // countries null = the backend's default (FACEBOOK_AD_COUNTRIES).
  const [fb, setFb] = useState({ budget: 10, days: 7, countries: null as string[] | null, headline: headline.slice(0, 40) });
  const [li, setLi] = useState({ budget: 10, days: 7, country: "US" });
  const [metaConfig, setMetaConfig] = useState<MetaAdConfig | null>(null);
  const [metaConfigError, setMetaConfigError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ lower?: number | null; upper?: number | null } | null>(null);
  const countryCodes = Object.keys(AD_COUNTRIES);
  const currency = metaConfig?.currency || "USD";
  const fbCountries = fb.countries
    ?? (metaConfig?.countries ?? ["US"]).filter((c) => c in AD_COUNTRIES);

  // The Meta ad settings decide the budget currency and default countries.
  useEffect(() => {
    callApi<{ success?: boolean; data?: MetaAdConfig; error?: string }>("ad", "facebook-ad-config").then(
      (r) => (r.success && r.data ? setMetaConfig(r.data) : setMetaConfigError(r.error || "unknown error")),
      (e: Error) => setMetaConfigError(e.message),
    );
  }, []);

  async function estimateAudience() {
    setEstimating(true);
    setEstimate(null);
    setNotice(null);
    try {
      setEstimate(await metaAds("facebook-ad-audience-estimate", { countries: fbCountries }));
    } catch (e) {
      setNotice({ kind: "error", text: `Could not estimate the audience: ${(e as Error).message}` });
    } finally {
      setEstimating(false);
    }
  }

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
          <MetaDraftPanel
            draft={s.facebookAdDraft}
            onBudgetChanged={(dailyBudget) => set({ facebookAdDraft: { ...s.facebookAdDraft!, _daily_budget: dailyBudget } })}
            onDiscard={() => set({ facebookAdDraft: null })}
          />
        ) : (
          <div className="space-y-4">
            {metaConfigError && <Alert kind="error">Could not load the Meta ad settings: {metaConfigError}</Alert>}
            {metaConfig && !metaConfig.configured && (
              <Alert kind="warning">
                Meta ads aren&apos;t configured on the server: the Ad generator backend needs FACEBOOK_AD_ACCOUNT_ID and
                FACEBOOK_MARKETING_ACCESS_TOKEN in its .env.
              </Alert>
            )}
            {metaConfig && (
              <Expander title="Active Meta ad settings (from the server)" icon={Settings2}>
                <div className="space-y-1 text-sm text-muted">
                  <p>Ad account <code>{metaConfig.ad_account_id || "-"}</code> ({metaConfig.currency}) · Page{" "}
                    <code>{metaConfig.page_id || "-"}</code> · Instagram <code>{metaConfig.instagram_user_id || "-"}</code> ·
                    WhatsApp <code>{metaConfig.whatsapp_number || "-"}</code></p>
                  <p>Objective <code>{metaConfig.objective}</code> · destination <code>{metaConfig.destination_type}</code> ·
                    goal <code>{metaConfig.optimization_goal}</code> · call to action <code>{metaConfig.cta_type}</code> ·
                    budget on <code>{metaConfig.budget_level}</code> · bid <code>{metaConfig.bid_strategy}</code></p>
                  <p>Special ad categories <code>{metaConfig.special_ad_categories.join(", ") || "none"}</code> ·
                    Advantage+ audience <code>{metaConfig.advantage_audience ? "on" : "off"}</code> · saved audience{" "}
                    <code>{metaConfig.saved_audience_id || "-"}</code></p>
                </div>
              </Expander>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label={`Daily budget (${currency})`} min={1} value={fb.budget} onChange={(budget) => setFb({ ...fb, budget })} />
              <NumberInput label="Run for how many days" min={1} value={fb.days} onChange={(days) => setFb({ ...fb, days })} />
            </div>
            <ChipSelect label="Countries to target" options={countryCodes} format={(c) => AD_COUNTRIES[c]}
              selected={fbCountries} onChange={(countries) => {
                setFb({ ...fb, countries });
                setEstimate(null);
              }} />
            <TextInput label="Ad headline" value={fb.headline} maxLength={40}
              hint="Shown under the image (up to 40 characters)." onChange={(headline) => setFb({ ...fb, headline })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button icon={Users} loading={estimating} disabled={!fbCountries.length || busy} onClick={estimateAudience}>
                Estimate audience
              </Button>
              <Button variant="primary" icon={FileText} loading={busy} disabled={!fbCountries.length || estimating} onClick={() => {
                const start = new Date();
                const end = new Date(start.getTime() + fb.days * 86_400_000);
                // The format the backend expects: %Y-%m-%dT%H:%M:%S%z in UTC.
                const fmt = (d: Date) => `${d.toISOString().slice(0, 19)}+0000`;
                createDraft("create-facebook-ad-campaign", {
                  name: campaignName,
                  image_url: imageUrl,
                  message: facebookMessage,
                  headline: fb.headline.trim(),
                  link,
                  // In the ad account's currency (the backend's FACEBOOK_AD_CURRENCY).
                  daily_budget: fb.budget,
                  countries: fbCountries,
                  start_time: fmt(start),
                  end_time: fmt(end),
                }, fb.budget, fb.days, "facebookAdDraft");
              }}>
                Create draft campaign
              </Button>
            </div>
            {estimate && (
              <Alert>
                Estimated audience: {(estimate.lower ?? 0).toLocaleString("en-US")} – {(estimate.upper ?? 0).toLocaleString("en-US")} people
              </Alert>
            )}
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
