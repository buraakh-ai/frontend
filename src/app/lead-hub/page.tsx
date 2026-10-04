import type { Metadata } from "next";
import { connection } from "next/server";
import { leadHubBackendUrl } from "@/lib/server/backends";
import { LeadHub } from "./lead-hub";

export const metadata: Metadata = { title: "Lead Hub · AGFinTax Growth Suite" };

export default async function LeadHubPage() {
  await connection(); // read LEAD_HUB_BACKEND_URL at request time, not build time
  return <LeadHub hubConnected={!!leadHubBackendUrl()} />;
}
