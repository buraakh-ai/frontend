"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, XCircle, type LucideIcon } from "lucide-react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] text-muted">{subtitle}</p>}
    </div>
  );
}

export function Card({ title, subtitle, children, className }: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-white p-5 shadow-sm md:p-6", className)}>
      {title && <h2 className="text-xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className={title || subtitle ? "mt-5" : undefined}>{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
};

export function Button({ variant = "secondary", icon: Icon, loading, block, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        // Pill, uppercase buttons like agfintax.com's CTAs.
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white shadow-sm hover:bg-accent-dark",
        variant === "secondary" && "border border-navy/25 bg-white text-navy hover:border-navy hover:bg-canvas",
        variant === "ghost" && "text-navy hover:bg-canvas",
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const control =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-gray-400 " +
  "focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/20 disabled:bg-canvas disabled:text-muted";

type InputProps = { label: string; hint?: string; value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>;

export function TextInput({ label, hint, value, onChange, ...rest }: InputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className={control} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

type TextAreaProps = { label: string; hint?: string; value: string; onChange: (v: string) => void } & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>;

export function TextArea({ label, hint, value, onChange, rows = 3, ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea id={id} rows={rows} className={control} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function Select<T extends string>({ label, value, options, onChange, format }: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} className={control} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {format ? format(o) : o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NumberInput({ label, value, onChange, min, step = 1 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        className={control}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Math.max(min ?? -Infinity, Number(e.target.value)))}
      />
    </Field>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-navy">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line accent-accent"
      />
      {label}
    </label>
  );
}

export function Slider({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-navy">
          {label}
        </label>
        <span className="rounded bg-tint px-2 py-0.5 text-xs font-semibold text-navy tabular-nums">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

/** Toggleable chips — used where Streamlit had a multiselect. */
export function ChipSelect({ label, options, selected, onChange, format }: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
  format?: (v: string) => string;
}) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-navy">{label}</legend>
      {options.length === 0 ? (
        <p className="text-xs text-muted">No suggestions for this selection.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(o)}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-navy/40",
                )}
              >
                {format ? format(o) : o}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-navy">{label}</legend>
      <div className="inline-flex rounded-md border border-line bg-canvas p-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={cx(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              o === value ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors",
            t.id === active ? "border-accent text-navy" : "border-transparent text-muted hover:text-navy",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line border-t-[3px] border-t-sky bg-white px-4 py-3" title={hint}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 truncate font-display text-xl font-bold text-navy">{value ?? "—"}</div>
    </div>
  );
}

const ALERT_STYLES = {
  info: { icon: Info, box: "border-ocean/25 bg-tint text-navy" },
  success: { icon: CheckCircle2, box: "border-success/25 bg-green-50 text-green-900" },
  warning: { icon: AlertTriangle, box: "border-warning/30 bg-amber-50 text-amber-900" },
  error: { icon: XCircle, box: "border-danger/25 bg-red-50 text-red-900" },
};

export function Alert({ kind = "info", children }: { kind?: keyof typeof ALERT_STYLES; children: ReactNode }) {
  const { icon: Icon, box } = ALERT_STYLES[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg border px-4 py-3 text-sm", box)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Expander({ title, icon: Icon, defaultOpen = false, children }: {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-navy"
      >
        {Icon && <Icon className="size-4 text-muted" />}
        <span className="flex-1">{title}</span>
        <ChevronDown className={cx("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-line px-4 py-4">{children}</div>}
    </div>
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Simple scrollable table; columns default to every key seen in the rows. */
export function DataTable({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] }) {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-canvas">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted">
                {c.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/60">
              {cols.map((c) => (
                <td key={c} className="max-w-xs truncate px-3 py-2" title={cell(r[c])}>
                  {cell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-canvas p-3 text-xs text-navy">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Triggers a browser download of in-memory text (captions, CSV). */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
