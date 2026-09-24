import type { NextRequest } from "next/server";
import { leadSourceBackendUrl } from "@/lib/server/backends";
import { getLeadConfig } from "@/lib/server/lead-config";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these Lead source backend endpoints are reachable through the proxy.
const POST_ENDPOINTS = new Set(["run-sourcing-campaign", "v2/run-sourcing-campaign"]);

export async function POST(request: NextRequest, ctx: RouteContext<"/api/lead/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!POST_ENDPOINTS.has(path)) return notFound();

  const { config } = await getLeadConfig();
  return proxyJson(
    `${leadSourceBackendUrl(config.backend.default_url)}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() },
    config.backend.request_timeout_seconds * 1000,
  );
}
