'use client';

import * as React from 'react';
import { useChartColors } from '@/hooks/useChartColors';
import { cn } from '@/lib/utils';

/**
 * AgingBar — авлагын насжилтын (receivables aging) хэвтээ стак баганан график.
 *
 * 4 бүлгийг (0-30 / 31-60 / 61-90 / 90+ хоног) нэг хэвтээ баганан дээр харьцангуй
 * өргөнөөр харуулна. Өнгө нь "ногоон → улаан" утга илэрхийлэх статус токенуудаас
 * (status-success / pending / active / danger) ирнэ. Доор нь сонголтоор легенд гарна.
 *
 * Цэвэр CSS (recharts биш) — багана нь жижиг, нэг мөр тул хэт хүнд биш, reduced-motion
 * найдвартай (зөвхөн өргөний transition).
 *
 * Жишээ:
 *   <AgingBar
 *     buckets={{ current: 8_000_000, d30: 3_200_000, d60: 1_100_000, d90: 900_000 }}
 *     valueFormatter={(v) => formatMNT(v)}
 *   />
 */
export interface AgingBuckets {
    /** 0-30 хоног */
    current: number;
    /** 31-60 хоног */
    d30: number;
    /** 61-90 хоног */
    d60: number;
    /** 90+ хоног */
    d90: number;
}

export interface AgingBarProps {
    buckets: AgingBuckets;
    /** Бүлгийн утга форматлагч (жишээ: formatMNT). default toLocaleString */
    valueFormatter?: (value: number) => string;
    /** Легенд харуулах. default true */
    showLegend?: boolean;
    /** Багана дээр хувь харуулах (≥8% сегментүүдэд). default false */
    showPercent?: boolean;
    /** Баганы өндөр (px). default 14 */
    barHeight?: number;
    className?: string;
}

interface Segment {
    key: keyof AgingBuckets;
    label: string;
    value: number;
    color: string;
}

export function AgingBar({
    buckets,
    valueFormatter,
    showLegend = true,
    showPercent = false,
    barHeight = 14,
    className,
}: AgingBarProps) {
    const c = useChartColors();

    const segments: Segment[] = [
        { key: 'current', label: '0–30 хоног', value: Math.max(0, buckets.current || 0), color: c.aging[0] },
        { key: 'd30', label: '31–60 хоног', value: Math.max(0, buckets.d30 || 0), color: c.aging[1] },
        { key: 'd60', label: '61–90 хоног', value: Math.max(0, buckets.d60 || 0), color: c.aging[2] },
        { key: 'd90', label: '90+ хоног', value: Math.max(0, buckets.d90 || 0), color: c.aging[3] },
    ];

    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const fmt = (v: number) => (valueFormatter ? valueFormatter(v) : v.toLocaleString('en-US'));
    const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

    return (
        <div data-slot="aging-bar" className={cn('w-full', className)}>
            <div
                className="flex w-full overflow-hidden rounded-full bg-surface-2"
                style={{ height: barHeight }}
                role="img"
                aria-label={`Авлагын насжилт. Нийт ${fmt(total)}`}
            >
                {total === 0 ? (
                    <div className="flex-1" />
                ) : (
                    segments.map((s) => {
                        const p = pct(s.value);
                        if (p <= 0) return null;
                        return (
                            <div
                                key={s.key}
                                className="h-full transition-[width] duration-300"
                                style={{ width: `${p}%`, backgroundColor: s.color }}
                                title={`${s.label}: ${fmt(s.value)} (${p.toFixed(0)}%)`}
                            >
                                {showPercent && p >= 8 && (
                                    <span className="flex h-full items-center justify-center text-2xs font-medium text-brand-fg tabular-nums">
                                        {p.toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {showLegend && (
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    {segments.map((s) => (
                        <li key={s.key} className="flex items-center gap-1.5 min-w-0">
                            <span
                                aria-hidden
                                className="inline-block size-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: s.color }}
                            />
                            <span className="min-w-0">
                                <span className="block text-2xs text-muted-foreground truncate">{s.label}</span>
                                <span className="block text-xs font-semibold tabular-nums text-foreground">
                                    {fmt(s.value)}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
