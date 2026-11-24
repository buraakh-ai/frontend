"use client";

import { useRef, useState, type DragEvent } from "react";
import { DatabaseZap, FileDown, FileSpreadsheet, RotateCcw, UploadCloud } from "lucide-react";
import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";
import { Alert, Button, Card, Checkbox, DataTable, Metric, PageHeader, Select, downloadText } from "@/components/ui";
import {
  FIELDS, MAX_FILE_BYTES, MAX_ROWS, autoMap, parseCsv, readText, templateCsv,
  type FieldKey, type Mapping, type ParsedFile,
} from "./csv";

// One record of the Lead Hub's POST /fileUploadLeads (contract in the README).
// The Lead Hub stores the template fields in columns and keeps the whole record
// (row number and extra fields included) as its raw payload.
type UploadedLead = Record<FieldKey, string | null> & {
  row_number: number;
  // File columns that aren't mapped to a template field, kept as they are.
  extra_fields: Record<string, string>;
};
// The proxy adds `uploaded_by` (the signed-in user) on the server.
type UploadRequest = { file_name: string; records: UploadedLead[] };
type UploadResponse = { upload_id: number; row_count: number; lead_ids: number[] };
type Notice = { kind: "success" | "error" | "warning"; text: string };
type Status = "Ready" | "No email" | "Invalid email" | "Duplicate email";

// The Lead Hub requires an email on every record (Zoho contacts are keyed by
// it) and rejects the whole request if one is missing, so only rows with a
// valid email can be pushed. A repeated email just updates the same lead.
const pushable = (status: Status) => status === "Ready" || status === "Duplicate email";

// The Lead Hub accepts at most this many records per request.
const PUSH_BATCH_SIZE = 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NONE = "";

// Kept for the life of the tab, so an uploaded file survives switching modules.
const store = createStore({
  file: null as ParsedFile | null,
  mapping: autoMap([]),
  // Which rows to push (by row of `file.rows`).
  selected: [] as boolean[],
  // Rows already pushed to the Lead Hub in this tab.
  pushed: [] as number[],
});

/** Builds each row's Lead Hub record and review status from the mapping. */
function toLeads(file: ParsedFile, mapping: Mapping) {
  const index = Object.fromEntries(file.headers.map((h, i) => [h, i]));
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const seenEmails = new Set<string>();
  return file.rows.map((row, r) => {
    const lead = { row_number: r + 2, extra_fields: {} } as UploadedLead;
    for (const { key } of FIELDS) {
      const value = mapping[key] ? row[index[mapping[key]]] : "";
      lead[key] = value || null;
    }
    if (lead.email) lead.email = lead.email.toLowerCase();
    file.headers.forEach((h, i) => {
      if (!mapped.has(h) && row[i]) lead.extra_fields[h] = row[i];
    });

    let status: Status = "Ready";
    if (!lead.email) status = "No email";
    else if (!EMAIL.test(lead.email)) status = "Invalid email";
    else if (seenEmails.has(lead.email)) status = "Duplicate email";
    if (lead.email) seenEmails.add(lead.email);
    return { lead, status };
  });
}

const defaultSelection = (leads: { status: Status }[], pushed: number[]) =>
  leads.map((l, i) => l.status === "Ready" && !pushed.includes(i));

export function Upload() {
  const [s, set] = store.useStore();
  const [reading, setReading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function openFile(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setNotice({ kind: "error", text: `"${file.name}" isn't a CSV file. In Excel or Google Sheets, use "Save as" / "Download" → CSV, then upload that.` });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ kind: "error", text: `"${file.name}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.` });
      return;
    }
    setReading(true);
    try {
      const { headers, rows } = parseCsv(await readText(file));
      if (!headers.length || !rows.length) {
        setNotice({ kind: "error", text: `"${file.name}" has no rows under its header line.` });
        return;
      }
      if (rows.length > MAX_ROWS) {
        setNotice({ kind: "error", text: `"${file.name}" has ${rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()} per file. Split it into smaller files.` });
        return;
      }
      const parsed = { name: file.name, headers, rows };
      const mapping = autoMap(headers);
      set({ file: parsed, mapping, pushed: [], selected: defaultSelection(toLeads(parsed, mapping), []) });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not read "${file.name}": ${(e as Error).message}` });
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    openFile(e.dataTransfer.files[0]);
  }

  function changeMapping(key: FieldKey, header: string) {
    const mapping = { ...s.mapping, [key]: header };
    set((st) => ({ mapping, selected: defaultSelection(toLeads(st.file!, mapping), st.pushed) }));
  }

  const rows = s.file ? toLeads(s.file, s.mapping) : [];
  const all = rows.map((_, i) => i);
  const selectedRows = all.filter((i) => s.selected[i]);
  const notReady = rows.filter((r) => r.status !== "Ready").length;
  const unmappedHeaders = s.file ? s.file.headers.filter((h) => !Object.values(s.mapping).includes(h)) : [];
  const noEmailColumn = s.file && !s.mapping.email;
  // "Push all" sends every row that can be pushed and hasn't been yet.
  const pushableRows = all.filter((i) => pushable(rows[i].status) && !s.pushed.includes(i));

  // Sends the given rows to the Lead Hub in batches, after the user confirms.
  async function pushToHub(chosen: number[]) {
    const targets = chosen.filter((i) => pushable(rows[i].status));
    const skipped = chosen.length - targets.length;
    if (!targets.length) {
      setNotice({
        kind: "warning",
        text: chosen.length ? "None of the selected rows has a valid email, which the Lead Hub requires." : "Select at least one lead to push.",
      });
      return;
    }
    const skippedText = skipped ? ` ${skipped} selected row(s) without a valid email were skipped.` : "";
    const skipNote = skipped ? ` ${skipped} selected row(s) without a valid email will be skipped.` : "";
    if (!window.confirm(`Push ${targets.length} lead(s) from "${s.file!.name}" to the Lead Hub?${skipNote}`)) return;
    setNotice(null);
    setPushing(true);
    let done = 0;
    const uploads: number[] = [];
    try {
      for (let start = 0; start < targets.length; start += PUSH_BATCH_SIZE) {
        const batch = targets.slice(start, start + PUSH_BATCH_SIZE);
        const request: UploadRequest = { file_name: s.file!.name, records: batch.map((i) => rows[i].lead) };
        const res = await callApi<UploadResponse>("hub", "fileUploadLeads", request);
        uploads.push(res.upload_id);
        done += batch.length;
        set((st) => ({
          pushed: [...new Set([...st.pushed, ...batch])],
          selected: st.selected.map((v, i) => v && !batch.includes(i)),
        }));
      }
      setNotice({
        kind: "success",
        text: `Pushed ${done} lead(s) to the Lead Hub (upload ${uploads.join(", ")}).${skippedText} Pushing a lead with the same email again updates it rather than duplicating it.`,
      });
    } catch (e) {
      const message = (e as Error).message;
      const missing = /^404\b/.test(message) || message === "Unknown endpoint";
      const sent = done ? ` ${done} of ${targets.length} lead(s) were pushed before the error; they are marked "Pushed".` : "";
      setNotice({
        kind: "error",
        text: missing
          ? `The Lead Hub doesn't accept uploaded leads yet (its POST /fileUploadLeads endpoint isn't deployed). Nothing was saved.`
          : `Push to the Lead Hub failed: ${message}.${sent} A failed batch saves nothing, so you can push it again.`,
      });
    } finally {
      setPushing(false);
    }
  }

  function downloadSelected() {
    const name = s.file!.name.replace(/\.[^.]+$/, "") + "_selected.json";
    downloadText(name, JSON.stringify(selectedRows.map((i) => rows[i].lead), null, 2), "application/json");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload leads"
        subtitle="Upload a CSV file from your computer, check its columns, review the leads, and push the ones you approve to the Lead Hub."
        actions={
          <Button icon={FileDown} onClick={() => downloadText("lead-upload-template.csv", templateCsv(), "text/csv")}>
            Download template
          </Button>
        }
      />

      <Card title="File">
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean ${
              dragging ? "border-accent bg-tint" : "border-line bg-canvas hover:border-navy/30"
            }`}
          >
            <UploadCloud className="size-9 text-ocean" />
            <p className="font-semibold text-navy">
              {reading ? "Reading the file…" : "Drag a CSV file here, or click to browse"}
            </p>
            <p className="text-xs text-muted">
              CSV only, up to {MAX_FILE_BYTES / 1024 / 1024} MB and {MAX_ROWS.toLocaleString()} rows. The first row must be the column names.
            </p>
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => openFile(e.target.files?.[0])} />
          </div>
          {s.file && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-navy">
              <FileSpreadsheet className="size-4 text-muted" />
              <span className="font-semibold">{s.file.name}</span>
              <span className="text-muted">
                {s.file.rows.length.toLocaleString()} rows · {s.file.headers.length} columns
              </span>
              <Button variant="ghost" icon={RotateCcw} disabled={pushing}
                onClick={() => { set({ file: null, selected: [], pushed: [] }); setNotice(null); }}>
                Clear
              </Button>
            </div>
          )}
        </div>
      </Card>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {s.file ? (
        <>
          <Card title="Match columns" subtitle="Each template column is matched to a column of your file by its name. Change any that are wrong.">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((f) => (
                  <Select key={f.key} label={f.label} value={s.mapping[f.key]} options={[NONE, ...s.file!.headers]}
                    format={(h) => (h === NONE ? "— Not in this file —" : h)} disabled={pushing}
                    onChange={(h) => changeMapping(f.key, h)} />
                ))}
              </div>
              {noEmailColumn && (
                <Alert kind="warning">Email isn&rsquo;t matched. The Lead Hub needs an email for every lead, so nothing can be pushed until it is.</Alert>
              )}
              {unmappedHeaders.length > 0 && (
                <p className="text-sm text-muted">
                  Other columns are kept with each lead as extra fields: {unmappedHeaders.join(", ")}.
                </p>
              )}
            </div>
          </Card>

          <Card title="Leads">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Metric label="Rows in file" value={rows.length.toLocaleString()} />
                <Metric label="Ready" value={(rows.length - notReady).toLocaleString()} />
                <Metric label="Selected to push" value={selectedRows.length.toLocaleString()} />
                <Metric label="Pushed" value={s.pushed.length.toLocaleString()} />
              </div>
              {notReady > 0 && (
                <Alert kind="warning">
                  {notReady} row(s) have no email, an invalid email, or an email already used earlier in the file, so they
                  are not selected. See the Status column. Rows without a valid email can&rsquo;t be pushed; a repeated email
                  updates the same lead.
                </Alert>
              )}
              <Checkbox
                label={`Select all ${rows.length.toLocaleString()} leads`}
                checked={rows.length > 0 && selectedRows.length === rows.length}
                onChange={(v) => set({ selected: all.map(() => v) })}
              />
              <DataTable
                rows={rows.map(({ lead, status }, i) => ({
                  name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.company_name || "",
                  email: lead.email ?? "",
                  phone: lead.phone ?? "",
                  address: [lead.address_line1, lead.address_line2].filter(Boolean).join(", "),
                  city: lead.city ?? "",
                  state: lead.state ?? "",
                  country: lead.country ?? "",
                  zip_code: lead.zip_code ?? "",
                  row: lead.row_number,
                  status: s.pushed.includes(i) ? "Pushed" : status,
                }))}
                columns={["name", "email", "phone", "address", "city", "state", "country", "zip_code", "row", "status"]}
                selected={s.selected}
                onSelectedChange={(selected) => set({ selected })}
              />
              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">
                  Nothing is saved until you push it. Review the leads, then push the ones you approve to the Lead Hub.
                </p>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <Button icon={FileDown} disabled={!selectedRows.length} onClick={downloadSelected}>
                    Download JSON
                  </Button>
                  <Button icon={DatabaseZap} disabled={pushing || !pushableRows.length} onClick={() => pushToHub(pushableRows)}>
                    Push all {pushableRows.length.toLocaleString()}
                  </Button>
                  <Button variant="primary" icon={DatabaseZap} loading={pushing} disabled={!selectedRows.length}
                    onClick={() => pushToHub(selectedRows)}>
                    Push to Lead Hub ({selectedRows.length.toLocaleString()})
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Alert>
          Upload a CSV file to review its leads here. Use &ldquo;Download template&rdquo; for the expected columns: first name,
          last name, email, phone number, address lines 1 and 2, city, state, country and zip code.
        </Alert>
      )}
    </div>
  );
}
