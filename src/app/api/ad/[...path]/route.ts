import type { NextRequest } from "next/server";
import { adGeneratorBackendUrl } from "@/lib/server/backends";
import { notFound, proxyFile, proxyJson } from "@/lib/server/proxy";

// Only these Ad generator backend endpoints are reachable through the proxy.
const POST_ENDPOINTS = new Set([
  "generate",
  "generate-image",
  "retry-event",
  "switch-image-provider",
  "post-to-instagram",
  "post-to-facebook",
  "post-to-linkedin",
  "create-facebook-ad-campaign",
  "activate-facebook-ad-campaign",
  // Managing a Meta draft/campaign: reach estimate, status, results, pause,
  // and a budget change (password-gated by the backend, like activation).
  "facebook-ad-audience-estimate",
  "facebook-ad-campaign-status",
  "facebook-ad-insights",
  "pause-facebook-ad-campaign",
  "update-facebook-ad-budget",
  "create-linkedin-ad-campaign",
  "activate-linkedin-ad-campaign",
]);
const TIMEOUT_MS = 180_000;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/ad/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!POST_ENDPOINTS.has(path)) return notFound();

  const base = adGeneratorBackendUrl();
  const body = await request.json();
  // The browser only knows the image's backend path (/static/x.jpg); the
  // social/ads APIs need an absolute URL they can fetch, so resolve it here.
  if (typeof body?.image_url === "string" && body.image_url.startsWith("/static/")) {
    body.image_url = `${base}${body.image_url}`;
  }
  return proxyJson(
    `${base}/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    TIMEOUT_MS,
  );
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/ad/[...path]">) {
  const segments = (await ctx.params).path;
  // The active (non-secret) Meta ad settings from the backend's .env.
  if (segments.join("/") === "facebook-ad-config") {
    return proxyJson(`${adGeneratorBackendUrl()}/facebook-ad-config`, { method: "GET" }, 30_000);
  }
  // Generated images, served by the backend under /static/.
  if (segments[0] === "static" && segments.length === 2) {
    return proxyFile(`${adGeneratorBackendUrl()}/static/${encodeURIComponent(segments[1])}`, 30_000);
  }
  return notFound();
}
