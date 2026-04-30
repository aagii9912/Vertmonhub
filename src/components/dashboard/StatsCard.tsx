import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
    title: string;
    value: string | number;
    change?: {
        value: number;
        isPositive: boolean;
    };
    icon: LucideIcon;
    /**
     * Visual tone of the icon tile. Defaults to brand (terracotta).
     * Maps to the editorial design system status palette.
     */
    iconColor?: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'
        // legacy aliases
        | 'bg-brand' | 'bg-blue' | 'bg-emerald' | 'bg-violet' | 'bg-rose';
    /** @deprecated kept for back compat */
    gradient?: string;
}

type IconTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<IconTone, { tile: string }> = {
    brand: { tile: 'bg-brand-soft text-brand-strong' },
    info: { tile: 'bg-status-info-soft text-status-info' },
    success: { tile: 'bg-status-success-soft text-status-success' },
    warning: { tile: 'bg-status-pending-soft text-status-pending' },
    danger: { tile: 'bg-status-danger-soft text-status-danger' },
    neutral: { tile: 'bg-surface-2 text-foreground' },
};

const LEGACY_TONE_MAP: Record<string, IconTone> = {
    'bg-brand': 'brand',
    'bg-blue': 'info',
    'bg-emerald': 'success',
    'bg-violet': 'brand',
    'bg-rose': 'danger',
};

function resolveTone(value: StatsCardProps['iconColor']): IconTone {
    if (!value) return 'brand';
    if (value in TONE_CLASSES) return value as IconTone;
    return LEGACY_TONE_MAP[value as string] || 'brand';
}

export function StatsCard({ title, value, change, icon: Icon, iconColor }: StatsCardProps) {
    const tone = resolveTone(iconColor);
    const tileClass = TONE_CLASSES[tone].tile;

    return (
        <div className="rounded-xl border border-border bg-surface p-4 md:p-5 transition-colors hover:border-border-strong">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-2">{title}</p>
                    <p className="heading-display text-2xl md:text-3xl text-foreground tabular-nums">
                        {value}
                    </p>
                    {change && (
                        <div
                            className={cn(
                                'inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums',
                                change.isPositive
                                    ? 'bg-status-success-soft text-status-success'
                                    : 'bg-status-danger-soft text-status-danger',
                            )}
                        >
                            {change.isPositive ? (
                                <TrendingUp className="w-3 h-3" />
                            ) : (
                                <TrendingDown className="w-3 h-3" />
                            )}
                            {Math.abs(change.value)}%
                            <span className="text-muted-foreground font-normal hidden sm:inline ml-0.5">7 хоног</span>
                        </div>
                    )}
                </div>
                <div className={cn('w-10 h-10 md:w-11 md:h-11 rounded-md flex items-center justify-center flex-shrink-0', tileClass)}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
}
