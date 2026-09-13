import { Home, ClipboardList, Truck, Car, Search, Settings, Calendar, BarChart3, StickyNote } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Hjem", icon: Home },
  { href: "/opgaver", label: "Arbejde", icon: ClipboardList },
  { href: "/vask", label: "Vask", icon: Truck },
  { href: "/drive-in", label: "Drive-in", icon: Car },
  { href: "/sog", label: "Søg", icon: Search },
];

export const SIDEBAR_EXTRA_ITEMS = [
  { href: "/kalender", label: "Kalender", icon: Calendar },
  { href: "/statistik", label: "Statistik", icon: BarChart3 },
  { href: "/noter", label: "Noter & problemer", icon: StickyNote },
  { href: "/indstillinger", label: "Indstillinger", icon: Settings },
];
