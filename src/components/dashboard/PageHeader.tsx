'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePageTitle } from '@/lib/navigation/pageTitle';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    /** @deprecated v2: apron толгой (Header) breadcrumb-ыг өөрөө харуулна */
    eyebrow?: string;
    primaryAction?: ReactNode;
    secondaryActions?: ReactNode;
    /** @deprecated v2: Header breadcrumb-ыг nav.ts-ээс өөрөө гаргана */
    breadcrumbs?: BreadcrumbItem[];
    className?: string;
}

/**
 * Агуулгын үндсэн гарчиг, тайлбар, үйлдлүүд.
 * `usePageTitle` нь shell-ийн замын мөрийг тохируулна; h1 энд нэг удаа гарна.
 */
export function PageHeader({ title, subtitle, primaryAction, secondaryActions, className }: PageHeaderProps) {
    usePageTitle(title);
    const hasActions = !!(primaryAction || secondaryActions);
    return (
        <header className={cn('mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap', className)}>
            <div className="w-full min-w-0 flex-1 sm:w-auto"><h1 className="text-[24px] font-semibold tracking-tight text-foreground">{title}</h1>
                {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
            </div>
            {hasActions && (
                <div className={cn('flex flex-wrap items-center gap-2', !subtitle && 'ml-auto')}>
                    {secondaryActions}
                    {primaryAction}
                </div>
            )}
        </header>
    );
}
