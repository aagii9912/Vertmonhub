import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    hover?: boolean;
    variant?: 'default' | 'elevated' | 'ghost' | 'muted';
}

const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
    default: 'bg-surface border border-border',
    elevated: 'bg-surface border border-border shadow-sm',
    ghost: 'bg-transparent border border-transparent',
    muted: 'bg-surface-2 border border-border',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ children, className = '', hover = false, variant = 'default', ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'rounded-xl',
                    variantClasses[variant],
                    hover && 'transition-colors duration-200 hover:border-border-strong',
                    className,
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = "Card";

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('px-4 md:px-6 py-4 md:py-5 border-b border-border/60', className)}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('px-4 md:px-6 py-4 md:py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('heading-section text-base md:text-lg text-foreground', className)}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}
