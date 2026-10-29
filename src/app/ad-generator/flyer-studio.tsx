"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Download, History, Layers, Megaphone, Pencil, Sparkles, Wrench } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { Alert, Button, Expander, Select, TextArea, TextInput, downloadBlob } from "@/components/ui";

// Ad Studio's templated flyers. The templates themselves (fields, saved
// assets, layout) live in the Ad generator backend's flyer_templates.json and
// arrive through GET /flyer-templates; the sample layout is rendered by the
// backend's composer (POST /flyer-sample, no AI call), so what is shown here
// always matches the final flyer. Each field's `step` says where the page
// shows it: the Brief (default), Review copy, or Flyer & publish; fields in
// group "details" (speaker/contact) are edited once in the Brand profile.

export type FlyerTemplateId = "generic" | "service" | "webinar";
export const FLYER_TEMPLATES: readonly FlyerTemplateId[] = ["generic", "service", "webinar"];

export type FlyerField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "url" | "email" | "date" | "time" | "timezone";
  required?: boolean;
  max?: number;
  placeholder?: string;
  hint?: string;
  default?: string;
  half?: boolean;
  step?: "brief" | "review" | "flyer";
  group?: "details";
};
type FlyerAsset = { key: string; label: string; url: string; needs_original: boolean };
type FlyerTemplateConfig = {
  label: string;
  title: string;
  fields: FlyerField[];
  asset_summary: string;
  assets: FlyerAsset[];
};
export type FlyerConfig = {
  templates: Record<FlyerTemplateId, FlyerTemplateConfig>;
  timezones: { key: string; label: string }[];
};

export type FlyerValues = Record<FlyerTemplateId, Record<string, string>>;
export type FlyerState = { template: FlyerTemplateId; values: FlyerValues };
export const EMPTY_FLYER: FlyerState = { template: "generic", values: { generic: {}, service: {}, webinar: {} } };

/** A generated flyer. `template` and `inputsKey` record what it was made
 * from, so the page can tell when the inputs have changed since. */
export type AdImage = {
  clean_image_url: string;
  provider?: string;
  prompt?: string;
  template?: FlyerTemplateId;
  inputsKey?: string;
};
export type ProviderFailed = { failed_provider: string; next_provider_label: string; next_provider_name: string };
type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

/** Fields shown on a given step (details are in the Brand profile instead). */
export const fieldsFor = (config: FlyerConfig, template: FlyerTemplateId, step: "brief" | "review" | "flyer") =>
  config.templates[template].fields.filter((f) => !f.group && (f.step ?? "brief") === step);

/** The speaker/contact fields across all templates, once each. */
export const detailFields = (config: FlyerConfig) => {
  const seen = new Map<string, FlyerField>();
  for (const t of FLYER_TEMPLATES) {
    for (const f of config.templates[t].fields) if (f.group === "details" && !seen.has(f.key)) seen.set(f.key, f);
  }
  return [...seen.values()];
};

/** What a field shows: the typed value, else the template's default. */
const shown = (f: FlyerField, values: Record<string, string>) => values[f.key] ?? f.default ?? "";

/** The values sent to the backend, normalized the way the backend does it
 * (trimmed, empty falls back to the default). */
export function flyerFields(config: FlyerConfig, template: FlyerTemplateId, values: Record<string, string>) {
  return Object.fromEntries(
    config.templates[template].fields.map((f) => [f.key, (values[f.key] ?? "").trim() || f.default || ""]),
  );
}

export const flyerKey = (config: FlyerConfig, template: FlyerTemplateId, values: Record<string, string>) =>
  JSON.stringify([template, flyerFields(config, template, values)]);

const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Checks one value the way the backend will. */
export function fieldError(f: FlyerField, value: string) {
  const v = value.trim() || f.default || "";
  if (!v) return f.required ? `${f.label} is required.` : "";
  if (f.type === "url" && !URL_RE.test(v)) return "Enter a full URL starting with https://";
  if (f.type === "email" && !EMAIL_RE.test(v)) return "Enter a valid email address.";
  return "";
}

/** Quick checks before spending a model call; the backend re-validates.
 * `only` limits the check to some fields (e.g. the ones on the Brief). */
export function flyerErrors(config: FlyerConfig, template: FlyerTemplateId, values: Record<string, string>,
  only?: FlyerField[]) {
  const errors: Record<string, string> = {};
  for (const f of only ?? config.templates[template].fields) {
    const error = fieldError(f, values[f.key] ?? "");
    if (error) errors[f.key] = error;
  }
  return errors;
}

/** The sample layout (no AI): right away on a template switch, then shortly
 * after typing stops. */
export function useFlyerSample(config: FlyerConfig | null, template: FlyerTemplateId, values: Record<string, string>) {
  const [samples, setSamples] = useState<Partial<Record<FlyerTemplateId, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fieldsJson = config ? JSON.stringify(flyerFields(config, template, values)) : "";
  const hasSample = !!samples[template];

  useEffect(() => {
    if (!fieldsJson) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const r = await callApi<{ success?: boolean; image?: string; error?: string }>("ad", "flyer-sample", {
          template, fields: JSON.parse(fieldsJson),
        });
        if (id !== requestId.current) return;
        if (r.success && r.image) {
          setSamples((s) => ({ ...s, [template]: r.image }));
          setError(null);
        } else {
          setError(r.error || "The sample layout could not be rendered.");
        }
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      }
    }, hasSample ? 350 : 0);
    return () => clearTimeout(timer);
  }, [template, fieldsJson, hasSample]);

  return { src: samples[template] ?? null, error };
}

const TEMPLATE_CARDS: Record<FlyerTemplateId, { icon: typeof Megaphone; blurb: string }> = {
  generic: { icon: Megaphone, blurb: "Brand post; AI picks the angle" },
  service: { icon: Wrench, blurb: "Promote a service, with a QR" },
  webinar: { icon: CalendarDays, blurb: "Event with date, speaker, QR" },
};

export function TemplatePicker({ config, template, onChange }: {
  config: FlyerConfig;
  template: FlyerTemplateId;
  onChange: (t: FlyerTemplateId) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-navy">What are you creating?</legend>
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
        {FLYER_TEMPLATES.map((t) => {
          const { icon: Icon, blurb } = TEMPLATE_CARDS[t];
          const active = t === template;
          return (
            <button key={t} type="button" role="radio" aria-checked={active} onClick={() => onChange(t)}
              className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                active ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line bg-white hover:border-navy/30"
              }`}>
              <Icon className={`mt-0.5 size-5 shrink-0 ${active ? "text-accent" : "text-navy"}`} aria-hidden />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${active ? "text-accent" : "text-navy"}`}>
                  {config.templates[t].label}
                </span>
                <span className="block text-xs text-muted">{blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FieldGrid({ fields, values, errors, timezones, onChange }: {
  fields: FlyerField[];
  values: Record<string, string>;
  errors: Record<string, string>;
  timezones: FlyerConfig["timezones"];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((f) => (
        <div key={f.key} className={f.half ? "col-span-1" : "col-span-2"}>
          <FieldInput field={f} value={shown(f, values)} error={errors[f.key]}
            timezones={timezones} onChange={(v) => onChange(f.key, v)} />
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, value, error, timezones, onChange }: {
  field: FlyerField;
  value: string;
  error?: string;
  timezones: FlyerConfig["timezones"];
  onChange: (v: string) => void;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  let input;
  if (field.type === "timezone") {
    const keys = timezones.map((z) => z.key);
    input = (
      <Select label={label} value={keys.includes(value) ? value : keys[0]} options={keys}
        format={(k) => timezones.find((z) => z.key === k)?.label ?? k} onChange={onChange} />
    );
  } else if (field.type === "textarea") {
    input = (
      <TextArea label={label} rows={3} value={value} maxLength={field.max} placeholder={field.placeholder}
        hint={[field.hint, field.max ? `${value.length}/${field.max}` : ""].filter(Boolean).join(" · ")}
        onChange={onChange} />
    );
  } else {
    const type = { url: "url", email: "email", date: "date", time: "time" }[field.type as string] ?? "text";
    input = (
      <TextInput label={label} type={type} value={value} maxLength={field.max} placeholder={field.placeholder}
        hint={field.hint} onChange={onChange} />
    );
  }
  return (
    <div>
      {input}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/** The Brief's side card: the selected template's layout as you type. */
export function FlyerPreviewCard({ config, template, values }: {
  config: FlyerConfig;
  template: FlyerTemplateId;
  values: Record<string, string>;
}) {
  const { src, error } = useFlyerSample(config, template, values);
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Flyer preview</h2>
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">Sample layout</span>
      </div>
      <div className="aspect-[4/5] overflow-hidden rounded-lg border border-line bg-canvas">
        {src
          // eslint-disable-next-line @next/next/no-img-element -- rendered by the backend, served via our proxy
          ? <img src={src} alt={`${config.templates[template].label} flyer sample layout`} className="size-full object-contain" />
          : <div className="flex size-full items-center justify-center text-sm text-muted">
              {error ? "Sample layout unavailable" : "Loading…"}
            </div>}
      </div>
      <p className="mt-2 text-xs text-muted">
        Updates as you type. The middle artwork is generated in the last step; everything else is placed exactly.
      </p>
    </section>
  );
}

const RATIOS = {
  "4:5": { size: [4, 5], frame: "aspect-[4/5]" },
  "1:1": { size: [1, 1], frame: "aspect-square" },
  "9:16": { size: [9, 16], frame: "aspect-[9/16] max-w-[300px]" },
} as const;
type Ratio = keyof typeof RATIOS;

// The backend renders one 4:5 flyer; other ratios fit the whole flyer
// (nothing cropped, so text, placements and QR spacing are unchanged) onto a
// canvas filled with the flyer's white background.
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

export const imageName = (image: AdImage) => image.clean_image_url.split("/").pop() || "ad-image.png";

/** Flyer & publish: the preview, artwork direction and generation. The
 * flyer's content is edited in the Brief (onEditDetails). */
export function FlyerCard({ config, configError, template, values, image, generating, switching, fieldErrors,
  notice, providerFailed, onChange, onEditDetails, onGenerate, onSwitchProvider }: {
  config: FlyerConfig | null;
  configError: string | null;
  template: FlyerTemplateId;
  values: Record<string, string>;
  image: AdImage | null;
  generating: boolean;
  switching: boolean;
  fieldErrors: Record<string, string>;
  notice: Notice;
  providerFailed: ProviderFailed | null;
  onChange: (key: string, value: string) => void;
  onEditDetails: () => void;
  onGenerate: () => void;
  onSwitchProvider: (p: ProviderFailed) => void;
}) {
  const [ratio, setRatio] = useState<Ratio>("4:5");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const sample = useFlyerSample(config, template, values);

  if (!config) {
    return (
      <section className="rounded-xl border border-line bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-xl font-bold">Your flyer</h2>
        {configError
          ? <div className="mt-4"><Alert kind="error">Could not load the flyer templates: {configError}</Alert></div>
          : <p className="mt-2 text-sm text-muted">Loading templates…</p>}
      </section>
    );
  }

  const tpl = config.templates[template];
  const final = image && image.template === template ? image : null;
  const stale = !!final && final.inputsKey !== flyerKey(config, template, values);
  const src = final ? `/api/ad${final.clean_image_url}` : sample.src;
  // Brief fields with an error (e.g. a later backend check) send the user back.
  const briefErrors = fieldsFor(config, template, "brief").filter((f) => fieldErrors[f.key]);

  async function download() {
    if (!final || stale) return;
    setDownloadError(null);
    try {
      const blob = await framedImage(`/api/ad${final.clean_image_url}`, ratio, "#ffffff");
      downloadBlob(imageName(final).replace(/\.\w+$/, "") + `_${ratio.replace(":", "x")}.png`, blob);
    } catch (e) {
      setDownloadError(`Could not download the flyer: ${(e as Error).message}`);
    }
  }

  const badge = !final
    ? <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">Sample · Not generated</span>
    : stale
      ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Outdated · Regenerate</span>
      : <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Final flyer</span>;

  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Your flyer</h2>
          <p className="mt-1 text-sm text-muted">{tpl.label} template · the details come from your brief.</p>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <Button icon={Pencil} onClick={onEditDetails}>Edit details</Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className={`relative mx-auto w-full overflow-hidden rounded-lg border border-line bg-white ${RATIOS[ratio].frame}`}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendered by the backend, served via our proxy
              <img src={src} alt={final ? "Generated flyer" : `${tpl.label} template sample layout`}
                className={`size-full object-contain ${generating || stale ? "opacity-40" : ""}`} />
            ) : (
              <div className="flex size-full items-center justify-center bg-canvas text-sm text-muted">
                {sample.error ? "Sample layout unavailable" : "Loading sample layout…"}
              </div>
            )}
            {(generating || stale) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm font-semibold text-navy">
                {generating ? (
                  <>
                    <Sparkles className="size-6 animate-pulse text-accent" aria-hidden />
                    Generating the artwork and composing your flyer…
                  </>
                ) : (
                  <>Details changed since this flyer was made. Generate a new preview to publish or download it.</>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-line bg-canvas p-0.5" role="group" aria-label="Download aspect ratio">
              {(Object.keys(RATIOS) as Ratio[]).map((r) => (
                <button key={r} type="button" aria-pressed={r === ratio} onClick={() => setRatio(r)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    r === ratio ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <Button icon={Download} className="flex-1" disabled={!final || stale || generating} onClick={download}>
              Download
            </Button>
          </div>
          {downloadError && <Alert kind="error">{downloadError}</Alert>}
        </div>

        <div className="space-y-4">
          <FieldGrid fields={fieldsFor(config, template, "flyer")} values={values} errors={fieldErrors}
            timezones={config.timezones} onChange={onChange} />
          <TemplateAssets summary={tpl.asset_summary} assets={tpl.assets} />
          <Button variant="primary" icon={Sparkles} block loading={generating} onClick={onGenerate}>
            {generating ? "Generating preview…" : final && !stale ? "Regenerate preview" : "Generate preview"}
          </Button>
          <p className="text-xs text-muted">
            Image generation starts only when you click Generate preview. Header, footer and QR are reused; only the
            middle artwork is generated.
          </p>
          {briefErrors.length > 0 && (
            <Alert kind="error">
              Fix in the brief: {briefErrors.map((f) => `${f.label}: ${fieldErrors[f.key]}`).join(" ")}
            </Alert>
          )}
          {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
          {providerFailed && (
            <Alert kind="warning">
              <div className="flex flex-wrap items-center gap-3">
                <span>{providerFailed.failed_provider} failed. Switch to {providerFailed.next_provider_label} and try again.</span>
                <Button loading={switching} onClick={() => onSwitchProvider(providerFailed)}>
                  Switch to {providerFailed.next_provider_label}
                </Button>
              </div>
            </Alert>
          )}
          {final && (
            <p className="text-xs text-muted">
              Image model: {final.provider ?? "openai_image"}. This exact file is what gets downloaded and published.
            </p>
          )}
          {final?.prompt && (
            <Expander title="Artwork prompt used (AI-written)" icon={History}>
              <pre className="whitespace-pre-wrap text-xs text-ink">{final.prompt}</pre>
            </Expander>
          )}
        </div>
      </div>
    </section>
  );
}

function TemplateAssets({ summary, assets }: { summary: string; assets: FlyerAsset[] }) {
  const [open, setOpen] = useState(false);
  const lowRes = assets.filter((a) => a.needs_original).length;
  return (
    <div className="rounded-lg border border-line bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Layers className="size-5 text-navy" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy">Template assets</span>
          <span className="block text-xs text-muted">{summary}</span>
        </span>
        <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Ready</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <p className="text-xs text-muted">
            Saved once and reused on every flyer; the image model never redraws them.
            {lowRes > 0 && ` ${lowRes} are cut from the reference flyers and should be replaced with higher-resolution originals.`}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.map((a) => (
              <li key={a.key} className="space-y-1">
                <div className="flex h-16 items-center justify-center rounded-md border border-line bg-canvas p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- saved asset served by the backend via our proxy */}
                  <img src={`/api/ad${a.url}`} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="text-xs font-medium text-navy">{a.label}</div>
                {a.needs_original && <div className="text-[11px] text-warning">Low-res copy</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
