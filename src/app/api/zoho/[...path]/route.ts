import type { NextRequest } from "next/server";
import { zohoIntegrationBackendUrl } from "@/lib/server/backends";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these zohoexport backend endpoints are reachable through the proxy,
// each with its own timeout (contract in the README):
//   GET    zoho/crm/v8/Leads?created_from&created_to   -> {data: [Lead/Contact, ...], info}
//   GET    zoho/lists                                  -> [{list_id, list_name}, ...]
//   POST   zoho/lists {list_name, emails, description?} -> {list_key, list_name, message}
//   POST   zoho/lists/members {emails, list_key | list_name} -> {list_key, list_name, results, total, succeeded, failed}
//   POST   zoho/crm/contacts {records}                 -> {results, total, succeeded, failed} (Lead Hub sync)
//   GET    zoho/campaigns?status&from_index&range      -> [{campaign_key, campaign_name, campaign_status, ...}, ...]
//   POST   zoho/campaigns {campaign_name, subject, from_email, from_name?, list_keys, content_url} -> {campaign_key, message}
//   POST   zoho/campaigns/{campaign_key}/clone {campaign_name, subject, from_name?, from_email?, reply_to?}
//                                                     -> {campaign_status, details} (a new draft; same content and lists)
//   POST   zoho/campaigns/{campaign_key}/send {}       -> Zoho's response (emails real people)
const GET_ENDPOINTS = new Map([
  // The backend pages through Zoho's search API itself, so large ranges take a while.
  ["zoho/crm/v8/Leads", 180_000],
  ["zoho/lists", 60_000],
  ["zoho/campaigns", 60_000],
]);
const POST_ENDPOINTS = new Map([
  ["zoho/lists", 120_000],
  ["zoho/lists/members", 600_000],
  ["zoho/crm/contacts", 600_000],
  ["zoho/campaigns", 120_000],
]);
// POST zoho/campaigns/{campaign_key}/send and .../clone: the key is Zoho's (letters and digits).
const CAMPAIGN_ACTION = /^zoho\/campaigns\/[A-Za-z0-9]+\/(?:send|clone)$/;
const CAMPAIGN_ACTION_TIMEOUT_MS = 120_000;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/zoho/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = GET_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(`${zohoIntegrationBackendUrl()}/${path}${request.nextUrl.search}`, { method: "GET" }, timeoutMs);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/zoho/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = POST_ENDPOINTS.get(path) ?? (CAMPAIGN_ACTION.test(path) ? CAMPAIGN_ACTION_TIMEOUT_MS : undefined);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(
    `${zohoIntegrationBackendUrl()}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() },
    timeoutMs,
  );
}
