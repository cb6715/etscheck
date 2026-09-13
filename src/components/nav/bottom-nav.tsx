"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_ITEMS } from "./nav-items";
import { FabMenu } from "./fab-menu";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="relative mx-auto flex max-w-lg items-stretch justify-between px-1">
        {NAV_ITEMS.slice(0, 3).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="flex w-14 items-center justify-center">
          <FabMenu />
        </div>
        {NAV_ITEMS.slice(3).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavLink({
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
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition",
        active ? "text-accent" : "text-muted"
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </Link>
  );
}
