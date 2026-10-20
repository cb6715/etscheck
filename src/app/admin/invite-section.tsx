"use client";

import { useState, useTransition } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { Card, inputClass, Button, Badge } from "@/components/ui/primitives";
import { createInvite } from "@/lib/redeem-actions";

type Invite = { email: string; code: string };

export function InviteSection() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function invite() {
    if (!email.trim()) {
      setError("Indtast en e-mail.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createInvite(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInvites((i) => [{ email: email.trim(), code: result.data.code }, ...i]);
      setEmail("");
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      // clipboard can fail silently (permissions) — the code is still shown on screen either way
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <UserPlus size={16} /> Inviter bruger
      </h2>
      <p className="text-xs text-[var(--muted)]">
        Skriv den nye brugers e-mail, og du får en kode til ét brug — send koden til dem, så de kan indløse den på
        Abonnement-siden og få gratis adgang med det samme.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@eksempel.dk"
        />
        <Button onClick={invite} disabled={pending} className="flex items-center gap-1.5">
          <UserPlus size={14} /> Generér kode
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}

      {invites.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {invites.map((inv) => (
            <li key={inv.code} className="glass flex items-center justify-between gap-2 rounded-xl p-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--muted)]">{inv.email}</p>
                <Badge tone="success" className="mt-0.5 font-mono tracking-wider">
                  {inv.code}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => copy(inv.code)}
                className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--surface-2)]"
              >
                {copiedCode === inv.code ? <Check size={14} /> : <Copy size={14} />}
                {copiedCode === inv.code ? "Kopieret" : "Kopiér"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
