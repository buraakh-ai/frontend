import type { Metadata } from "next";
import { Montserrat, Red_Hat_Display } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

// Same families as agfintax.com: Red Hat Display for headings and the menu,
// Montserrat for body text and buttons.
const redHat = Red_Hat_Display({ variable: "--font-red-hat", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AGFinTax Growth Suite",
  description: "AI marketing & growth modules for AGFinTax.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${redHat.variable} ${montserrat.variable} antialiased`}>
      <body className="min-h-screen font-sans md:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
        </main>
      </body>
    </html>
  );
}
