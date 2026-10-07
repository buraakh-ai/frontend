import "server-only";
import { headers } from "next/headers";

// The app has no login of its own: sign-in happens in front of it (ALB
// authentication with Cognito / OIDC), which adds the signed-in user's claims
// to every request as `x-amzn-oidc-data` (a JWT). The ALB has already verified
// it and strips any client-sent copy, so the payload is only decoded here.

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

/** Display name of the signed-in user, or null when the request carries none.
 * DEV_USER_NAME stands in locally, where there is no ALB. */
export async function currentUserName(): Promise<string | null> {
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
