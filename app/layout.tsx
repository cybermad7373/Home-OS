import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/layout/theme-script";
import { ToastProvider } from "@/components/ui/toast";
import { OfflineStrip } from "@/components/layout/offline-strip";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";

/**
 * Three faces, three jobs, and the split is the design.
 *
 * Geist reads: labels, sentences, everything a person parses as language. It is
 * deliberately the neutral one — in a monochrome interface the text face should
 * not have a voice, because the layout is doing all the talking.
 *
 * Geist Mono counts: every amount, target and tally in a table or a row, so a
 * column of rupee figures aligns and reads as money rather than as an estimate.
 *
 * Geist Mono is also the display voice: the headline figures are the same face
 * at 32-44px, tabular and heavy. There is no third family. A dot-matrix face
 * (Doto) held that role until 2026-09-05 and was dropped — the reasoning and
 * the reversal are both in D-72.
 */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "HouseOS", template: "%s · HouseOS" },
  description:
    "Shared-house management: chores that are visible and fairly distributed, money that is tracked and settled.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HouseOS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ToastProvider>
          <OfflineStrip />
          {children}
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}