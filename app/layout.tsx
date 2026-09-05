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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const DESCRIPTION =
  "Shared-house management: chores that are visible and fairly distributed, money that is tracked and settled.";

export const metadata: Metadata = {
  /*
    `metadataBase` is what turns every relative image and canonical in this
    tree into the absolute URL that Open Graph and Twitter both require.
    Without it Next resolves them against localhost in development and warns in
    production, and the card a shared link unfurls into is a broken image.
  */
  metadataBase: new URL(APP_URL),
  title: { default: "HouseOS", template: "%s · HouseOS" },
  description: DESCRIPTION,
  applicationName: "HouseOS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HouseOS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  /*
    The card. `app/opengraph-image.tsx` supplies the image itself, so nothing
    here names a file — Next wires the generated route in and stamps its
    absolute URL, its dimensions and its alt text.

    Every page in the app also sets `robots: { index: false }` on its own shell,
    so what actually gets unfurled is only ever the sign-in screen, the sign-up
    screen or one of the three documents.
  */
  openGraph: {
    type: "website",
    siteName: "HouseOS",
    title: "HouseOS — the work and the money, both visible",
    description: DESCRIPTION,
    url: APP_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "HouseOS — the work and the money, both visible",
    description: DESCRIPTION,
  },
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