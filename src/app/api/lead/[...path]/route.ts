import type { NextRequest } from "next/server";
import { leadSourceBackendUrl } from "@/lib/server/backends";
import { getLeadConfig } from "@/lib/server/lead-config";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these Lead source backend endpoints are reachable through the proxy.
// The page uses only the V2 pipeline; the V1 endpoint is no longer exposed.
// export-to-lead-hub sends reviewed leads on to the Lead Hub.
const POST_ENDPOINTS = new Set(["v2/run-sourcing-campaign", "export-to-lead-hub"]);

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
