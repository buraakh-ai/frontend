"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileArchive, Paperclip, Sparkles, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { ImageModelPicker, type AdImage, type ImageModels } from "./flyer-studio";

/** A file attached in the Generic playground: an image or a ZIP of images,
 * kept base64-encoded in memory (not saved in drafts) and sent with the
 * prompt to POST /generate-from-prompt. */
export type PlaygroundAttachment = { id: string; name: string; size: number; type: string; data: string };
export type Playground = { prompt: string; attachments: PlaygroundAttachment[] };
export const EMPTY_PLAYGROUND: Playground = { prompt: "", attachments: [] };

// The backend's limits (tools/attachment_tool.py); checked here first so a
// too-big file fails before it is uploaded.
const MAX_FILE_MB = 20;
const MAX_TOTAL_MB = 40;
const MAX_IMAGES = 16;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,.zip,application/zip";

const isZip = (a: { name: string; type: string }) => a.type.includes("zip") || a.name.toLowerCase().endsWith(".zip");
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1);

/** What the current prompt and attachments are, so an image made from
 * something else shows as outdated. */
export const playgroundKey = (p: Playground) =>
  JSON.stringify(["playground", p.prompt.trim(), p.attachments.map((a) => [a.name, a.size])]);

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Ad Studio's Generic template: a prompt box with attachments, like a chat.
 * The prompt is used word for word; attached images (or ZIPs of images) are
 * listed after it by file name so the prompt can refer to each one. */
export function GenericPlayground({ value, onChange, imageModels, imageModel, onImageModelChange, image, generating,
  notice, onGenerate }: {
  value: Playground;
  onChange: (p: Playground) => void;
  imageModels: ImageModels | null;
  imageModel: string;
  onImageModelChange: (model: string) => void;
  image: AdImage | null;
  generating: boolean;
  notice: { kind: "success" | "error" | "warning"; text: string } | null;
  onGenerate: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const { prompt, attachments } = value;
  const imagesCount = attachments.filter((a) => !isZip(a)).length;
  const zips = attachments.length - imagesCount;

  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    const list = [...files];
    let total = attachments.reduce((n, a) => n + a.size, 0);
    const added: PlaygroundAttachment[] = [];
    for (const file of list) {
      const type = file.type || (file.name.toLowerCase().endsWith(".zip") ? "application/zip" : "");
      if (!type.startsWith("image/") && !isZip({ name: file.name, type })) {
        setAttachError(`${file.name}: attach images (PNG, JPG, WEBP, GIF, BMP) or a ZIP of images.`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setAttachError(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
        continue;
      }
      if (total + file.size > MAX_TOTAL_MB * 1024 * 1024) {
        setAttachError(`Attachments can be at most ${MAX_TOTAL_MB} MB in total.`);
        break;
      }
      try {
        added.push({ id: crypto.randomUUID(), name: file.name, size: file.size, type, data: await readBase64(file) });
        total += file.size;
      } catch (e) {
        setAttachError((e as Error).message);
      }
    }
    const next = [...attachments, ...added];
    if (next.filter((a) => !isZip(a)).length > MAX_IMAGES) {
      setAttachError(`At most ${MAX_IMAGES} images can be used at once.`);
      return;
    }
    if (added.length) onChange({ ...value, attachments: next });
  }

  function remove(id: string) {
    setAttachError(null);
    onChange({ ...value, attachments: attachments.filter((a) => a.id !== id) });
  }

  // Clicking an attachment's name puts it into the prompt at the cursor.
  function mention(name: string) {
    const box = promptBox.current;
    const at = box?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, at);
    const insert = `${before && !/\s$/.test(before) ? " " : ""}${name} `;
    onChange({ ...value, prompt: before + insert + prompt.slice(at) });
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + insert.length, at + insert.length);
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border bg-white transition-colors ${
          dragging ? "border-accent ring-2 ring-accent/20" : "border-line focus-within:border-navy/40"}`}
      >
        <label htmlFor="playground-prompt" className="sr-only">Image prompt</label>
        <textarea
          id="playground-prompt"
          ref={promptBox}
          rows={7}
          value={prompt}
          maxLength={8000}
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
          placeholder={"Describe the image you want, exactly as you'd ask a designer.\n\n"
            + "e.g. A 4:5 Instagram flyer for our year-end tax webinar: navy background, bold white headline "
            + "\"Save more this year\", put logo.png top-left and qr.png bottom-right, footer.png along the bottom."}
          className="block w-full resize-y rounded-t-xl bg-transparent px-4 py-3 text-sm text-ink placeholder:text-muted/80 focus:outline-none"
        />
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pb-2">
            {attachments.map((a) => (
              <li key={a.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-1 pl-1 pr-1.5 text-xs text-navy">
                {isZip(a) ? (
                  <span className="flex size-8 items-center justify-center rounded bg-white">
                    <FileArchive className="size-4 text-muted" aria-hidden />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of the attached file
                  <img src={`data:${a.type};base64,${a.data}`} alt="" className="size-8 rounded bg-white object-contain" />
                )}
                <button type="button" onClick={() => mention(a.name)} title="Insert this name into the prompt"
                  aria-label={`Insert ${a.name} into the prompt`}
                  className="max-w-[160px] truncate font-medium hover:text-accent">
                  {a.name}
                </button>
                <span className="text-muted">{mb(a.size)} MB</span>
                <button type="button" onClick={() => remove(a.id)} aria-label={`Remove ${a.name}`}
                  className="rounded p-0.5 text-muted hover:bg-white hover:text-danger">
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
          <button type="button" onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-navy hover:bg-canvas">
            <Paperclip className="size-4" aria-hidden />
            Attach images or ZIP
          </button>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }} />
          <span className="text-xs text-muted">
            {attachments.length
              ? `${imagesCount} image${imagesCount === 1 ? "" : "s"}${zips ? ` + ${zips} ZIP${zips === 1 ? "" : "s"}` : ""} · click a name to use it in the prompt`
              : "Drop logos, QR codes, headers, footers or photos here"}
          </span>
        </div>
      </div>
      {attachError && <Alert kind="error">{attachError}</Alert>}

      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <ImageModelPicker models={imageModels} value={imageModel} onChange={onImageModelChange} disabled={generating} />
        <Button variant="primary" icon={Sparkles} loading={generating} disabled={!prompt.trim()} onClick={onGenerate}>
          {generating ? "Generating image…" : image ? "Regenerate image" : "Generate image"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Your prompt is used word for word. Attached images are sent to the model as references (ZIPs are unpacked),
        so logos and QR codes are redrawn and may not be pixel-exact. Attachments stay in this tab only; they are
        not saved with drafts.
      </p>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
    </div>
  );
}

/** The Brief's side card in Generic: the generated image, or a placeholder. */
export function PlaygroundResultCard({ image, stale, generating }: {
  image: AdImage | null;
  stale: boolean;
  generating: boolean;
}) {
  const badge = !image
    ? <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">Not generated</span>
    : stale
      ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Outdated</span>
      : <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">Ready</span>;
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Your image</h2>
        {badge}
      </div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-line bg-canvas">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated by the backend, served via our proxy
          <img src={`/api/ad${image.clean_image_url}`} alt="Generated image"
            className={`size-full object-contain ${generating || stale ? "opacity-40" : ""}`} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
            <Sparkles className="size-6 text-accent/70" aria-hidden />
            Write a prompt, attach any images, and click Generate image.
          </div>
        )}
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-navy">
            <Sparkles className="size-6 animate-pulse text-accent" aria-hidden />
            Generating your image…
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        {stale && image && !generating
          ? "The prompt or attachments changed since this image was made. Regenerate to use it."
          : "The whole 4:5 image comes from your prompt; nothing is added on top."}
      </p>
    </section>
  );
}
