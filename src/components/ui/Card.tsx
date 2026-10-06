import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    hover?: boolean;
    interactive?: boolean;
    variant?: 'default' | 'elevated' | 'ghost' | 'muted';
}

const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
    default: 'bg-surface border border-border',
    elevated: 'bg-surface border border-border shadow-sm',
    ghost: 'bg-transparent border border-transparent',
    muted: 'bg-surface-2 border border-border',
};

/** v3 карт: 14px радиус, сүүдрийн оронд хүрээ, агаартай padding. */
export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ children, className = '', hover = false, interactive = false, variant = 'default', ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-xl',
                    variantClasses[variant],
                    hover && 'transition-colors duration-150 hover:border-border-strong',
                    interactive &&
                        'cursor-pointer transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-surface-2/40 outline-none',
                    className,
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5', className)}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('px-4 py-4 md:px-5', className)}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('text-sm font-semibold text-foreground [&_svg]:h-4 [&_svg]:w-4', className)}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('text-[13px] text-muted-foreground', className)}>{children}</p>;
}
