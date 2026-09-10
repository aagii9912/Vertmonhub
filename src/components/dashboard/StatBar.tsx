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

/** v2 KPI мөр — нягт, хил хязгаартай, 20px тоо. */
export function StatBar({ children, columns = 4, className }: StatBarProps) {
    return <div className={cn('mb-4 grid gap-2', colsMap[columns], className)}>{children}</div>;
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
        <div className={cn('flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-surface px-3.5 py-2.5', className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11.5px] font-medium text-muted-foreground">{label}</span>
                {icon && <span className={cn('shrink-0 [&>svg]:h-4 [&>svg]:w-4', accentMap[accent])}>{icon}</span>}
            </div>
            <div className="num truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground sm:text-[20px]">{value}</div>
            {helper && <div className="truncate text-[11.5px] text-muted-foreground">{helper}</div>}
        </div>
    );
}
