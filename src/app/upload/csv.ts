// CSV parsing and the Upload module's lead template. Runs in the browser; the
// file never leaves the computer until the person pushes leads to the Lead Hub.

/** The template columns, in the order of the downloadable template. Each maps
 * to a field of the Lead Hub's POST /fileUploadLeads record (README). */
export const FIELDS = [
  { key: "first_name", label: "First name", aliases: ["firstname", "first", "givenname", "fname"] },
  { key: "last_name", label: "Last name", aliases: ["lastname", "last", "surname", "familyname", "lname"] },
  { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail", "emailid"] },
  { key: "phone", label: "Phone number", aliases: ["phone", "phonenumber", "mobile", "mobilenumber", "cell", "telephone", "tel", "contactnumber"] },
  { key: "address_line1", label: "Address line 1", aliases: ["addressline1", "address1", "address", "street", "streetaddress"] },
  { key: "address_line2", label: "Address line 2", aliases: ["addressline2", "address2", "suite", "apartment", "unit"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state", "province", "region", "stateprovince"] },
  { key: "country", label: "Country", aliases: ["country", "countrycode"] },
  { key: "zip_code", label: "Zip code", aliases: ["zipcode", "zip", "postalcode", "postcode", "pincode"] },
  // Not in the meeting's template, but the Lead Hub shows both, so they're kept as columns.
  { key: "company_name", label: "Company (optional)", aliases: ["companyname", "company", "organization", "organisation", "org", "businessname", "business"] },
  { key: "job_title", label: "Job title (optional)", aliases: ["jobtitle", "title", "role", "position", "designation"] },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
/** Template field -> file header ("" = not in the file). */
export type Mapping = Record<FieldKey, string>;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type ParsedFile = { name: string; headers: string[]; rows: string[][] };

const normalize = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Matches each template field to the first file header that is one of its names. */
export function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const mapping = {} as Mapping;
  for (const field of FIELDS) {
    const names: readonly string[] = [normalize(field.key), ...field.aliases];
    const match = headers.find((h) => !used.has(h) && names.includes(normalize(h)));
    mapping[field.key] = match ?? "";
    if (match) used.add(match);
  }
  return mapping;
}

/** The template as a CSV header line, for the "Download template" button. */
export const templateCsv = () => FIELDS.map((f) => f.key).join(",") + "\r\n";

/** Reads a File as text: UTF-8, or Windows-1252 when it isn't valid UTF-8
 * (Excel's plain "CSV" on Windows), so accented names aren't garbled. */
export async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Parses CSV text (RFC 4180: quoted fields, "" escapes, line breaks inside
 * quotes). The delimiter is whichever of , ; or tab is most common in the
 * first line. Blank lines are skipped; the first row is the header. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best);

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    records.push(row);
  }

  const nonBlank = records.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonBlank.length) return { headers: [], rows: [] };
  // Unique, non-empty header names ("Email", "Email (2)", "Column 5").
  const seen = new Map<string, number>();
  const headers = nonBlank[0].map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const rows = nonBlank.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}
