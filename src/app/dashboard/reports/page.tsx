'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Users, Building2, UserCheck, CalendarClock, FileBarChart, ArrowUpRight, type LucideIcon } from 'lucide-react';

interface ReportTile {
    href: string;
    title: string;
    description: string;
    icon: LucideIcon;
    accent: 'info' | 'success' | 'brand' | 'pending';
}

const TILE_ACCENT: Record<ReportTile['accent'], string> = {
    info: 'bg-status-info-soft text-status-info',
    success: 'bg-status-success-soft text-status-success',
    brand: 'bg-brand-soft text-brand-strong',
    pending: 'bg-status-pending-soft text-status-pending',
};

const REPORTS: ReportTile[] = [
    {
        href: '/dashboard/reports/kpi',
        title: 'Сарын KPI тайлан',
        description: 'Менежерийн сарын лид, уулзалт, гэрээ, борлуулалт, хийсэн ажлыг автоматаар нэгтгэсэн тайлан',
        icon: FileBarChart,
        accent: 'brand',
    },
    {
        href: '/dashboard/reports/leads',
        title: 'Лийд шинжилгээ',
        description: 'Сэжмийн эх сурвалж, хөрвүүлэлт, төслөөр гүйцэтгэлийн анализ',
        icon: Users,
        accent: 'info',
    },
    {
        href: '/dashboard/reports/properties',
        title: 'Үл хөдлөх шинжилгээ',
        description: 'Нэгжийн нөөц — ээлж, ангилал, төлөвөөр нэгтгэл',
        icon: Building2,
        accent: 'success',
    },
    {
        href: '/dashboard/reports/manager-performance',
        title: 'Менежерийн гүйцэтгэл',
        description: 'Борлуулалтын менежер бүрийн үзүүлэлт, амжилтын харьцаа',
        icon: UserCheck,
        accent: 'brand',
    },
    {
        href: '/dashboard/reports/meetings',
        title: 'Уулзалтын аналитик',
        description: 'Уулзалт, үзүүлэлтийн хуваарь болон үр дүнгийн шинжилгээ',
        icon: CalendarClock,
        accent: 'pending',
    },
];

export default function ReportsPage() {
    return (
        <div>
            <PageHeader
                eyebrow="Аналитик"
                title="Тайлан & Шинжилгээ"
                subtitle="Үл хөдлөхийн борлуулалтын дэлгэрэнгүй шинжилгээний төв"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                {REPORTS.map((report) => {
                    const Icon = report.icon;
                    return (
                        <Link key={report.href} href={report.href} className="group">
                            <Card interactive className="h-full">
                                <CardContent className="flex items-start gap-4">
                                    <span
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${TILE_ACCENT[report.accent]}`}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <h2 className="heading-section text-base md:text-lg text-foreground">
                                                {report.title}
                                            </h2>
                                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                                        </div>
                                        <p className="mt-1.5 text-sm text-muted-foreground">{report.description}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
