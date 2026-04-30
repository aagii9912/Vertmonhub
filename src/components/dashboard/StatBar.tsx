import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatBarProps {
    children: ReactNode;
    columns?: 2 | 3 | 4;
    className?: string;
}

const colsMap: Record<NonNullable<StatBarProps['columns']>, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
};

export function StatBar({ children, columns = 4, className }: StatBarProps) {
    return (
        <div className={cn('grid gap-3 md:gap-4 mb-6', colsMap[columns], className)}>
            {children}
        </div>
    );
}

interface StatTileProps {
    label: string;
    value: ReactNode;
    helper?: ReactNode;
    icon?: ReactNode;
    accent?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    className?: string;
}

const accentMap: Record<NonNullable<StatTileProps['accent']>, string> = {
    brand: 'text-brand',
    success: 'text-status-success',
    warning: 'text-status-pending',
    danger: 'text-status-danger',
    info: 'text-status-info',
    neutral: 'text-muted-foreground',
};

export function StatTile({ label, value, helper, icon, accent = 'neutral', className }: StatTileProps) {
    return (
        <div
            className={cn(
                'rounded-xl border border-border bg-surface p-4 md:p-5 transition-colors hover:border-border-strong',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
                    {label}
                </p>
                {icon && <span className={cn('shrink-0', accentMap[accent])}>{icon}</span>}
            </div>
            <p className="mt-3 heading-display text-2xl md:text-3xl text-foreground tabular-nums">{value}</p>
            {helper && <div className="mt-2 text-xs text-muted-foreground">{helper}</div>}
        </div>
    );
}
