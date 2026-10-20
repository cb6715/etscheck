"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { PartyPopper, TrendingUp, CalendarCheck, Clock, Bell } from "lucide-react";
import { fireNativeNotification } from "@/lib/notify";

type ToastTone = "milestone" | "hour-milestone" | "overtime" | "period" | "default";

type Toast = { id: number; title: string; body: string; tone: ToastTone };

type ToastContextValue = {
  /** Shows an in-app toast and, if the browser has granted permission,
   * also fires a native OS notification with the same text. */
  notify: (title: string, body: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, typeof Bell> = {
  milestone: PartyPopper,
  "hour-milestone": Clock,
  overtime: TrendingUp,
  period: CalendarCheck,
  default: Bell,
};

const TONE_ACCENT: Record<ToastTone, string> = {
  milestone: "from-[var(--accent)] to-[var(--accent-2)]",
  "hour-milestone": "from-sky-500 to-blue-500",
  overtime: "from-amber-500 to-orange-500",
  period: "from-[var(--accent-2)] to-[var(--accent-3)]",
  default: "from-[var(--accent)] to-[var(--accent-2)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((title: string, body: string, tone: ToastTone = "default") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, title, body, tone }]);
    fireNativeNotification(title, body);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  function dismiss(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 [padding-top:max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className="glass-strong animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-3.5 text-left shadow-[var(--shadow-ambient-lg)]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ${TONE_ACCENT[t.tone]}`}
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{t.title}</span>
                <span className="block text-xs text-[var(--muted)]">{t.body}</span>
              </span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast skal bruges inde i ToastProvider.");
  return ctx;
}
