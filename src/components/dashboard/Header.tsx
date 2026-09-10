'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBreadcrumb, getNavTitle } from '@/lib/navigation/nav';
import { openCommandPalette, openQuickCreate } from '@/lib/navigation/commandPalette';
import { useNavCounts } from '@/hooks/useNavCounts';

/**
 * Хуудасны толгой — 52px, бүх breakpoint дээр ижил өндөр (--header-h).
 *
 * v1-д гарчиг + breakpoint-оор өөрчлөгддөг өндөр + workspace switcher байсан.
 * v2-т: breadcrumb (гар утсанд ч), мэдэгдэл, «Шинэ» гэсэн ганц үндсэн үйлдэл.
 */
export function Header() {
    const pathname = usePathname() || '';
    const crumbs = getBreadcrumb(pathname);
    const title = getNavTitle(pathname);

    // N товчлуур — түргэн бүртгэл. Оролтод бичиж байхад ажиллахгүй.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'n' && e.key !== 'N' && e.key !== 'ү' && e.key !== 'Ү') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            e.preventDefault();
            openQuickCreate('lead');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <header
            className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 md:px-6"
            style={{ height: 'var(--header-h)' }}
        >
            {/* Гар утсанд брэнд, дэлгэц дээр breadcrumb */}
            <Link
                href="/dashboard"
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-brand text-[14px] font-bold text-brand-fg md:hidden"
                aria-label="Vertmon Hub"
            >
                V
            </Link>

            <nav aria-label="Замын мөр" className="flex min-w-0 items-center gap-1.5">
                {crumbs.length > 1 ? (
                    crumbs.map((c, i) => {
                        const last = i === crumbs.length - 1;
                        return (
                            <React.Fragment key={`${c.name}-${i}`}>
                                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                {last ? (
                                    <h1 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground">{c.name}</h1>
                                ) : c.href ? (
                                    <Link href={c.href} className="truncate text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                                        {c.name}
                                    </Link>
                                ) : (
                                    <span className="truncate text-[13px] text-muted-foreground">{c.name}</span>
                                )}
                            </React.Fragment>
                        );
                    })
                ) : (
                    <h1 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
                )}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
                {/* Гар утсанд хайлт (sidebar байхгүй тул) */}
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground focus-ring md:hidden"
                    aria-label="Хайх"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={1.75} strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                    </svg>
                </button>

                <NotificationBell />

                <button
                    type="button"
                    onClick={() => openQuickCreate('lead')}
                    className={cn(
                        'flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12.5px] font-medium text-brand-fg',
                        'transition-colors hover:bg-brand-strong focus-ring',
                    )}
                >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    <span>Шинэ</span>
                    <kbd className="mono-label hidden text-[10.5px] opacity-75 sm:inline">N</kbd>
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
            className="relative flex h-[30px] w-[30px] items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground focus-ring"
            aria-label={inbox > 0 ? `${inbox} шинэ мессеж` : 'Мэдэгдэл'}
        >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {inbox > 0 && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-status-danger ring-2 ring-surface" />
            )}
        </Link>
    );
}
