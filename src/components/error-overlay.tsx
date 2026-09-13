"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, X } from "lucide-react";

type CaughtError = { message: string; source: string; at: string };

export function ErrorOverlay() {
  const [errors, setErrors] = useState<CaughtError[]>([]);

  useEffect(() => {
    function add(message: string, source: string) {
      setErrors((prev) => [...prev, { message, source, at: new Date().toLocaleTimeString("da-DK") }].slice(-5));
    }

    function onError(event: ErrorEvent) {
      add(event.message || "Ukendt fejl", `${event.filename ?? "?"}:${event.lineno ?? "?"}`);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : JSON.stringify(reason);
      add(message, "unhandledrejection");
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] max-h-[60vh] overflow-y-auto bg-red-950 p-3 text-white shadow-2xl">
      {errors.map((err, idx) => (
        <div key={idx} className="mb-2 flex items-start gap-2 rounded-lg bg-red-900/60 p-2 text-xs">
          <AlertOctagon size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1 break-words">
            <p className="font-mono font-bold">{err.message}</p>
            <p className="opacity-70">
              {err.source} · {err.at}
            </p>
          </div>
        </div>
      ))}
      <button
        onClick={() => setErrors([])}
        className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/10 py-1.5 text-xs font-semibold"
      >
        <X size={12} /> Luk
      </button>
    </div>
  );
}
