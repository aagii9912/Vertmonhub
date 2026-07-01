'use client';

import { useEffect, useState } from 'react';
import { Target, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatMNT } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface PeriodStat {
    target: number;
    actual: number;
    count?: number;
}

interface MyTarget {
    hasTarget: boolean;
    sales_manager?: string;
    month?: number;
    quarter?: number;
    periods?: {
        month: PeriodStat;
        quarter: PeriodStat;
        year: PeriodStat;
    };
}

function pct(actual: number, target: number): number {
    if (target <= 0) return 0;
    return Math.round((actual / target) * 100);
}

/** Биелэлтийн хувиар өнгө: 100%+ ногоон, 60%+ брэнд, дутуу шар/улаан. */
function barColor(p: number): string {
    if (p >= 100) return 'bg-status-success';
    if (p >= 60) return 'bg-brand';
    if (p >= 30) return 'bg-status-pending';
    return 'bg-status-danger';
}

function ProgressRow({ label, stat }: { label: string; stat: PeriodStat }) {
    const p = pct(stat.actual, stat.target);
    const remaining = Math.max(0, stat.target - stat.actual);
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    <span className="text-foreground font-medium">{formatMNT(stat.actual, { compact: true })}</span>
                    {' / '}
                    {formatMNT(stat.target, { compact: true })}
                </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                        className={cn('h-full rounded-full transition-all', barColor(p))}
                        style={{ width: `${Math.min(100, p)}%` }}
                    />
                </div>
                <span className={cn(
                    'w-11 text-right text-xs font-semibold tabular-nums',
                    p >= 100 ? 'text-status-success' : 'text-muted-foreground',
                )}>
                    {p}%
                </span>
            </div>
            {remaining > 0 ? (
                <p className="mt-1 text-2xs text-muted-foreground">
                    Дутуу: {formatMNT(remaining, { compact: true })}
                </p>
            ) : (
                <p className="mt-1 text-2xs text-status-success">Төлөвлөгөө биелсэн 🎉</p>
            )}
        </div>
    );
}

export function SalesTargetWidget() {
    const [data, setData] = useState<MyTarget | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const res = await fetch('/api/dashboard/my-target', {
                    headers: {
                        'x-shop-id':
                            typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '',
                    },
                });
                const d = await res.json();
                if (!cancel) setData(d);
            } catch {
                if (!cancel) setData({ hasTarget: false });
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, []);

    // Төлөвлөгөө тохируулаагүй бол виджет огт харагдахгүй
    if (loading || !data?.hasTarget || !data.periods) return null;

    const monthP = pct(data.periods.month.actual, data.periods.month.target);

    return (
        <Card className="border-brand/30 bg-gradient-to-br from-brand-soft/40 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Target className="h-4 w-4 text-brand md:h-5 md:w-5" />
                    Миний борлуулалтын төлөвлөгөө
                </CardTitle>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {monthP >= 100 ? 'Сарын зорилт биелсэн' : `Энэ сар ${monthP}%`}
                </span>
            </CardHeader>
            <CardContent className="space-y-4">
                <ProgressRow label="Энэ сар" stat={data.periods.month} />
                <ProgressRow label="Энэ улирал" stat={data.periods.quarter} />
                <ProgressRow label="Энэ жил" stat={data.periods.year} />
            </CardContent>
        </Card>
    );
}
