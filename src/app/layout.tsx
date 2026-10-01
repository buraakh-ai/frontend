import type { Metadata } from "next";
import { Montserrat, Red_Hat_Display } from "next/font/google";
import { connection } from "next/server";
import { Sidebar } from "@/components/sidebar";
import { auth, authEnabled, missingAuthEnv, signOut } from "@/auth";
import "./globals.css";

// Same families as agfintax.com: Red Hat Display for headings and the menu,
// Montserrat for body text and buttons.
const redHat = Red_Hat_Display({ variable: "--font-red-hat", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AGFinTax Growth Suite",
  description: "AI marketing & growth modules for AGFinTax.",
};

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // AUTH_ENABLED is runtime env, not build time
  const sso = authEnabled() && missingAuthEnv().length === 0;
  const session = sso ? await auth() : null;

  return (
    <html lang="en" className={`${redHat.variable} ${montserrat.variable} antialiased`}>
      <body className="min-h-screen font-sans md:flex">
        {sso && !session ? (
          // Signed out: only the sign-in page is reachable (src/proxy.ts), shown without the menu.
          <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-10">{children}</main>
        ) : (
          <>
            <Sidebar user={session?.user} onSignOut={sso ? signOutAction : undefined} />
            <main className="min-w-0 flex-1">
              <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
            </main>
          </>
        )}
      </body>
    </html>
  );
}
