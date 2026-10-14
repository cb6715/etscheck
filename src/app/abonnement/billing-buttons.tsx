"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { startCheckout, openBillingPortal } from "@/lib/billing-actions";

export function CheckoutButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function go() {
    setError("");
    startTransition(async () => {
      // On success this never returns — startCheckout() redirects server-side.
      const result = await startCheckout();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button fullWidth size="lg" onClick={go} disabled={pending} className="flex items-center justify-center gap-2">
        {pending ? "Åbner betaling..." : "Start abonnement — 9 kr/md"} <ArrowRight size={18} />
      </Button>
      {error && <p className="text-center text-sm font-semibold text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function PortalButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function go() {
    setError("");
    startTransition(async () => {
      // On success this never returns — openBillingPortal() redirects server-side.
      const result = await openBillingPortal();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button fullWidth variant="secondary" onClick={go} disabled={pending} className="flex items-center justify-center gap-2">
        <Settings2 size={16} /> {pending ? "Åbner..." : "Administrer / opsig abonnement"}
      </Button>
      {error && <p className="text-center text-sm font-semibold text-[var(--danger)]">{error}</p>}
    </div>
  );
}
