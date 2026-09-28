'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { QuickCreateSheet } from '@/components/dashboard/QuickCreateSheet';
import { OutboxSync } from '@/components/dashboard/OutboxSync';
import { AiPanel } from '@/components/ai/AiPanel';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteModule } from '@/lib/navigation/nav';

/**
 * Бүх dashboard / marketing хуудасны нийтлэг shell (v2).
 *
 * v1-д гурван workspace-ийн switcher sidebar-ыг бүхэлд нь сольдог байсан.
 * v2-т НЭГ sidebar, 52px тогтмол толгой, гар утсанд доод таб + голын «+».
 *
 * ЧУХАЛ: header өндөр `--header-h` токеноос уншигдана — ai-assistant/layout.tsx
 * бүтэн өндрийн тооцоондоо мөн үүнийг ашигладаг тул зөрж болохгүй.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    useRealtimeNotifications();
    const pathname = usePathname();
    const { user, isLoaded } = useAuth();
    const moduleName = getRouteModule(pathname);
    const allowed = !!user && (!moduleName || user.role === 'super_admin' || user.permissions.modules.includes(moduleName));
    const isInbox = pathname === '/dashboard/inbox/messages';

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* print:hidden — KPI тайлан г.м хуудсыг хэвлэхэд chrome-гүй цэвэр гарна */}
            <div className="print:hidden">
                <Sidebar />
            </div>

            <div className={`flex flex-col transition-[margin] duration-200 ease-out md:ml-[var(--sidebar-w)] print:ml-0 ${isInbox ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
                <div className="sticky top-0 z-30 shrink-0 print:hidden">
                    <Header />
                </div>
                <main className={`flex-1 p-4 md:p-6 print:p-0 ${isInbox ? 'flex min-h-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-24 md:pb-6'}`}>
                    {!isLoaded ? <p role="status">Уншиж байна…</p>
                        : allowed ? children
                        : <p role="alert">Энэ хэсэгт хандах эрх танд алга.</p>}
                </main>
            </div>

            <div className="print:hidden">
                <MobileNav />
                <CommandPalette />
                <QuickCreateSheet />
                <OutboxSync />
                <AiPanel />
            </div>
        </div>
    );
}
