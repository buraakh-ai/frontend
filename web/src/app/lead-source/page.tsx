import type { Metadata } from "next";
import { connection } from "next/server";
import { getLeadConfig } from "@/lib/server/lead-config";
import { LeadSource } from "./lead-source";

export const metadata: Metadata = { title: "Lead source · AGFinTax Growth Suite" };

export default async function LeadSourcePage() {
  await connection(); // config overrides come from runtime env (S3 / file)
  const { config, warning } = await getLeadConfig();
  return <LeadSource config={config} warning={warning} />;
}
