import type { Metadata, Viewport } from "next";
import { Golos_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AnalyticsScripts } from "@/components/marketing/AnalyticsScripts";
import { MarketingAttribution } from "@/components/marketing/MarketingAttribution";
import { Toaster, ConfirmDialogHost } from '@/components/ui/Toast';

// Vertmon Hub typography: Golos Text (UI, Cyrillic-ready) + JetBrains Mono (тоо, огноо, ID)
const golosText = Golos_Text({
  variable: "--font-sans-google",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-google",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F7F9' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1216' },
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
        className={`${golosText.variable} ${jetbrainsMono.variable} antialiased`}
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
