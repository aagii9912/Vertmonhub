'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/utils/logger';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        const installHandler = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', installHandler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installHandler);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (!deferredPrompt) return false;

        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                setIsInstalled(true);
                setDeferredPrompt(null);
                return true;
            }
            return false;
        } catch (err) {
            logger.error('PWA Install error:', { error: err });
            return false;
        }
    }, [deferredPrompt]);

    // Smart timing - show after delay
    const triggerPromptAfterStep = useCallback((step: number) => {
        // Show after step 3 (halfway through setup)
        if (step >= 3 && isInstallable && !isInstalled) {
            setTimeout(() => setShowPrompt(true), 2000);
        }
    }, [isInstallable, isInstalled]);

    const dismissPrompt = useCallback(() => {
        setShowPrompt(false);
        // Don't show again for this session
        sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    }, []);

    // Check if already dismissed this session
    useEffect(() => {
        if (sessionStorage.getItem('pwa_prompt_dismissed') === 'true') {
            setShowPrompt(false);
        }
    }, []);

    return {
        isInstallable,
        isInstalled,
        showPrompt,
        promptInstall,
        dismissPrompt,
        triggerPromptAfterStep
    };
}
