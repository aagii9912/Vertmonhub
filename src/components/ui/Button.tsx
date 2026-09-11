import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center font-medium rounded-md transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
    {
        variants: {
            variant: {
                primary:
                    'bg-brand text-brand-fg hover:bg-brand-strong active:bg-brand-strong',
                secondary:
                    'bg-surface text-foreground border border-border-strong hover:bg-surface-2 active:bg-surface-3',
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
                // v2 density ladder: 30 / 34 / 40 (mobile primary 44 = lg)
                sm: 'h-[30px] px-2.5 text-[12.5px] gap-1.5 [&_svg]:h-4 [&_svg]:w-4',
                md: 'h-[34px] px-3 text-[13px] gap-2 [&_svg]:h-4 [&_svg]:w-4',
                lg: 'h-[40px] px-4 text-[14px] gap-2 [&_svg]:h-4 [&_svg]:w-4 md:h-[44px]',
                icon: 'h-[30px] w-[30px] p-0 [&_svg]:h-4 [&_svg]:w-4',
                iconSm: 'h-7 w-7 p-0 [&_svg]:h-3.5 [&_svg]:w-3.5',
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
        aria-label="Ачаалж байна"
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
