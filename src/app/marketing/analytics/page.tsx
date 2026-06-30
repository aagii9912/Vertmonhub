'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart3, Globe, Monitor, Smartphone, Tablet, Eye, Clock, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface AnalyticsEntry {
    id: string;
    page: string;
    visitors: number;
    page_views: number;
    bounce_rate: number;
    avg_time_seconds: number;
    source: string;
    device: string;
    location: string;
    date: string;
}

export default function AnalyticsPage() {
    const { shop } = useAuth();
    const [data, setData] = useState<AnalyticsEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data: rows, error } = await supabase
                    .from('web_analytics')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('date', { ascending: false })
                    .limit(100);
                if (error) throw error;
                setData(rows || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const totalVisitors = data.reduce((s, d) => s + (d.visitors || 0), 0);
    const totalPageViews = data.reduce((s, d) => s + (d.page_views || 0), 0);
    const avgBounce = data.length > 0 ? data.reduce((s, d) => s + (d.bounce_rate || 0), 0) / data.length : 0;
    const avgTime = data.length > 0 ? Math.round(data.reduce((s, d) => s + (d.avg_time_seconds || 0), 0) / data.length) : 0;

    // Top pages aggregation
    const pageMap = new Map<string, { views: number; visitors: number }>();
    for (const d of data) {
        if (!pageMap.has(d.page)) pageMap.set(d.page, { views: 0, visitors: 0 });
        const p = pageMap.get(d.page)!;
        p.views += d.page_views || 0;
        p.visitors += d.visitors || 0;
    }
    const topPages = Array.from(pageMap.entries()).map(([page, stats]) => ({ page, ...stats })).sort((a, b) => b.views - a.views).slice(0, 10);

    // Source aggregation
    const sourceMap = new Map<string, number>();
    for (const d of data) {
        if (d.source) sourceMap.set(d.source, (sourceMap.get(d.source) || 0) + d.visitors);
    }
    const sources = Array.from(sourceMap.entries()).map(([source, visitors]) => ({ source, visitors })).sort((a, b) => b.visitors - a.visitors);

    // Device aggregation
    const deviceMap = new Map<string, number>();
    for (const d of data) {
        if (d.device) deviceMap.set(d.device, (deviceMap.get(d.device) || 0) + d.visitors);
    }
    const devices = Array.from(deviceMap.entries()).map(([device, visitors]) => ({ device, visitors })).sort((a, b) => b.visitors - a.visitors);

    const deviceIcons: Record<string, React.ReactNode> = {
        desktop: <Monitor className="w-4 h-4 text-status-info" />,
        mobile: <Smartphone className="w-4 h-4 text-status-success" />,
        tablet: <Tablet className="w-4 h-4 text-brand-strong" />,
    };

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
                title="Вэб аналитик"
                subtitle="Вэбсайтын хандалтын статистик"
            />

            <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatsCard
                        icon={Eye}
                        iconColor="info"
                        title="Нийт зочид"
                        value={totalVisitors.toLocaleString()}
                    />
                    <StatsCard
                        icon={Globe}
                        iconColor="success"
                        title="Хуудас үзэлт"
                        value={totalPageViews.toLocaleString()}
                    />
                    <StatsCard
                        icon={ArrowUpRight}
                        iconColor="warning"
                        title="Bounce rate"
                        value={`${avgBounce.toFixed(1)}%`}
                    />
                    <StatsCard
                        icon={Clock}
                        iconColor="brand"
                        title="Дундаж хугацаа"
                        value={`${Math.floor(avgTime / 60)}:${String(avgTime % 60).padStart(2, '0')}`}
                    />
                </div>

                {data.length === 0 ? (
                    <EmptyState
                        icon={<BarChart3 className="w-7 h-7" />}
                        title="Мэдээлэл байхгүй"
                        description="Вэб аналитикийн мэдээлэл энд харагдана."
                    />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Top Pages */}
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="heading-section text-base text-foreground mb-4">Шилдэг хуудсууд</h3>
                                <div className="space-y-3">
                                    {topPages.map((p, i) => (
                                        <div key={p.page} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-muted-foreground/70 w-5 tabular-nums">{i + 1}</span>
                                                <span className="text-sm text-foreground truncate max-w-[200px]">{p.page}</span>
                                            </div>
                                            <span className="text-sm font-medium text-muted-foreground tabular-nums">{p.views.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Sources + Devices */}
                        <div className="space-y-6">
                            {sources.length > 0 ? (
                                <ChartCard
                                    title="Эх сурвалж"
                                    subtitle="Зочдын тоо эх сурвалжаар"
                                    height={Math.max(180, sources.length * 48)}
                                >
                                    <BarChart
                                        data={sources.map(s => ({ source: s.source, visitors: s.visitors }))}
                                        xKey="source"
                                        series={[{ key: 'visitors', name: 'Зочид' }]}
                                        horizontal
                                        colorByPoint
                                        valueFormatter={(v) => v.toLocaleString()}
                                    />
                                </ChartCard>
                            ) : (
                                <ChartCard title="Эх сурвалж" raw height={140}>
                                    <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                                </ChartCard>
                            )}
                            <Card>
                                <CardContent className="p-4">
                                    <h3 className="heading-section text-base text-foreground mb-4">Төхөөрөмж</h3>
                                    <div className="space-y-3">
                                        {devices.map(d => (
                                            <div key={d.device} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {deviceIcons[d.device] || <Globe className="w-4 h-4 text-muted-foreground/70" />}
                                                    <span className="text-sm text-foreground capitalize">{d.device}</span>
                                                </div>
                                                <span className="text-sm font-medium tabular-nums">{d.visitors.toLocaleString()}</span>
                                            </div>
                                        ))}
                                        {devices.length === 0 && <p className="text-sm text-muted-foreground text-center">Мэдээлэл байхгүй</p>}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
