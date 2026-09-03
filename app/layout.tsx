import type { Metadata, Viewport } from "next";
import { Doto, Geist, Geist_Mono } from "next/font/google";
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
 * Doto is a dot-matrix face and it is the display voice — used only for a
 * number somebody reads at a glance: what the house owes, what the week scored,
 * how many days are left. A figure in a dot matrix reads as a *readout*, which
 * is what a household ledger's headline number actually is. It is unreadable
 * set as a sentence, and that is a useful constraint rather than a limitation.
 */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700", "900"],
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
    <html lang="en" className={`${geist.variable} ${doto.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
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