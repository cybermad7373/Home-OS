import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/layout/theme-script";
import { ToastProvider } from "@/components/ui/toast";
import { OfflineStrip } from "@/components/layout/offline-strip";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker";

// Subset to Latin and preloaded — the font is on the performance budget.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
    { media: "(prefers-color-scheme: light)", color: "#0F766E" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0A09" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
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
