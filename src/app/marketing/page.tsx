'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
    TrendingUp, Megaphone, Share2, CalendarDays, BarChart3,
    ArrowUpRight, Target, Users
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';

export default function MarketingPage() {
    const { shop } = useAuth();
    const { data: overview, isLoading, isError, refetch } = useQuery({
        queryKey: ['marketing-overview', shop?.id],
        enabled: !!shop?.id,
        queryFn: async () => {
            type Rows<T> = { rows: T[] };
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ulaanbaatar' });
            const [campaignsRes, socialRes, calendarRes] = await Promise.all([
                dashboardJson<Rows<{ id: string; status: string }>>('/api/marketing/data/marketing_campaigns?select=id,status&limit=500'),
                dashboardJson<Rows<{ id: string }>>('/api/marketing/data/social_posts?select=id&limit=500'),
                dashboardJson<Rows<{ id: string }>>(`/api/marketing/data/content_calendar?select=id&gte.scheduled_date=${today}&limit=500`),
            ]);
            const campaigns = campaignsRes.rows || [];
            return {
                campaigns: campaigns.length,
                activeCampaigns: campaigns.filter(c => c.status === 'active').length,
                socialPosts: (socialRes.rows || []).length,
                upcomingContent: (calendarRes.rows || []).length,
            };
        },
    });

    const sections = [
        { title: 'Кампанит ажил', icon: Megaphone, href: '/marketing/campaigns', desc: 'Маркетингийн кампанит ажлууд', tile: 'bg-status-info-soft text-status-info' },
        { title: 'Сошиал медиа', icon: Share2, href: '/marketing/social', desc: 'Нийтлэлүүд болон оролцоо', tile: 'bg-brand-soft text-brand-strong' },
        { title: 'Зар сурталчилгаа', icon: BarChart3, href: '/marketing/ads', desc: 'Төлбөрт зарын кампанит ажлууд', tile: 'bg-status-pending-soft text-status-pending' },
        { title: 'Контент календарь', icon: CalendarDays, href: '/marketing/calendar', desc: 'Контент төлөвлөлт', tile: 'bg-status-success-soft text-status-success' },
        { title: 'Мессеж маркетинг', icon: Users, href: '/marketing/messaging', desc: 'Имэйл болон SMS', tile: 'bg-status-info-soft text-status-info' },
        { title: 'Вэб аналитик', icon: TrendingUp, href: '/marketing/analytics', desc: 'Хандалтын статистик', tile: 'bg-brand-soft text-brand-strong' },
    ];

    if (isLoading || !shop?.id) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" label="Татаж байна..." />
            </div>
        );
    }

    if (isError || !overview) return <div role="alert" className="space-y-3 rounded-md border border-status-danger/30 bg-status-danger-soft p-5"><p>Маркетингийн тоймыг татаж чадсангүй.</p><Button variant="secondary" onClick={() => refetch()}>Дахин оролдох</Button></div>;

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Маркетинг"
                subtitle="Маркетингийн ерөнхий тойм"
            />

            <div className="space-y-6">
                {/* Overview Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatsCard
                        icon={Target}
                        iconColor="info"
                        title="Кампанит ажил"
                        value={overview.campaigns}
                    />
                    <StatsCard
                        icon={Share2}
                        iconColor="brand"
                        title="Нийтлэл"
                        value={overview.socialPosts}
                    />
                    <StatsCard
                        icon={Megaphone}
                        iconColor="warning"
                        title="Идэвхтэй кампанит ажил"
                        value={overview.activeCampaigns}
                    />
                    <StatsCard
                        icon={CalendarDays}
                        iconColor="success"
                        title="Өнөөдрөөс төлөвлөсөн"
                        value={overview.upcomingContent}
                    />
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">Бүртгэлийн тойм · кампанит ажил, нийтлэлд хугацааны шүүлтүүргүй. Ангилал тус бүрийн 500 хүртэл бүртгэлийг тооцов; 500-д хүрсэн тоо бүрэн дүн биш байж болно. Зарын зардлыг <Link href="/marketing/ads" className="text-brand-strong underline">зар сурталчилгааны тайлангаас</Link> шалгана уу.</p>

                {/* Navigation Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sections.map(section => (
                        <Link key={section.href} href={section.href} className="block">
                            <Card interactive className="h-full">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className={cn('w-10 h-10 rounded-md flex items-center justify-center', section.tile)}>
                                            <section.icon className="w-5 h-5" />
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-muted-foreground/70" />
                                    </div>
                                    <h3 className="heading-section text-base text-foreground">{section.title}</h3>
                                    <p className="text-sm text-muted-foreground mt-1">{section.desc}</p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
