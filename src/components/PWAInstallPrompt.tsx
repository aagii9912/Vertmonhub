'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already installed (standalone mode)
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        setIsStandalone(isStandaloneMode);

        if (isStandaloneMode) return;

        // Check if iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setIsIOS(isIOSDevice);

        // Check if already dismissed
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const dismissedDate = new Date(dismissed);
            const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
            // Show again after 7 days
            if (daysSinceDismissed < 7) return;
        }

        // For iOS, show after a delay
        if (isIOSDevice) {
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        }

        // Listen for beforeinstallprompt (Chrome, Edge, Samsung Browser)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setTimeout(() => setShowPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowPrompt(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    };

    // Don't show if already installed or no prompt available
    if (isStandalone || !showPrompt) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-80 z-50 animate-slide-up">
            <div className="bg-gradient-to-r from-blue-600 to-brand-strong rounded-2xl p-4 shadow-2xl shadow-blue-500/25">
                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 p-1 text-white/70 hover:text-white transition-colors"
                    aria-label="Хаах"
                >
                    <X size={18} />
                </button>

                <div className="flex items-start gap-3">
                    <div className="p-2 bg-surface/20 rounded-xl flex-shrink-0">
                        <Download size={24} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold text-sm">
                            Vertmon Hub суулгах
                        </h3>
                        <p className="text-white/80 text-xs mt-0.5">
                            {isIOS
                                ? 'Safari дээр Share → Add to Home Screen дарна уу'
                                : 'Утсандаа app шиг суулгаарай'}
                        </p>
                    </div>
                </div>

                {isIOS ? (
                    <div className="mt-3 flex items-center justify-center gap-2 text-white/90 text-xs bg-surface/10 rounded-lg py-2 px-3">
                        <Share size={16} />
                        <span>Share товч → Add to Home Screen</span>
                    </div>
                ) : (
                    <button
                        onClick={handleInstall}
                        className="mt-3 w-full bg-surface text-status-info font-semibold py-2.5 px-4 rounded-xl text-sm hover:bg-status-info-soft transition-colors active:scale-[0.98]"
                    >
                        Суулгах
                    </button>
                )}
            </div>
        </div>
    );
}
