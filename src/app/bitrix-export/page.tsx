import type { Metadata } from "next";
import { BitrixExport } from "./bitrix-export";

export const metadata: Metadata = { title: "Bitrix24 Export · AG FinTax Growth Suite" };

export default function BitrixExportPage() {
  return <BitrixExport />;
}
