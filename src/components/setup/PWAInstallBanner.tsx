'use client';

import { Download, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface PWAInstallBannerProps {
    onDismiss?: () => void;
}

export function PWAInstallBanner({ onDismiss }: PWAInstallBannerProps) {
    const { isInstallable, isInstalled, showPrompt, promptInstall, dismissPrompt } = usePWAInstall();

    if (isInstalled || !showPrompt || !isInstallable) return null;

    const handleInstall = async () => {
        const success = await promptInstall();
        if (success) {
            onDismiss?.();
        }
    };

    const handleDismiss = () => {
        dismissPrompt();
        onDismiss?.();
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom duration-500">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-4 shadow-2xl shadow-violet-500/30">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                        <Smartphone className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold mb-1">
                            Апп суулгах 📱
                        </h3>
                        <p className="text-white/80 text-sm">
                            Syncly-г гар утсандаа суулгаад хурдан хандах боломжтой
                        </p>
                    </div>

                    <button
                        onClick={handleDismiss}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0"
                    >
                        <X className="w-5 h-5 text-white/70" />
                    </button>
                </div>

                <div className="flex gap-3 mt-4">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-2.5 text-white/80 font-medium rounded-xl hover:bg-white/10 transition-colors text-sm"
                    >
                        Дараа
                    </button>
                    <button
                        onClick={handleInstall}
                        className="flex-1 py-2.5 bg-[#0F0B2E] text-violet-600 font-semibold rounded-xl hover:bg-white/90 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <Download className="w-4 h-4" />
                        Суулгах
                    </button>
                </div>
            </div>
        </div>
    );
}
