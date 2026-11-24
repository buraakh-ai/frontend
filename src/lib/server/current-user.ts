import "server-only";
import { headers } from "next/headers";
import { auth, authEnabled, missingAuthEnv } from "@/auth";

// The signed-in user comes from Microsoft SSO (src/auth.ts) when it is on.
// Otherwise sign-in may happen in front of the app (ALB authentication with
// Cognito / OIDC), which adds the user's claims to every request as
// `x-amzn-oidc-data` (a JWT). The ALB has already verified it and strips any
// client-sent copy, so the payload is only decoded here.

type Claims = { name?: string; given_name?: string; email?: string; preferred_username?: string };

function decodeJwtPayload(token: string): Claims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  } catch {
    return null;
  }
}

/** Email of the signed-in user (SSO, else the ALB's claims), or null when the
 * request carries none. DEV_USER_EMAIL stands in locally. */
export async function currentUserEmail(): Promise<string | null> {
  if (authEnabled() && missingAuthEnv().length === 0) {
    const ssoEmail = (await auth())?.user?.email?.trim();
    if (ssoEmail) return ssoEmail.toLowerCase();
  }
  const h = await headers();
  const oidc = h.get("x-amzn-oidc-data");
  const claims = oidc ? decodeJwtPayload(oidc) : null;
  const email = claims?.email || (claims?.preferred_username?.includes("@") ? claims.preferred_username : undefined) || process.env.DEV_USER_EMAIL;
  return email?.trim().toLowerCase() || null;
}

/** Display name of the signed-in user, or null when the request carries none.
 * DEV_USER_NAME stands in locally, where there is no sign-in. */
export async function currentUserName(): Promise<string | null> {
  if (authEnabled() && missingAuthEnv().length === 0) {
    const ssoName = (await auth())?.user?.name?.trim();
    // First name only, as with the ALB's given_name.
    if (ssoName) return ssoName.split(/\s+/)[0];
  }
  const h = await headers();
  const oidc = h.get("x-amzn-oidc-data");
  const claims = oidc ? decodeJwtPayload(oidc) : null;
  const name =
    claims?.given_name ||
    claims?.name ||
    claims?.preferred_username ||
    claims?.email?.split("@")[0] ||
    process.env.DEV_USER_NAME;
  return name?.trim() || null;
}
