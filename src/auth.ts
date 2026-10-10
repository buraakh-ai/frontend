import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Microsoft single sign-on (Azure / Entra ID) via Auth.js. Off unless
// AUTH_ENABLED=true, so the app keeps working until the Azure app registration
// exists. Everything comes from runtime env (read when the server starts, not
// at build time), so one image serves every environment (see .env.example).
// No "server-only" import: src/proxy.ts uses this module too.

const REQUIRED_ENV = [
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID",
] as const;

export function authEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.AUTH_ENABLED ?? "").trim().toLowerCase());
}

/** SSO env vars that are unset. Non-empty while SSO is on means nobody can sign in. */
export function missingAuthEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
}

// A plain config object, not NextAuth(() => config): with lazy config, the
// auth(callback) wrapper used by src/proxy.ts returns a Promise, not a function.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Pinned to our tenant: without it the provider falls back to /common/,
      // which accepts any Microsoft account.
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      // Sign-in only. The provider's default also requests User.Read to fetch a
      // profile photo, which we don't show.
      authorization: { params: { scope: "openid profile email" } },
      profile: (p) => ({ id: p.sub, name: p.name, email: p.email ?? p.preferred_username }),
    }),
  ],
  secret: process.env.AUTH_SECRET,
  // Behind the ALB: take the public host/scheme from X-Forwarded-* headers.
  trustHost: true,
  // Stateless session cookie; no database. Users sign in again after 8 hours.
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
});
