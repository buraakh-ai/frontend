import type { NextRequest } from "next/server";
import { zohoIntegrationBackendUrl } from "@/lib/server/backends";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these zohoexport backend endpoints are reachable through the proxy,
// each with its own timeout (contract in the README):
//   GET  records?start_date&end_date                 -> [{email, first_name, last_name}, ...]
//   GET  zoho/lists                                  -> [{list_id, list_name}, ...]
//   POST zoho/export {records, list_key | list_name} -> {results, total, succeeded, failed}
//   POST zoho/crm/contacts {records}                 -> {results, total, succeeded, failed} (Lead Hub sync)
const GET_ENDPOINTS = new Map([
  ["records", 60_000],
  ["zoho/lists", 60_000],
]);
const POST_ENDPOINTS = new Map([
  ["zoho/export", 600_000],
  ["zoho/crm/contacts", 600_000],
]);

export async function GET(request: NextRequest, ctx: RouteContext<"/api/zoho/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = GET_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(`${zohoIntegrationBackendUrl()}/${path}${request.nextUrl.search}`, { method: "GET" }, timeoutMs);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/zoho/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = POST_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(
    `${zohoIntegrationBackendUrl()}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() },
    timeoutMs,
  );
}
