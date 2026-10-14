import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vagtløn",
  description: "Tjek ind, tjek ud, se din løn — med det samme.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <div className="aurora-layer" aria-hidden="true">
          <div
            className="aurora-blob aurora-drift-a"
            style={{ top: "-10%", left: "-15%", width: "60vw", height: "60vw", background: "var(--accent)" }}
          />
          <div
            className="aurora-blob aurora-drift-b"
            style={{ top: "10%", right: "-20%", width: "55vw", height: "55vw", background: "var(--accent-2)" }}
          />
          <div
            className="aurora-blob aurora-drift-c"
            style={{ bottom: "-15%", left: "10%", width: "50vw", height: "50vw", background: "var(--accent-3)" }}
          />
        </div>
        <NavBar />
        <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-5 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
