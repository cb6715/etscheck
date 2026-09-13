import { ReactNode } from "react";
import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ErrorOverlay } from "@/components/error-overlay";
import { WageBar } from "@/components/wage/wage-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <ErrorOverlay />
      <ServiceWorkerRegister />
      <Sidebar />
      <div className="flex min-h-screen w-full flex-1 flex-col">
        <WageBar />
        <main className="flex-1 pb-28 md:pb-8">
          <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 md:pt-8">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
