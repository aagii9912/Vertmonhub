import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center font-medium rounded-md whitespace-nowrap',
    {
        variants: {
            variant: {
                default: 'bg-surface-2 text-foreground border border-border',
                neutral: 'bg-surface-2 text-muted-foreground',
                brand: 'bg-brand-soft text-brand-strong',
                success: 'bg-status-success-soft text-status-success',
                warning: 'bg-status-pending-soft text-status-pending',
                pending: 'bg-status-pending-soft text-status-pending',
                danger: 'bg-status-danger-soft text-status-danger',
                info: 'bg-status-info-soft text-status-info',
                active: 'bg-status-active-soft text-status-active',
                outline: 'border border-border-strong text-foreground',
                vip: 'bg-brand text-brand-fg',
            },
            size: {
                sm: 'px-2 py-0.5 text-xs',
                md: 'px-2.5 py-1 text-xs',
                lg: 'px-3 py-1.5 text-sm',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'sm',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {}

export function Badge({ children, variant, size, className, ...props }: BadgeProps) {
    return (
        <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
            {children}
        </span>
    );
}

export { badgeVariants };
