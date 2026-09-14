"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives";

// Catches errors thrown while rendering a page's own content (the app
// shell around it — sidebar, nav, wage bar — keeps working since this
// boundary lives one level below the root layout).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle size={40} className="text-danger" />
      <h1 className="text-lg font-bold">Noget gik galt</h1>
      <p className="max-w-sm text-sm text-muted">
        Denne side stødte på en fejl og kunne ikke vises. Dine data er ikke påvirket.
      </p>
      <Button onClick={reset}>Prøv igen</Button>
    </div>
  );
}
