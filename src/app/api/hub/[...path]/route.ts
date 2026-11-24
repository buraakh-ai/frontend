import type { NextRequest } from "next/server";
import { leadHubBackendUrl } from "@/lib/server/backends";
import { currentUserEmail } from "@/lib/server/current-user";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these Lead Hub backend (leadhubexport) endpoints are reachable through
// the proxy, each with its own timeout (contract in the README):
//   GET  leads?from&to   -> [{source_code, lead_id, email, first_name, last_name, ...}, ...]
//   POST fileUploadLeads {file_name, uploaded_by, records: [...]}
//                        -> {upload_id, row_count, lead_ids}  (Upload module; at most 1000 records)
// Sources send leads to the Lead Hub through their own backends, not this proxy.
// The Upload module is the exception: it has no backend (the CSV is parsed in
// the browser), so it posts the approved leads here.
const GET_ENDPOINTS = new Map([["leads", 60_000]]);
const POST_ENDPOINTS = new Map([["fileUploadLeads", 120_000]]);

const notConnected = () =>
  Response.json({ ok: false, error: "The Lead Hub isn't connected yet (LEAD_HUB_BACKEND_URL is not set)." });

export async function GET(request: NextRequest, ctx: RouteContext<"/api/hub/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = GET_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  const base = leadHubBackendUrl();
  if (!base) return notConnected();

  return proxyJson(`${base}/${path}${request.nextUrl.search}`, { method: "GET" }, timeoutMs);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/hub/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = POST_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  const base = leadHubBackendUrl();
  if (!base) return notConnected();

  // The uploader is set here from the session, never taken from the browser.
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "The request body must be a JSON object." });
  }
  body.uploaded_by = await currentUserEmail();

  return proxyJson(
    `${base}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    timeoutMs,
  );
}
