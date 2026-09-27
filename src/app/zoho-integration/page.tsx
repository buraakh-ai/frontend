import type { Metadata } from "next";
import { ZohoIntegration } from "./zoho-integration";

export const metadata: Metadata = { title: "Export leads to Zoho · AGFinTax Growth Suite" };

export default function ZohoIntegrationPage() {
  return <ZohoIntegration />;
}
