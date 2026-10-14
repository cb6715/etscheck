"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { signIn } from "@/lib/actions";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await signIn(email.trim(), password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <Field label="E-mail" required>
        <input
          className={inputClass}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dig@firma.dk"
        />
      </Field>
      <Field label="Adgangskode" required>
        <input
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••••"
        />
      </Field>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <Button fullWidth size="lg" onClick={submit} disabled={pending} className="flex items-center justify-center gap-1.5">
        {pending ? "Logger ind..." : "Log ind"} <ArrowRight size={16} />
      </Button>
      <p className="text-center text-sm text-[var(--muted)]">
        Ingen konto?{" "}
        <Link href="/onboarding" className="font-bold text-[var(--accent)] underline underline-offset-2">
          Opret en
        </Link>
      </p>
    </Card>
  );
}
