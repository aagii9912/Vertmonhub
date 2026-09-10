import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
    title: string;
    /** string | number, or a node such as <Money/> for token-formatted figures */
    value: React.ReactNode;
    change?: {
        value: number;
        isPositive: boolean;
    };
    icon: LucideIcon;
    /** Дүрсний өнгө. v2-т дүрс жижиг (16px), хавтангүй. */
    iconColor?: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'
        // legacy aliases
        | 'bg-brand' | 'bg-blue' | 'bg-emerald' | 'bg-violet' | 'bg-rose';
    /** @deprecated kept for back compat */
    gradient?: string;
}

type IconTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_TEXT: Record<IconTone, string> = {
    brand: 'text-brand',
    info: 'text-status-info',
    success: 'text-status-success',
    warning: 'text-status-pending',
    danger: 'text-status-danger',
    neutral: 'text-muted-foreground',
};

const LEGACY_TONE_MAP: Record<string, IconTone> = {
    'bg-brand': 'brand',
    'bg-blue': 'info',
    'bg-emerald': 'success',
    'bg-violet': 'brand',
    'bg-rose': 'danger',
};

function resolveTone(value: StatsCardProps['iconColor']): IconTone {
    if (!value) return 'neutral';
    if (value in TONE_TEXT) return value as IconTone;
    return LEGACY_TONE_MAP[value as string] || 'neutral';
}

/** v2 KPI карт — StatTile-тай ижил хэлбэр (нэг систем). */
export function StatsCard({ title, value, change, icon: Icon, iconColor }: StatsCardProps) {
    const tone = resolveTone(iconColor);
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-surface px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11.5px] font-medium text-muted-foreground">{title}</span>
                <Icon className={cn('h-4 w-4 shrink-0', TONE_TEXT[tone])} strokeWidth={1.75} />
            </div>
            <div className="num truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground sm:text-[20px]">{value}</div>
            {change && (
                <div className={cn('inline-flex items-center gap-1 text-[11.5px] font-medium', change.isPositive ? 'text-status-success' : 'text-status-danger')}>
                    {change.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="num">{Math.abs(change.value)}%</span>
                    <span className="font-normal text-muted-foreground">7 хоног</span>
                </div>
            )}
        </div>
    );
}
