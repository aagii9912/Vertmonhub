'use client';

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';

/**
 * ChartCard — чартуудын нэгдсэн контейнер.
 *
 * Card дотор гарчиг (title), нэмэлт eyebrow/subtitle, баруун талд actions slot,
 * мөн тогтсон өндөртэй ResponsiveContainer-ийг хангана. Дизайн токенуудыг дагана.
 *
 * Жишээ:
 *   <ChartCard title="Орлого" subtitle="Сүүлийн 30 хоног" height={280}>
 *     <BarChart data={data} xKey="month" series={[{ key: 'value', name: 'Орлого' }]} />
 *   </ChartCard>
 *
 * `children` нь ШУУД recharts чарт (BarChart/LineChart/...) байх ёстой — ChartCard өөрөө
 * ResponsiveContainer-ээр (width=100%, height=`height`) ороож өгнө. Хэрэв та өөрийн
 * ResponsiveContainer-тэй контент дамжуулах бол `raw` prop-ийг ашиглана.
 */
export interface ChartCardProps extends Omit<React.ComponentProps<typeof Card>, 'children' | 'title'> {
    /** Картын гарчиг */
    title?: React.ReactNode;
    /** Гарчгийн доорх тайлбар мөр */
    subtitle?: React.ReactNode;
    /** Гарчгийн дээрх жижиг ангиллын eyebrow (mono, uppercase) */
    eyebrow?: React.ReactNode;
    /** Толгойн баруун талд байрлах үйлдлүүд (filter, menu, гэх мэт) */
    actions?: React.ReactNode;
    /** Чартын талбайн өндөр (px). default 280 */
    height?: number;
    /**
     * true бол children-ийг ResponsiveContainer-аар ороохгүй (өөрийн layout-той
     * тусгай контент дамжуулахад). default false.
     */
    raw?: boolean;
    children: React.ReactNode;
}

export function ChartCard({
    title,
    subtitle,
    eyebrow,
    actions,
    height = 280,
    raw = false,
    className,
    children,
    ...cardProps
}: ChartCardProps) {
    const hasHeader = Boolean(title || subtitle || eyebrow || actions);

    return (
        <Card
            data-slot="chart-card"
            className={cn('flex flex-col overflow-hidden', className)}
            {...cardProps}
        >
            {hasHeader && (
                <div
                    data-slot="chart-card-header"
                    className="flex items-start justify-between gap-4 px-4 md:px-6 pt-4 md:pt-5 pb-2"
                >
                    <div className="min-w-0">
                        {eyebrow && (
                            <p className="text-2xs uppercase tracking-wide text-muted-2 mb-1">
                                {eyebrow}
                            </p>
                        )}
                        {title && (
                            <h3 className="heading-section text-base md:text-lg text-foreground truncate">
                                {title}
                            </h3>
                        )}
                        {subtitle && (
                            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                        )}
                    </div>
                    {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
                </div>
            )}

            <div
                data-slot="chart-card-body"
                className={cn('px-2 md:px-3 pb-3 md:pb-4', hasHeader ? 'pt-1' : 'pt-3 md:pt-4')}
                style={{ height }}
            >
                {raw ? (
                    children
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        {children}
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
}
