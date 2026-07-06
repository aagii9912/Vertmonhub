'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Бүх чартуудад зориулсан нэгдсэн tooltip. recharts-ийн `content` prop-д дамжуулна.
 * Дизайн токенуудаар загварчилсан (bg-surface, border-border, shadow-md).
 *
 * `formatter` өгвөл утга бүрийг форматлана (жишээ: formatMNT). Үгүй бол toLocaleString.
 */
export interface ChartTooltipProps {
    active?: boolean;
    payload?: Array<{
        name?: string;
        value?: number | string;
        color?: string;
        dataKey?: string | number;
        payload?: Record<string, unknown>;
    }>;
    label?: React.ReactNode;
    /**
     * Утга форматлагч (жишээ: (v) => formatMNT(v)). Хоёр дахь аргумент нь цувааны
     * нэр — өөр масштабтай цуваануудыг (ComboChart) ялгаж форматлахад ашиглана.
     */
    formatter?: (value: number, name?: string) => string;
    /** Серийн нэр харуулах эсэх (1-ээс олон цуваатай үед хэрэгтэй). default true */
    showName?: boolean;
    /** Гарчгийн (label) дээр харагдах текст форматлагч */
    labelFormatter?: (label: React.ReactNode) => React.ReactNode;
    className?: string;
}

const defaultFormat = (value: number | string | undefined): string => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value ?? '—');
};

export function ChartTooltip({
    active,
    payload,
    label,
    formatter,
    showName = true,
    labelFormatter,
    className,
}: ChartTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div
            data-slot="chart-tooltip"
            className={cn(
                'rounded-md border border-border bg-surface px-3 py-2 shadow-md',
                'text-xs text-foreground min-w-[8rem]',
                className,
            )}
        >
            {label != null && label !== '' && (
                <p className="font-medium text-foreground mb-1.5">
                    {labelFormatter ? labelFormatter(label) : label}
                </p>
            )}
            <div className="flex flex-col gap-1">
                {payload.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                                aria-hidden
                                className="inline-block size-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            {showName && entry.name ? entry.name : null}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">
                            {formatter && typeof entry.value === 'number'
                                ? formatter(
                                      entry.value,
                                      typeof entry.name === 'string' ? entry.name : undefined,
                                  )
                                : defaultFormat(entry.value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
