import type { NextRequest } from "next/server";
import { authEnabled, handlers, missingAuthEnv } from "@/auth";

// Auth.js endpoints (sign-in, Microsoft callback, sign-out, session).
// 404 while SSO is off, like any unknown route; 503 while it is on but unconfigured.
function unavailable(): Response | null {
  if (!authEnabled()) return new Response("Not found", { status: 404 });
  if (missingAuthEnv().length) return new Response("Sign-in is enabled but not configured on the server.", { status: 503 });
  return null;
}

export const GET = (request: NextRequest) => unavailable() ?? handlers.GET(request);
export const POST = (request: NextRequest) => unavailable() ?? handlers.POST(request);
