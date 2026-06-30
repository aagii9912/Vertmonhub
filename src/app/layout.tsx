import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AnalyticsScripts } from "@/components/marketing/AnalyticsScripts";
import { MarketingAttribution } from "@/components/marketing/MarketingAttribution";
import { Toaster, ConfirmDialogHost } from '@/components/ui/Toast';

// Editorial typography: Fraunces display + IBM Plex Sans body (Cyrillic-ready) + IBM Plex Mono
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans-google",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-display-google",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono-google",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0E10' },
  ],
  width: "device-width",
  initialScale: 1,
  // Хүртээмж: томруулахыг хориглохгүй (maximumScale/userScalable хасав — WCAG 1.4.4)
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "Vertmon Hub - AI Борлуулагч",
  description: "Moncon Construction Group-ийн AI платформ. Үл хөдлөх хөрөнгийн борлуулалтыг автоматжуулна.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vertmon Hub",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'color-scheme': 'light dark',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${ibmPlexSans.variable} ${fraunces.variable} ${ibmPlexMono.variable} antialiased`}
      >
        {/* Theme-ийг будахаас өмнө тавьж flash-аас сэргийлнэ (хадгалсан сонголт эсвэл OS) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('vh-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        <AnalyticsScripts />
        <MarketingAttribution />
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
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
