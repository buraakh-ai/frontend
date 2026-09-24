import type { Metadata } from "next";
import { connection } from "next/server";
import { envFlag } from "@/lib/server/backends";
import { AdGenerator } from "./ad-generator";

export const metadata: Metadata = { title: "Ad generator · AGFinTax Growth Suite" };

export default async function AdGeneratorPage() {
  await connection(); // read env at request time, not build time
  return (
    <AdGenerator
      defaults={{
        companyUrl: process.env.DEFAULT_COMPANY_URL ?? "",
        companyName: process.env.DEFAULT_COMPANY_NAME ?? "",
        contactUrl: process.env.DEFAULT_CONTACT_URL ?? "",
      }}
      // Off by default: this creates real (draft) campaigns on live Marketing APIs.
      showPaidPromotion={envFlag("ENABLE_PAID_PROMOTION")}
    />
  );
}
