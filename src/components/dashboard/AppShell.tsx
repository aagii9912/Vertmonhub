'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { ShortcutsDialog } from '@/components/dashboard/ShortcutsDialog';
import { QuickCreateSheet } from '@/components/dashboard/QuickCreateSheet';
import { OutboxSync } from '@/components/dashboard/OutboxSync';
import { AiPanel } from '@/components/ai/AiPanel';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { getRouteModule, isSuperAdminRoute } from '@/lib/navigation/nav';

/**
 * Ажилтны бүх хуудасны (dashboard, marketing, удирдлага) нийтлэг shell — v3.
 *
 * Зөвхөн веб: sidebar үргэлж харагдана (232px / хумисан 64px), 56px дээд мөр,
 * хамгийн бага өргөн 1024px (түүнээс нарийн цонхонд хэвтээ гүйлгэнэ). Гар утасны
 * доод таб, «+» товч v3-т хасагдсан.
 *
 * ЧУХАЛ: дээд мөрийн өндөр `--header-h` токеноос уншигдана — ai-assistant/layout.tsx
 * бүтэн өндрийн тооцоондоо мөн үүнийг ашигладаг тул зөрж болохгүй.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    useRealtimeNotifications();
    const pathname = usePathname();
    const { user, isLoaded } = useAuth();
    const moduleName = getRouteModule(pathname);
    const isSuperAdmin = user?.role === 'super_admin';
    const allowed = !!user && (isSuperAdminRoute(pathname)
        ? isSuperAdmin
        : (!moduleName || isSuperAdmin || user.permissions.modules.includes(moduleName)));
    const isInbox = pathname === '/dashboard/inbox/messages';

    return (
        <div className="min-h-screen min-w-[1024px] bg-background text-foreground">
            <a href="#workspace-content" className="sr-only z-50 rounded-md bg-foreground p-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Үндсэн агуулга руу очих</a>
            {/* print:hidden — KPI тайлан г.м хуудсыг хэвлэхэд chrome-гүй цэвэр гарна */}
            <div className="print:hidden">
                <Sidebar />
            </div>

            <div className={`flex flex-col transition-[margin] duration-200 ease-out ml-[var(--sidebar-w)] print:ml-0 ${isInbox ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
                <div className="sticky top-0 z-30 shrink-0 print:hidden">
                    <Header />
                </div>
                <main id="workspace-content" tabIndex={-1} className={`flex-1 p-8 print:p-0 ${isInbox ? 'flex min-h-0 flex-col' : ''}`}>
                    {!isLoaded ? <p role="status">Уншиж байна…</p>
                        : allowed ? children
                        : <p role="alert">Энэ хэсэгт хандах эрх танд алга.</p>}
                </main>
            </div>

            <div className="print:hidden">
                <CommandPalette />
                <ShortcutsDialog />
                <QuickCreateSheet />
                <OutboxSync />
                <AiPanel />
            </div>
        </div>
    );
}
