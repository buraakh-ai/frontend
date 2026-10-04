import type { Metadata } from "next";
import { BitrixExport } from "./bitrix-export";

export const metadata: Metadata = { title: "Bitrix24 Export · AGFinTax Growth Suite" };

export default function BitrixExportPage() {
  return <BitrixExport />;
}
