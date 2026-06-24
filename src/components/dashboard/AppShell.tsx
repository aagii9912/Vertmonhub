'use client';

import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

/**
 * Бүх workspace (Борлуулалт / AI / Маркетинг)-д нийтлэг shell.
 * /dashboard/* болон /marketing/* хоёул үүнийг ашиглана — sidebar нь
 * идэвхтэй workspace-аар автоматаар солигдоно.
 *
 * ЧУХАЛ: <main>-ийн padding (p-4 md:p-6 lg:p-8) болон header өндөр (h-14 = 3.5rem)
 * хэвээр байх ёстой — ai-assistant/layout.tsx сөрөг margin-аар бүтэн өндөр болохдоо
 * эдгээрээс хамаардаг.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    useRealtimeNotifications();

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Sidebar />
            <div className="md:ml-64 transition-all duration-300 min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
                    {children}
                </main>
            </div>
            <MobileNav />

            {/* Санал хүсэлт */}
            <FeedbackWidget />
        </div>
    );
}
