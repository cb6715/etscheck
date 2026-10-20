"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Field, inputClass, Button } from "@/components/ui/primitives";
import { redeemCode } from "@/lib/redeem-actions";

export function RedeemCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!code.trim()) {
      setError("Indtast en kode.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await redeemCode(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-4">
      <Field label="Har du en kode?">
        <input
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Indtast kode"
          autoCapitalize="characters"
        />
      </Field>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <Button variant="secondary" fullWidth onClick={submit} disabled={pending} className="flex items-center justify-center gap-2">
        <KeyRound size={16} /> {pending ? "Indløser..." : "Indløs kode"}
      </Button>
    </div>
  );
}
