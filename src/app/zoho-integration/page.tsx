import type { Metadata } from "next";
import { ZohoIntegration } from "./zoho-integration";

export const metadata: Metadata = { title: "Zoho Campaigns Sync · AG FinTax Growth Suite" };

export default function ZohoIntegrationPage() {
  return <ZohoIntegration />;
}
