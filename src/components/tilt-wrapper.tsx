"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";

// A physical, light-catching card: tilts towards the pointer/finger with
// real 3D perspective and a soft sheen that follows it, instead of sitting
// flat on the page. Falls back gracefully to no tilt (just the base shadow)
// wherever pointermove never fires, e.g. a plain tap with no drag.
export function TiltWrapper({
  children,
  className,
  maxTilt = 7,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const tiltX = (0.5 - py) * maxTilt * 2;
    const tiltY = (px - 0.5) * maxTilt * 2;
    el.style.setProperty("--tilt-x", `${tiltX}deg`);
    el.style.setProperty("--tilt-y", `${tiltY}deg`);
    el.style.setProperty("--tilt-s", "1.015");
    el.style.setProperty("--sheen-x", `${px * 100}%`);
    el.style.setProperty("--sheen-y", `${py * 100}%`);
    el.classList.add("tilt-active");
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--tilt-s", "1");
    el.classList.remove("tilt-active");
  }

  return (
    <div
      ref={ref}
      className={`tilt-card relative ${className ?? ""}`}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      {children}
      <div className="tilt-sheen pointer-events-none absolute inset-0 rounded-3xl" />
    </div>
  );
}
