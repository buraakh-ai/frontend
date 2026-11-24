import type { Metadata } from "next";
import { Upload } from "./upload";

export const metadata: Metadata = { title: "Upload Leads · AGFinTax Growth Suite" };

export default function UploadPage() {
  return <Upload />;
}
