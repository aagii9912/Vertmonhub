'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBreadcrumb, getNavTitle } from '@/lib/navigation/nav';
import { openCommandPalette, openQuickCreate } from '@/lib/navigation/commandPalette';
import { onPageTitle } from '@/lib/navigation/pageTitle';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { ProjectSwitcher } from '@/components/dashboard/ProjectSwitcher';
import { BrandMark } from '@/components/brand/BrandMark';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useNavCounts } from '@/hooks/useNavCounts';

/**
 * Хуудасны толгой — 56px, бүх breakpoint дээр ижил өндөр (--header-h).
 *
 * v1-д гарчиг + breakpoint-оор өөрчлөгддөг өндөр + workspace switcher байсан.
 * v2-т: breadcrumb (гар утсанд ч), мэдэгдэл, «Шинэ» гэсэн ганц үндсэн үйлдэл.
 */
export function Header() {
    const pathname = usePathname() || '';
    const { data: dashboardMode } = useDashboardMode();
    const [override, setOverride] = useState<string | null>(null);
    useEffect(() => onPageTitle(setOverride), []);
    useEffect(() => setOverride(null), [pathname]);

    const crumbs = override ? [] : getBreadcrumb(pathname);
    const title = override ?? (pathname === '/dashboard' ? (dashboardMode?.mode === 'personal' ? 'Өнөөдөр' : 'Самбар') : getNavTitle(pathname));

    // N товчлуур — түргэн бүртгэл. Оролтод бичиж байхад ажиллахгүй.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'n' && e.key !== 'N' && e.key !== 'ү' && e.key !== 'Ү') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
            e.preventDefault();
            openQuickCreate('lead');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <header
            className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-8"
            style={{ height: 'var(--header-h)' }}
        >
            {/* Гар утсанд брэнд, дэлгэц дээр breadcrumb */}
            <Link href="/dashboard" className="shrink-0 rounded-md md:hidden" aria-label="Vertmon Hub">
                <BrandMark className="size-7" />
            </Link>
            {/* Гар утсанд sidebar байхгүй тул төсөл солих цэсийг толгойд харуулна. */}
            <div className="md:hidden"><ProjectSwitcher variant="compact" /></div>

            <nav aria-label="Замын мөр" className="flex min-w-0 items-center gap-1.5">
                {crumbs.length > 1 ? (
                    crumbs.map((c, i) => {
                        const last = i === crumbs.length - 1;
                        return (
                            <React.Fragment key={`${c.name}-${i}`}>
                                {i > 0 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />}
                                {last ? (
                                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                                ) : c.href ? (
                                    <Link href={c.href} className="hidden truncate sm:block text-sm text-muted-foreground transition-colors hover:text-foreground">
                                        {c.name}
                                    </Link>
                                ) : (
                                    <span className="hidden truncate sm:block text-sm text-muted-foreground">{c.name}</span>
                                )}
                            </React.Fragment>
                        );
                    })
                ) : (
                    <p className="truncate text-sm font-semibold text-foreground">{title}</p>
                )}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1">
                {/* Гар утсанд хайлт (sidebar байхгүй тул) */}
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
                    aria-label="Хайх"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={1.75} strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                    </svg>
                </button>

                <NotificationBell />
                <FeedbackWidget />

                <button
                    type="button"
                    onClick={() => openQuickCreate('lead')}
                    className={cn(
                        'hidden md:flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-brand-fg',
                        'shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-brand-hover',
                    )}
                >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    <span>Лид нэмэх</span>
                    <kbd className="mono-label hidden rounded bg-white/15 px-1 text-xs leading-4 sm:inline">N</kbd>
                </button>
            </div>
        </header>
    );
}

function NotificationBell() {
    const { inbox = 0 } = useNavCounts();

    return (
        <Link
            href="/dashboard/inbox"
            className="relative flex h-10 w-9 md:size-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label={inbox > 0 ? `Мессежүүд: ${inbox} яриа хариу хүлээж байна` : 'Мессежүүд'}
        >
            <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
            {inbox > 0 && (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-background" />
            )}
        </Link>
    );
}
