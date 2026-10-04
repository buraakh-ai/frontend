import type { NextRequest } from "next/server";
import { leadHubBackendUrl } from "@/lib/server/backends";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these Lead Hub backend (leadhubexport) endpoints are reachable through
// the proxy, each with its own timeout (contract in the README):
//   GET leads?from&to -> [{source_code, lead_id, email, first_name, last_name, ...}, ...]
// Sources send leads to the Lead Hub through their own backends, not this proxy.
const GET_ENDPOINTS = new Map([["leads", 60_000]]);

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
