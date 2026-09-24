"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Alert, Button, PageHeader } from "@/components/ui";

// Last-resort fallback, e.g. if a backend (which we don't control) returns a
// shape the page can't render. The sidebar stays usable around it.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="Something went wrong" />
      <div className="space-y-4">
        <Alert kind="error">
          This page hit an unexpected problem, possibly an unexpected response from the backend. Your other module is
          unaffected.
        </Alert>
        <Button variant="primary" icon={RotateCcw} onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </>
  );
}
