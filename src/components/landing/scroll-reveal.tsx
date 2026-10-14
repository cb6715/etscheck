"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Fades a section up into place the first time it scrolls into view —
// cheap, no layout dependency on JS (the section is just invisible until
// observed, never blocks content if JS is slow to hydrate since the
// IntersectionObserver fires almost immediately for anything already
// on-screen on first paint).
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => el.classList.add("reveal-visible"), delayMs);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delayMs]);

  return (
    <div ref={ref} className={`reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}
