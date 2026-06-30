'use client';

import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

/**
 * Бүх workspace (Борлуулалт / AI / Маркетинг)-д нийтлэг shell.
 * /dashboard/* болон /marketing/* хоёул үүнийг ашиглана — sidebar нь
 * идэвхтэй workspace-аар автоматаар солигдоно.
 *
 * ЧУХАЛ: <main>-ийн padding (p-4 md:p-6 lg:p-8) болон header өндөр (--header-h:
 * 3.5rem mobile / 4rem md) хэвээр байх ёстой — ai-assistant/layout.tsx сөрөг
 * margin-аар бүтэн өндөр болохдоо --header-h token-аас хамаардаг (globals.css).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    useRealtimeNotifications();

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Sidebar />
            <div className="md:ml-[var(--sidebar-w)] transition-all duration-300 min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
                    {children}
                </main>
            </div>
            <MobileNav />

            {/* Глобал ⌘K команд хайлт */}
            <CommandPalette />

            {/* Санал хүсэлт */}
            <FeedbackWidget />
        </div>
    );
}
