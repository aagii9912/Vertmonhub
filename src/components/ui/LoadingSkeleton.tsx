import React from 'react';

import { cn } from '@/lib/utils';

type SkeletonProps = React.ComponentProps<'div'>;

/**
 * Суурь skeleton — `.skeleton` utility-г ашиглана (globals.css дотор тодорхойлсон).
 * reduced-motion тохиргоог `.skeleton` өөрөө хүндэтгэдэг тул нэмэлт ажиллагаа шаардахгүй.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
    return <div data-slot="skeleton" className={cn('skeleton', className)} {...props} />;
}

// Stats Card Skeleton
export function StatsCardSkeleton() {
    return (
        <div className="bg-surface rounded-xl border border-border p-4 md:p-6">
            <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="w-10 h-10 md:w-12 md:h-12 rounded-2xl" />
            </div>
        </div>
    );
}

// Row Skeleton (list item)
export function RowSkeleton() {
    return (
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4 flex-1">
                <Skeleton className="w-9 h-9 md:w-10 md:h-10 rounded-xl" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                </div>
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
            </div>
        </div>
    );
}

// Table Skeleton
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full max-w-[200px]" />
                        <Skeleton className="h-3 w-full max-w-[150px]" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                </div>
            ))}
        </div>
    );
}

// Chart Skeleton — графикийн карт (гарчиг + баганан/шугаман дүрс)
export function ChartSkeleton({ className }: { className?: string }) {
    const bars = [60, 85, 45, 70, 95, 55, 80];
    return (
        <div className={cn('bg-surface rounded-xl border border-border p-4 md:p-6', className)}>
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-7 w-20 rounded-full" />
            </div>
            <div className="mt-6 flex h-40 items-end gap-2 md:gap-3">
                {bars.map((h, i) => (
                    <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />
                ))}
            </div>
            <div className="mt-4 flex items-center gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
            </div>
        </div>
    );
}

// KPI Grid Skeleton — самбарын ерөнхий ачааллын төлөв
export function KpiGridSkeleton() {
    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface rounded-xl border border-border">
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border">
                        <Skeleton className="h-5 w-32" />
                    </div>
                    <div className="divide-y divide-border">
                        <RowSkeleton />
                        <RowSkeleton />
                        <RowSkeleton />
                    </div>
                </div>
                <div className="bg-surface rounded-xl border border-border p-4 md:p-6">
                    <Skeleton className="h-5 w-32 mb-4" />
                    <div className="space-y-3">
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-16 w-full rounded-md" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Generic Page Skeleton — гарчиг + контентын блокууд (бараг бүх дэд хуудсанд тохирно)
export function PageSkeleton({
    rows = 6,
    showStats = false,
    className,
}: {
    rows?: number;
    showStats?: boolean;
    className?: string;
}) {
    return (
        <div className={cn('space-y-4 md:space-y-6', className)}>
            {/* Header — гарчиг + үйлдлийн товч */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-28 rounded-md" />
            </div>

            {/* Optional stats row */}
            {showStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                    <StatsCardSkeleton />
                    <StatsCardSkeleton />
                    <StatsCardSkeleton />
                    <StatsCardSkeleton />
                </div>
            )}

            {/* Toolbar — хайлт + шүүлтүүр */}
            <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-10 w-full max-w-xs rounded-md" />
                <Skeleton className="h-10 w-28 rounded-md" />
                <Skeleton className="h-10 w-28 rounded-md" />
            </div>

            {/* Content card */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border">
                    <Skeleton className="h-5 w-40" />
                </div>
                <div className="divide-y divide-border">
                    {Array.from({ length: rows }).map((_, i) => (
                        <RowSkeleton key={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// Backward-compatible aliases (хуучин нэрсээр import хийдэг газрууд эвдрэхгүй)
export { KpiGridSkeleton as DashboardSkeleton, RowSkeleton as OrderItemSkeleton };
