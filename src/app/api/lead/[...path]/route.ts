import type { NextRequest } from "next/server";
import { leadSourceBackendUrl } from "@/lib/server/backends";
import { getLeadConfig } from "@/lib/server/lead-config";
import { notFound, proxyJson } from "@/lib/server/proxy";

// Only these Lead source backend endpoints are reachable through the proxy.
// The page starts a V2 run as a background job (v2/sourcing-jobs) and polls
// v2/sourcing-jobs/{id} for progress; v2/run-sourcing-campaign is the older
// single-request form. v2/sourcing-jobs/{id}/cancel is the Stop button.
// export-to-lead-hub sends reviewed leads on to the Lead Hub.
const POST_ENDPOINTS = new Set(["v2/run-sourcing-campaign", "v2/sourcing-jobs", "export-to-lead-hub"]);
const JOB_STATUS = /^v2\/sourcing-jobs\/[0-9a-f-]{36}$/;
const JOB_CANCEL = /^v2\/sourcing-jobs\/[0-9a-f-]{36}\/cancel$/;
const POLL_TIMEOUT_MS = 30_000;

async function backendBase() {
  const { config } = await getLeadConfig();
  return { base: leadSourceBackendUrl(config.backend.default_url), timeoutMs: config.backend.request_timeout_seconds * 1000 };
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/lead/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!POST_ENDPOINTS.has(path) && !JOB_CANCEL.test(path)) return notFound();

  const { base, timeoutMs } = await backendBase();
  return proxyJson(
    `${base}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() },
    timeoutMs,
  );
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/lead/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!JOB_STATUS.test(path)) return notFound();

  const { base } = await backendBase();
  return proxyJson(`${base}/${path}`, { method: "GET" }, POLL_TIMEOUT_MS);
}
