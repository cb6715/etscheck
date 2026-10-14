"use client";

import { useEffect, useState } from "react";
import { Wallet, Gift } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { TiltWrapper } from "@/components/tilt-wrapper";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Purely a visual demo of what WageCard's live-ticking hero looks like
// once you're checked in — not connected to any real account or data.
export function LiveDemoCard() {
  const [kr, setKr] = useState(1842.3);
  const [elapsed, setElapsed] = useState(4 * 3600 + 12 * 60 + 8);

  useEffect(() => {
    const id = setInterval(() => {
      setKr((v) => Math.round((v + 150 / 3600) * 100) / 100);
      setElapsed((v) => v + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <TiltWrapper maxTilt={9} className="mx-auto w-full max-w-sm">
      <Card className="relative overflow-hidden p-0" elevated>
        <div className="shine relative overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-7 text-[var(--accent-foreground)]">
          <div className="float-blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-sm" />
          <div className="float-blob-slow absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-sm" />
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
              <Wallet size={14} /> Forventet lønudbetaling
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold opacity-90">
              <span className="glow-ring inline-block h-2 w-2 rounded-full bg-white" /> Kører
            </span>
          </div>
          <div className="count-pulse relative mt-2 font-mono text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
            {formatKr(kr)}
          </div>
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold opacity-90">
            <span className="font-mono tabular-nums">{formatClock(elapsed)} på vagten</span>
            <span className="flex items-center gap-1">
              <Gift size={13} /> {formatKr(kr * 0.125)} feriepenge
            </span>
          </div>
        </div>
        <div className="px-5 py-3 text-center text-xs font-semibold text-[var(--muted)]">
          Sådan ser det ud, mens du er tjekket ind — live demo, ikke rigtige data
        </div>
      </Card>
    </TiltWrapper>
  );
}
