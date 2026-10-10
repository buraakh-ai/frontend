import type { Metadata } from "next";
import { ZohoIntegration } from "./zoho-integration";

export const metadata: Metadata = { title: "Zoho Campaigns Sync · AGFinTax Growth Suite" };

export default function ZohoIntegrationPage() {
  return <ZohoIntegration />;
}
