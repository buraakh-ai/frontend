import type { NextRequest } from "next/server";
import { bitrixExportApiKey, bitrixExportBackendUrl } from "@/lib/server/backends";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these bitrixexport backend endpoints are reachable through the proxy,
// each with its own timeout (contract in the README):
//   GET forms                                              -> {count, items: [{id, name, active, is_callback}]}
//   GET leads?form_id&date_from&date_to&contact_details    -> {form, filter, count, items: [...]}
// Exporting the leads goes through the Zoho module's proxy (/api/zoho/zoho/export).
const GET_ENDPOINTS = new Map([
  ["forms", 60_000],
  ["leads", 300_000],
]);

export async function GET(request: NextRequest, ctx: RouteContext<"/api/bitrix/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = GET_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  const apiKey = bitrixExportApiKey();
  return proxyJson(
    `${bitrixExportBackendUrl()}/${path}${request.nextUrl.search}`,
    { method: "GET", headers: apiKey ? { "X-API-Key": apiKey } : undefined },
    timeoutMs,
  );
}
