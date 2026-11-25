import type { Metadata } from "next";
import { Upload } from "./upload";

export const metadata: Metadata = { title: "Import Leads · AG FinTax Growth Suite" };

export default function UploadPage() {
  return <Upload />;
}
