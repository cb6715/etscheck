"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Separate from primitives.tsx (which has no "use client" and is also
// imported directly by Server Components, e.g. page.tsx's Card usage) —
// useEffect here would force the WHOLE primitives module client-side,
// breaking every server-rendered use of Card/Button/etc.

/** A real popup, not an inline expand-on-click section — for anything
 * that needs the user to actively look at and approve/confirm something
 * (e.g. reviewing numbers read off an uploaded file) before it's used,
 * rather than something they might miss if it's just tucked under a
 * toggle further down the page. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] p-5 sm:rounded-[28px]"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
