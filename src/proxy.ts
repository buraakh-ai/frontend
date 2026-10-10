import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth, authEnabled, missingAuthEnv } from "@/auth";

// Typed explicitly so auth() picks its proxy/middleware overload rather than
// the route-handler one.
type SessionCheck = (request: NextAuthRequest, event: NextFetchEvent) => ReturnType<NextMiddleware>;

// With SSO on (AUTH_ENABLED=true) every page and every /api/* backend proxy
// needs a signed-in user. Deny by default: the matcher below skips only the
// sign-in flow, the load balancer health check and static assets.
const checkSession: SessionCheck = (req) => {
  if (req.auth) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Same envelope as the proxies, so pages show it like any backend error.
    return Response.json({ ok: false, error: "Your session has expired. Reload the page to sign in again." }, { status: 401 });
  }
  // Build the absolute URL from what the browser used. Behind the ALB the
  // container sees plain HTTP on :3000, and req.nextUrl would carry that.
  const proto = req.headers.get("x-forwarded-proto") === "https" ? "https" : req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const back = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(`${proto}://${host}/login?callbackUrl=${back}`);
};
const requireSession = auth(checkSession);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!authEnabled()) return NextResponse.next();
  const missing = missingAuthEnv();
  if (missing.length) {
    // Fail closed rather than serve the app without sign-in.
    console.error(`AUTH_ENABLED=true but ${missing.join(", ")} not set; blocking all requests.`);
    return new Response("Sign-in is enabled but not configured on the server.", { status: 503 });
  }
  return requireSession(request, event);
}

export const config = {
  matcher: ["/((?!api/auth/|api/health$|login$|_next/static/|_next/image|favicon\\.ico$|agfintax-mark\\.png$).*)"],
};
