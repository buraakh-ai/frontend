import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LogIn } from "lucide-react";
import { auth, authEnabled, missingAuthEnv, signIn } from "@/auth";
import { Alert, Button } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in · AGFinTax Growth Suite" };

// Auth.js error codes (?error=...) worth explaining; anything else gets a generic message.
const ERRORS: Record<string, string> = {
  AccessDenied: "Your Microsoft account doesn't have access to this app. Ask your admin to add you.",
  Configuration: "Sign-in isn't set up correctly on the server. Please contact the admin.",
};

// Same-site paths only, so a crafted link can't send people elsewhere after sign-in.
function safePath(value: string | string[] | undefined): string {
  const p = typeof value === "string" ? value : "";
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection(); // SSO settings are runtime env
  if (!authEnabled()) redirect("/");

  const params = await searchParams;
  const target = safePath(params.callbackUrl);
  const configured = missingAuthEnv().length === 0;
  if (configured && (await auth())) redirect(target);

  const error = !configured
    ? ERRORS.Configuration
    : typeof params.error === "string"
      ? (ERRORS[params.error] ?? "Sign-in didn't complete. Please try again.")
      : null;

  return (
    <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
      <Image src="/agfintax-mark.png" alt="AG FinTax" width={60} height={36} priority className="h-10 w-auto" />
      <h1 className="mt-6 text-2xl font-bold">AGFinTax Growth Suite</h1>
      <p className="mt-1.5 text-sm text-muted">Sign in with your AGFinTax Microsoft account to continue.</p>
      {error && <div className="mt-5"><Alert kind="error">{error}</Alert></div>}
      <form
        className="mt-6"
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: target });
        }}
      >
        {/* Icon as a child: a component can't be passed as a prop from a server to a client component. */}
        <Button type="submit" variant="primary" block disabled={!configured}>
          <LogIn className="size-4" aria-hidden />
          Sign in with Microsoft
        </Button>
      </form>
    </div>
  );
}
