'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    TrendingUp, Megaphone, Share2, CalendarDays, BarChart3,
    ArrowUpRight, Eye, Target, DollarSign, Users
} from 'lucide-react';
import Link from 'next/link';
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

    const formatNumber = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);
    const formatCurrency = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M₮` : v >= 1000 ? `${(v / 1000).toFixed(0)}K₮` : v.toLocaleString() + '₮';

    const sections = [
        { title: 'Кампанит ажил', icon: Megaphone, href: '/marketing/campaigns', desc: 'Маркетингийн кампанит ажлууд', color: 'bg-status-info-soft text-status-info' },
        { title: 'Сошиал медиа', icon: Share2, href: '/marketing/social', desc: 'Нийтлэлүүд болон оролцоо', color: 'bg-brand-soft text-brand-strong' },
        { title: 'Зар сурталчилгаа', icon: BarChart3, href: '/marketing/ads', desc: 'Төлбөрт зарын кампанит ажлууд', color: 'bg-status-pending-soft text-status-pending' },
        { title: 'Контент календарь', icon: CalendarDays, href: '/marketing/calendar', desc: 'Контент төлөвлөлт', color: 'bg-status-success-soft text-status-success' },
        { title: 'Мессеж маркетинг', icon: Users, href: '/marketing/messaging', desc: 'Имэйл болон SMS', color: 'bg-status-info-soft text-status-info' },
        { title: 'Вэб аналитик', icon: TrendingUp, href: '/marketing/analytics', desc: 'Хандалтын статистик', color: 'bg-brand-soft text-brand-strong' },
    ];

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-muted-foreground">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-status-success" />
                    Маркетинг
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Маркетингийн ерөнхий тойм</p>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Кампани</p><p className="text-2xl font-bold mt-1">{overview.campaigns}</p><p className="text-xs text-status-success">{overview.activeCampaigns} идэвхтэй</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Нийтлэл</p><p className="text-2xl font-bold mt-1">{overview.socialPosts}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Зарын зардал</p><p className="text-2xl font-bold mt-1">{formatCurrency(overview.adSpend)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ирэх контент</p><p className="text-2xl font-bold mt-1">{overview.upcomingContent}</p></CardContent></Card>
            </div>

            {/* Navigation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map(section => (
                    <Link key={section.href} href={section.href}>
                        <Card className="hover:shadow-md transition-all cursor-pointer h-full">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${section.color}`}>
                                        <section.icon className="w-5 h-5" />
                                    </div>
                                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/70" />
                                </div>
                                <h3 className="font-semibold text-foreground">{section.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1">{section.desc}</p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
