'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Money } from '@/components/ui/Money';
import { Spinner } from '@/components/ui/Spinner';
import {
    TrendingUp, Megaphone, Share2, CalendarDays, BarChart3,
    ArrowUpRight, Target, DollarSign, Users
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface MarketingOverview {
    campaigns: number;
    activeCampaigns: number;
    socialPosts: number;
    totalReach: number;
    adSpend: number;
    upcomingContent: number;
}

export default function MarketingPage() {
    const { shop } = useAuth();
    const [overview, setOverview] = useState<MarketingOverview>({
        campaigns: 0, activeCampaigns: 0, socialPosts: 0,
        totalReach: 0, adSpend: 0, upcomingContent: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const [campaignsRes, socialRes, adsRes, calendarRes] = await Promise.all([
                    supabase.from('marketing_campaigns').select('id, status').eq('shop_id', shop.id),
                    supabase.from('social_posts').select('id, reach').eq('shop_id', shop.id),
                    supabase.from('ad_campaigns').select('id, spend').eq('shop_id', shop.id),
                    supabase.from('content_calendar').select('id').eq('shop_id', shop.id).gte('scheduled_date', new Date().toISOString().split('T')[0]),
                ]);

                const campaigns = campaignsRes.data || [];
                const social = socialRes.data || [];
                const ads = adsRes.data || [];
                const calendar = calendarRes.data || [];

                setOverview({
                    campaigns: campaigns.length,
                    activeCampaigns: campaigns.filter((c: { status: string }) => c.status === 'active').length,
                    socialPosts: social.length,
                    totalReach: social.reduce((s: number, p: { reach?: number }) => s + (p.reach || 0), 0),
                    adSpend: ads.reduce((s: number, a: { spend?: number }) => s + (a.spend || 0), 0),
                    upcomingContent: calendar.length,
                });
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const sections = [
        { title: 'Кампанит ажил', icon: Megaphone, href: '/marketing/campaigns', desc: 'Маркетингийн кампанит ажлууд', tile: 'bg-status-info-soft text-status-info' },
        { title: 'Сошиал медиа', icon: Share2, href: '/marketing/social', desc: 'Нийтлэлүүд болон оролцоо', tile: 'bg-brand-soft text-brand-strong' },
        { title: 'Зар сурталчилгаа', icon: BarChart3, href: '/marketing/ads', desc: 'Төлбөрт зарын кампанит ажлууд', tile: 'bg-status-pending-soft text-status-pending' },
        { title: 'Контент календарь', icon: CalendarDays, href: '/marketing/calendar', desc: 'Контент төлөвлөлт', tile: 'bg-status-success-soft text-status-success' },
        { title: 'Мессеж маркетинг', icon: Users, href: '/marketing/messaging', desc: 'Имэйл болон SMS', tile: 'bg-status-info-soft text-status-info' },
        { title: 'Вэб аналитик', icon: TrendingUp, href: '/marketing/analytics', desc: 'Хандалтын статистик', tile: 'bg-brand-soft text-brand-strong' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" label="Татаж байна..." />
            </div>
        );
    }

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
                        title="Кампани"
                        value={overview.campaigns}
                    />
                    <StatsCard
                        icon={Share2}
                        iconColor="brand"
                        title="Нийтлэл"
                        value={overview.socialPosts}
                    />
                    <StatsCard
                        icon={DollarSign}
                        iconColor="warning"
                        title="Зарын зардал"
                        value={<Money value={overview.adSpend} compact />}
                    />
                    <StatsCard
                        icon={CalendarDays}
                        iconColor="success"
                        title="Ирэх контент"
                        value={overview.upcomingContent}
                    />
                </div>

                {/* Navigation Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sections.map(section => (
                        <Link key={section.href} href={section.href} className="block">
                            <Card interactive className="h-full">
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-3">
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
