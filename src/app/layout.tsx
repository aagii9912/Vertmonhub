import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AnalyticsScripts } from "@/components/marketing/AnalyticsScripts";
import { MarketingAttribution } from "@/components/marketing/MarketingAttribution";
import { Toaster, ConfirmDialogHost } from '@/components/ui/Toast';

// Vertmon Hub v3 typography: Inter (variable; Cyrillic incl. Ө Ү in cyrillic-ext, and the ₮ sign —
// Golos Text had no ₮ glyph) + JetBrains Mono for codes and IDs.
const inter = Inter({
  variable: "--font-sans-google",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-google",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  // v3 «Шөнө»: dark is the default theme on every device.
  themeColor: '#0B0D12',
  width: "device-width",
  initialScale: 1,
  // Хүртээмж: томруулахыг хориглохгүй (maximumScale/userScalable хасав — WCAG 1.4.4)
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "Vertmon Hub - Үл хөдлөхийн борлуулалтын CRM",
  description: "Moncon Construction Group-ийн үл хөдлөх хөрөнгийн борлуулалт, CRM, маркетингийн платформ.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vertmon Hub",
  },
  // /favicon.ico comes from src/app/favicon.ico (file convention); the SVG serves modern browsers.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'color-scheme': 'dark light',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        {/* Theme-ийг будахаас өмнө тавьж flash-аас сэргийлнэ: бараан нь үндсэн, цайвар нь хэрэглэгчийн сонголт. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;try{var t=localStorage.getItem('vh-theme')==='light'?'light':'dark';d.setAttribute('data-theme',t);if(localStorage.getItem('vertmonhub_sidebar_collapsed')==='1')d.setAttribute('data-sidebar','collapsed');}catch(e){d.setAttribute('data-theme','dark');}})();`,
          }}
        />
        <AnalyticsScripts />
        <MarketingAttribution />
        <ServiceWorkerRegistration />
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
            <ConfirmDialogHost />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
