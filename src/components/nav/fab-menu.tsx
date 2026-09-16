"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, ClipboardList, Car, Truck, StickyNote, AlertTriangle, Sun,
  Calendar, BarChart3, Settings, Fuel, Wrench,
} from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { AddQuantityModal } from "@/components/briefing/add-quantity-modal";

type Action = { label: string; icon: typeof Plus; tone: string; href?: string; quantityCategory?: string };

const ACTIONS: Action[] = [
  { label: "Briefing", icon: Sun, href: "/planlaegning", tone: "text-accent bg-warning-bg" },
  { label: "Opgave", icon: ClipboardList, href: "/opgaver?new=1", tone: "text-info bg-info-bg" },
  { label: "Drive-in", icon: Car, href: "/drive-in?new=1", tone: "text-warning bg-warning-bg" },
  { label: "Trailer", icon: Truck, href: "/vask?new=1", tone: "text-brand bg-info-bg" },
  { label: "Note", icon: StickyNote, href: "/noter?new=1", tone: "text-success bg-success-bg" },
  { label: "Problem", icon: AlertTriangle, href: "/noter?new=1&problem=1", tone: "text-danger bg-danger-bg" },
  { label: "Tankning", icon: Fuel, quantityCategory: "Tankninger", tone: "text-warning bg-warning-bg" },
  { label: "Reparation", icon: Wrench, quantityCategory: "Trailerreparationer", tone: "text-brand bg-info-bg" },
  { label: "Kalender", icon: Calendar, href: "/kalender", tone: "text-accent bg-warning-bg" },
  { label: "Statistik", icon: BarChart3, href: "/statistik", tone: "text-info bg-info-bg" },
  { label: "Indstillinger", icon: Settings, href: "/indstillinger", tone: "text-muted bg-surface-2" },
];

export function FabMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ny registrering"
        className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-[var(--accent-a30)] transition active:scale-95"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
      <QuickActionSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function QuickActionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [quantityCategory, setQuantityCategory] = useState<string | null>(null);

  return (
    <>
      <Modal open={open && !quantityCategory} onClose={onClose} title="Hurtig registrering">
        <div className="grid grid-cols-3 gap-3">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => {
                  if (action.quantityCategory) {
                    setQuantityCategory(action.quantityCategory);
                  } else if (action.href) {
                    onClose();
                    router.push(action.href);
                  }
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-2 p-4 transition hover:border-[var(--accent-a50)] active:scale-95"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.tone}`}>
                  <Icon size={22} />
                </span>
                <span className="text-sm font-semibold">{action.label}</span>
              </button>
            );
          })}
        </div>
      </Modal>
      <AddQuantityModal
        open={Boolean(quantityCategory)}
        initialCategory={quantityCategory ?? ""}
        onClose={() => {
          setQuantityCategory(null);
          onClose();
        }}
      />
    </>
  );
}
