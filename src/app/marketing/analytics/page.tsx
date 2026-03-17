'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { BarChart3, Globe, Monitor, Smartphone, Tablet, MapPin, Eye, Clock, ArrowUpRight } from 'lucide-react';
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
    const totalSourceVisitors = sources.reduce((s, d) => s + d.visitors, 0);

    // Device aggregation
    const deviceMap = new Map<string, number>();
    for (const d of data) {
        if (d.device) deviceMap.set(d.device, (deviceMap.get(d.device) || 0) + d.visitors);
    }
    const devices = Array.from(deviceMap.entries()).map(([device, visitors]) => ({ device, visitors })).sort((a, b) => b.visitors - a.visitors);

    const deviceIcons: Record<string, React.ReactNode> = {
        desktop: <Monitor className="w-4 h-4 text-blue-600" />,
        mobile: <Smartphone className="w-4 h-4 text-emerald-600" />,
        tablet: <Tablet className="w-4 h-4 text-purple-600" />,
    };

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-gray-500">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-emerald-600" />
                    Вэб аналитик
                </h1>
                <p className="text-sm text-gray-500 mt-1">Вэбсайтын хандалтын статистик</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Нийт зочид</p><p className="text-2xl font-bold mt-1">{totalVisitors.toLocaleString()}</p></div><div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Eye className="w-5 h-5 text-blue-600" /></div></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Хуудас үзэлт</p><p className="text-2xl font-bold mt-1">{totalPageViews.toLocaleString()}</p></div><div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Globe className="w-5 h-5 text-emerald-600" /></div></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Bounce rate</p><p className="text-2xl font-bold mt-1">{avgBounce.toFixed(1)}%</p></div><div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><ArrowUpRight className="w-5 h-5 text-amber-600" /></div></div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Дундаж хугацаа</p><p className="text-2xl font-bold mt-1">{Math.floor(avgTime / 60)}:{String(avgTime % 60).padStart(2, '0')}</p></div><div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-purple-600" /></div></div></CardContent></Card>
            </div>

            {data.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
                        <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                        <p className="text-gray-500">Вэб аналитикийн мэдээлэл энд харагдана.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Pages */}
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-semibold text-gray-900 mb-4">Шилдэг хуудсууд</h3>
                            <div className="space-y-3">
                                {topPages.map((p, i) => (
                                    <div key={p.page} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                                            <span className="text-sm text-gray-900 truncate max-w-[200px]">{p.page}</span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">{p.views.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sources + Devices */}
                    <div className="space-y-6">
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="font-semibold text-gray-900 mb-4">Эх сурвалж</h3>
                                <div className="space-y-3">
                                    {sources.map(s => (
                                        <div key={s.source}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm text-gray-700 capitalize">{s.source}</span>
                                                <span className="text-xs text-gray-500">{totalSourceVisitors > 0 ? Math.round((s.visitors / totalSourceVisitors) * 100) : 0}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${totalSourceVisitors > 0 ? (s.visitors / totalSourceVisitors) * 100 : 0}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                    {sources.length === 0 && <p className="text-sm text-gray-500 text-center">Мэдээлэл байхгүй</p>}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="font-semibold text-gray-900 mb-4">Төхөөрөмж</h3>
                                <div className="space-y-3">
                                    {devices.map(d => (
                                        <div key={d.device} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {deviceIcons[d.device] || <Globe className="w-4 h-4 text-gray-400" />}
                                                <span className="text-sm text-gray-700 capitalize">{d.device}</span>
                                            </div>
                                            <span className="text-sm font-medium">{d.visitors.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    {devices.length === 0 && <p className="text-sm text-gray-500 text-center">Мэдээлэл байхгүй</p>}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
