"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_ITEMS, SIDEBAR_EXTRA_ITEMS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { Plus } from "lucide-react";
import { useState } from "react";
import { QuickActionSheet } from "./fab-menu";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 px-6 py-6">
        <Image src="/logo.png" alt="" width={36} height={36} className="rounded-xl" />
        <span className="text-lg font-bold tracking-tight">Arbejdsapp</span>
      </div>

      <div className="px-4">
        <button
          onClick={() => setOpen(true)}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground transition hover:brightness-105"
        >
          <Plus size={18} strokeWidth={3} />
          Ny registrering
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="my-2 h-px bg-border" />
        {SIDEBAR_EXTRA_ITEMS.map((item) => (
          <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <ThemeToggle />
      </div>

      <QuickActionSheet open={open} onClose={() => setOpen(false)} />
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function SideLink({
  item,
  active,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"
      )}
    >
      <Icon size={19} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </Link>
  );
}
