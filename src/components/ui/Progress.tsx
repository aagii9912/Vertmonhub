import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* ─── Linear Progress ─── */
interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
    value: number;
    max?: number;
    color?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

const colorClasses: Record<NonNullable<ProgressProps['color']>, string> = {
    default: 'bg-foreground',
    brand: 'bg-brand',
    success: 'bg-status-success',
    warning: 'bg-status-pending',
    danger: 'bg-status-danger',
    info: 'bg-status-info',
};

const sizeClasses: Record<NonNullable<ProgressProps['size']>, string> = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
};

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
    ({ value, max = 100, color = 'brand', size = 'md', showLabel, className, ...props }, ref) => {
        const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

        return (
            <div ref={ref} className={cn('w-full', className)} {...props}>
                {showLabel && (
                    <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(percentage)}%</span>
                    </div>
                )}
                <div className={cn('w-full rounded-full bg-surface-2 overflow-hidden', sizeClasses[size])}>
                    <div
                        className={cn('h-full rounded-full transition-all duration-500 ease-out', colorClasses[color])}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>
        );
    }
);
Progress.displayName = 'Progress';

/* ─── Circular Progress ─── */
interface CircularProgressProps {
    value: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    trackColor?: string;
    className?: string;
    children?: React.ReactNode;
}

function CircularProgress({
    value,
    max = 100,
    size = 48,
    strokeWidth = 4,
    color = 'var(--brand)',
    trackColor = 'var(--surface-2)',
    className,
    children,
}: CircularProgressProps) {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className={cn('relative inline-flex items-center justify-center', className)}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-500 ease-out"
                />
            </svg>
            {children && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {children}
                </div>
            )}
        </div>
    );
}

export { Progress, CircularProgress };
