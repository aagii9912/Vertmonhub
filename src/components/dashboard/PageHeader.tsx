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
 * v2 хуудасны толгой.
 *
 * v1-д хуудас бүр 2xl–4xl серифэн гарчгаа давтан харуулдаг байсан бол v2-т
 * гарчиг АППЫН 52px толгойд (Header) нэг л газар гарна — энэ компонент
 * `usePageTitle`-аар тэр гарчгийг тохируулаад, зөвхөн тайлбар + үйлдлийн
 * товчнуудыг нэг нягт мөрөнд харуулна. 35 хуудас өөрчлөлтгүй ашиглана.
 */
export function PageHeader({ title, subtitle, primaryAction, secondaryActions, className }: PageHeaderProps) {
    usePageTitle(title);
    const hasActions = !!(primaryAction || secondaryActions);
    if (!subtitle && !hasActions) return null;

    return (
        <header className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
            {subtitle && <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{subtitle}</p>}
            {hasActions && (
                <div className={cn('flex flex-wrap items-center gap-2', !subtitle && 'ml-auto')}>
                    {secondaryActions}
                    {primaryAction}
                </div>
            )}
        </header>
    );
}
