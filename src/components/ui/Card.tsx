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

/** v2 карт: 6px радиус, хил хязгаар сүүдрээс илүү, нягт padding. */
export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ children, className = '', hover = false, interactive = false, variant = 'default', ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-md',
                    variantClasses[variant],
                    hover && 'transition-colors duration-150 hover:border-border-strong',
                    interactive &&
                        'cursor-pointer transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-surface-2/40 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
    return <div className={cn('flex min-h-10 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2', className)}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('px-3.5 py-3 md:px-4', className)}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('text-[12.5px] font-semibold text-foreground [&_svg]:h-4 [&_svg]:w-4', className)}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('text-[12px] text-muted-foreground', className)}>{children}</p>;
}
