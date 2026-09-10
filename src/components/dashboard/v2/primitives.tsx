'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * v2 самбарын жижиг primitive-үүд. Зарчим: хил хязгаар сүүдрээс илүү,
 * нэг accent, тоонууд tabular, толгой 12.5px/600.
 */

export function Panel({
    title,
    sub,
    right,
    className,
    bodyClassName,
    children,
}: {
    title?: React.ReactNode;
    sub?: React.ReactNode;
    right?: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}) {
    return (
        <section className={cn('flex min-w-0 flex-col rounded-md border border-border bg-surface', className)}>
            {(title || right) && (
                <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
                    {title && <h2 className="truncate text-[12.5px] font-semibold text-foreground">{title}</h2>}
                    {sub && <span className="truncate text-[12px] text-muted-foreground">{sub}</span>}
                    {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
                </header>
            )}
            <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
        </section>
    );
}

export function Progress({
    value,
    max = 100,
    className,
    overColor = true,
}: {
    value: number;
    max?: number;
    className?: string;
    /** 100%-иас давсан хэсгийг --ok өнгөөр */
    overColor?: boolean;
}) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    const base = Math.min(100, Math.max(0, pct));
    const over = overColor && pct > 100 ? Math.min(100, ((pct - 100) / pct) * 100) : 0;
    return (
        <div className={cn('relative h-1.5 w-full overflow-hidden rounded-sm bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-sm bg-brand" style={{ width: `${over ? 100 - over : base}%` }} />
            {over > 0 && <div className="absolute inset-y-0 right-0 bg-status-success" style={{ width: `${over}%` }} />}
        </div>
    );
}

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-[9.5px] font-semibold text-fg-2',
                className,
            )}
            aria-hidden
        >
            {initials(name)}
        </span>
    );
}

export function initials(name?: string | null): string {
    if (!name) return '—';
    const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Pill({
    tone = 'neutral',
    children,
    className,
}: {
    tone?: 'info' | 'pending' | 'success' | 'danger' | 'neutral';
    children: React.ReactNode;
    className?: string;
}) {
    const tones = {
        info: 'bg-status-info-soft text-status-info',
        pending: 'bg-status-pending-soft text-status-pending',
        success: 'bg-status-success-soft text-status-success',
        danger: 'bg-status-danger-soft text-status-danger',
        neutral: 'bg-surface-2 text-fg-2',
    } as const;
    return (
        <span className={cn('inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', tones[tone], className)}>
            {children}
        </span>
    );
}

export function GhostButton({
    className,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 focus-ring',
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
    return <div className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

/** Мөрийн эрэмбийн жижиг тэмдэг (1 → accent, бусад → muted). */
export function Rank({ n }: { n: number }) {
    return (
        <span
            className={cn(
                'mono-label inline-flex h-5 w-5 items-center justify-center rounded text-[11px]',
                n === 1 ? 'bg-brand-soft text-brand' : 'text-muted-foreground',
            )}
        >
            {n}
        </span>
    );
}
