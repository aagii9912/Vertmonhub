import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background tap-feedback disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
    {
        variants: {
            variant: {
                primary:
                    'bg-brand text-brand-fg hover:bg-brand-strong active:bg-brand-strong',
                secondary:
                    'bg-surface text-foreground border border-border hover:bg-surface-2 active:bg-surface-3',
                tertiary:
                    'bg-surface-2 text-foreground hover:bg-surface-3 active:bg-surface-3',
                danger:
                    'bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-80',
                ghost:
                    'text-muted-foreground hover:bg-surface-2 hover:text-foreground active:bg-surface-3',
                outline:
                    'border border-border-strong bg-transparent text-foreground hover:bg-surface-2 active:bg-surface-3',
                link:
                    'text-brand underline-offset-4 hover:underline px-0 min-h-0',
            },
            size: {
                sm: 'px-3 py-1.5 text-sm min-h-[36px] gap-1.5',
                md: 'px-4 py-2 text-sm min-h-[40px] gap-2',
                lg: 'px-5 py-2.5 text-base min-h-[44px] gap-2',
                icon: 'h-10 w-10 p-0',
                iconSm: 'h-8 w-8 p-0',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    href?: string;
    isLoading?: boolean;
}

const SpinnerIcon = () => (
    <svg
        className="animate-spin h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        role="status"
        aria-label="Loading"
    >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, isLoading, href, children, ...props }, ref) => {
        if (href) {
            return (
                <Link
                    href={href}
                    className={cn(buttonVariants({ variant, size, className }))}
                >
                    {isLoading && <SpinnerIcon />}
                    {children}
                </Link>
            );
        }

        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={isLoading || props.disabled}
                aria-busy={isLoading}
                {...props}
            >
                {isLoading && <SpinnerIcon />}
                {children}
            </button>
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
