"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Clock, CalendarDays, Settings } from "lucide-react";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Hjem", icon: Clock },
  { href: "/uge", label: "Uge", icon: CalendarDays },
  { href: "/indstillinger", label: "Indstillinger", icon: Settings },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className="glass mx-auto flex w-full max-w-lg items-center justify-between rounded-full px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-base font-extrabold tracking-tight">
          <Image
            src="/icon-192.png"
            alt=""
            width={24}
            height={24}
            className="rounded-[7px] shadow-[0_0_10px_-1px_var(--accent-a40)]"
          />
          WageFlow
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-[var(--accent-foreground)] shadow-[0_0_16px_-2px_var(--accent-a40)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
