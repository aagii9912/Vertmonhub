import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    primaryAction?: ReactNode;
    secondaryActions?: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    className?: string;
}

export function PageHeader({
    title,
    subtitle,
    eyebrow,
    primaryAction,
    secondaryActions,
    breadcrumbs,
    className,
}: PageHeaderProps) {
    return (
        <header
            className={cn(
                'flex flex-col gap-3 mb-6 md:mb-8',
                'md:flex-row md:items-end md:justify-between md:gap-6',
                className,
            )}
        >
            <div className="flex-1 min-w-0">
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                        {breadcrumbs.map((b, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                                {b.href ? (
                                    <a href={b.href} className="hover:text-foreground transition-colors">
                                        {b.label}
                                    </a>
                                ) : (
                                    <span>{b.label}</span>
                                )}
                                {i < breadcrumbs.length - 1 && <span className="text-muted-foreground/50">/</span>}
                            </span>
                        ))}
                    </nav>
                )}
                {eyebrow && (
                    <p className="text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground/80 mb-2">
                        {eyebrow}
                    </p>
                )}
                <h1 className="heading-display text-2xl md:text-3xl lg:text-4xl text-foreground">
                    {title}
                </h1>
                {subtitle && (
                    <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl">{subtitle}</p>
                )}
            </div>
            {(primaryAction || secondaryActions) && (
                <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3 shrink-0">
                    {secondaryActions}
                    {primaryAction}
                </div>
            )}
        </header>
    );
}
