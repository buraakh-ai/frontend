import type { NextRequest } from "next/server";
import { bitrixExportApiKey, bitrixExportBackendUrl } from "@/lib/server/backends";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these bitrixexport backend endpoints are reachable through the proxy,
// each with its own timeout (contract in the README):
//   GET  getBitrixLeads?date_from&date_to&contact_details -> {count, categories, items: [...]}
//   POST exportToLeadHub {leads: [...]}                    -> {sent, items: [{lead_id, bitrix_lead_id}]}
const GET_ENDPOINTS = new Map([["getBitrixLeads", 300_000]]);
const POST_ENDPOINTS = new Map([["exportToLeadHub", 120_000]]);

const apiKeyHeader = (): Record<string, string> => {
  const apiKey = bitrixExportApiKey();
  return apiKey ? { "X-API-Key": apiKey } : {};
};

export async function GET(request: NextRequest, ctx: RouteContext<"/api/bitrix/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = GET_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(
    `${bitrixExportBackendUrl()}/${path}${request.nextUrl.search}`,
    { method: "GET", headers: apiKeyHeader() },
    timeoutMs,
  );
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/bitrix/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const timeoutMs = POST_ENDPOINTS.get(path);
  if (timeoutMs === undefined) return notFound();

  return proxyJson(
    `${bitrixExportBackendUrl()}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json", ...apiKeyHeader() }, body: await request.text() },
    timeoutMs,
  );
}
