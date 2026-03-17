'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Users,
    TrendingUp,
    Target,
    CheckCircle2,
    XCircle,
    Clock,
    BarChart3,
    ArrowUpRight,
    ArrowDownRight,
    Download,
    Calendar,
    DollarSign,
    PieChart,
    Filter,
    Building2,
    Percent
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface LeadStats {
    total: number;
    won: number;
    inProgress: number;
    conversionRate: number;
}

interface SourceData {
    source: string;
    count: number;
    percentage: number;
    color: string;
}

interface ProjectData {
    project: string;
    leads: number;
    won: number;
    value: number;
}

const sourceColors: Record<string, string> = {
    messenger: 'bg-blue-500',
    instagram: 'bg-pink-500',
    website: 'bg-indigo-500',
    referral: 'bg-emerald-500',
    phone: 'bg-amber-500',
    other: 'bg-gray-500',
};

const sourceLabels: Record<string, string> = {
    messenger: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    other: 'Бусад',
};

export default function LeadsReport() {
    const { shop } = useAuth();
    type Period = 'today' | 'week' | 'month' | 'year';
    const [period, setPeriod] = useState<Period>('month');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<LeadStats>({ total: 0, won: 0, inProgress: 0, conversionRate: 0 });
    const [sourceData, setSourceData] = useState<SourceData[]>([]);
    const [projectData, setProjectData] = useState<ProjectData[]>([]);

    useEffect(() => {
        if (!shop?.id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: leads, error } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('shop_id', shop.id);

                if (error) throw error;

                if (!leads || leads.length === 0) {
                    setLoading(false);
                    return;
                }

                // Stats
                const won = leads.filter(l => l.status === 'closed_won').length;
                const inProgress = leads.filter(l =>
                    ['contacted', 'viewing_scheduled', 'offered', 'negotiating'].includes(l.status)
                ).length;

                setStats({
                    total: leads.length,
                    won,
                    inProgress,
                    conversionRate: leads.length > 0 ? (won / leads.length) * 100 : 0,
                });

                // Source breakdown
                const sourceCounts = new Map<string, number>();
                for (const lead of leads) {
                    const src = lead.source || 'other';
                    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
                }
                const srcData: SourceData[] = Array.from(sourceCounts.entries())
                    .map(([source, count]) => ({
                        source: sourceLabels[source] || source,
                        count,
                        percentage: Math.round((count / leads.length) * 100),
                        color: sourceColors[source] || 'bg-gray-500',
                    }))
                    .sort((a, b) => b.count - a.count);
                setSourceData(srcData);

                // Project breakdown
                const projectMap = new Map<string, { leads: number; won: number; value: number }>();
                for (const lead of leads) {
                    const project = lead.preferred_type || 'Бусад';
                    if (!projectMap.has(project)) {
                        projectMap.set(project, { leads: 0, won: 0, value: 0 });
                    }
                    const d = projectMap.get(project)!;
                    d.leads++;
                    if (lead.status === 'closed_won') {
                        d.won++;
                        d.value += lead.budget_max || lead.budget_min || 0;
                    }
                }
                setProjectData(
                    Array.from(projectMap.entries())
                        .map(([project, data]) => ({ project, ...data }))
                        .sort((a, b) => b.leads - a.leads)
                        .slice(0, 5)
                );
            } catch (error) {
                console.error('Error fetching leads report:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [shop?.id, period]);

    const formatCurrency = (value: number) => {
        if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} тэрбум ₮`;
        if (value >= 1000000) return `${(value / 1000000).toLocaleString()} сая ₮`;
        return value.toLocaleString() + '₮';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Тайлан татаж байна...</span>
                </div>
            </div>
        );
    }

    if (stats.total === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <Users className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                <p className="text-gray-500 max-w-md">
                    Сэжмийн тайлан харахын тулд лийд мэдээлэл оруулна уу.
                </p>
            </div>
        );
    }

    const kpiCards = [
        { label: 'Нийт сэжим', value: String(stats.total), icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100' },
        { label: 'Амжилттай', value: String(stats.won), icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
        { label: 'Хөрвүүлэлт', value: `${stats.conversionRate.toFixed(1)}%`, icon: Target, color: 'text-purple-600', bgColor: 'bg-purple-100' },
        { label: 'Боловсруулалтанд', value: String(stats.inProgress), icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-100' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        Сэжмийн тайлан
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Худалдан авах магадлалтай харилцагчдын анализ
                    </p>
                </div>
                <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Экспорт
                </Button>
            </div>

            {/* Period Filter */}
            <div className="flex flex-wrap gap-2">
                {[
                    { value: 'today', label: 'Өнөөдөр' },
                    { value: 'week', label: '7 хоног' },
                    { value: 'month', label: 'Сар' },
                    { value: 'year', label: 'Жил' },
                ].map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setPeriod(option.value as Period)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${period === option.value
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((stat, index) => (
                    <Card key={index} className="transition-all hover:shadow-md">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                                    <h3 className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</h3>
                                </div>
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bgColor}`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Analysis */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieChart className="w-5 h-5 text-primary" />
                            Сувгийн анализ
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {sourceData.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="space-y-6">
                                {sourceData.map((item, i) => (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-gray-700">{item.source}</span>
                                            <div className="text-right">
                                                <span className="font-bold text-gray-900">{item.count}</span>
                                                <span className="text-sm text-gray-500 ml-2">({item.percentage}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div
                                                className={`${item.color} h-2 rounded-full transition-all`}
                                                style={{ width: `${item.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Performance by Project */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-primary" />
                            Төслөөр
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {projectData.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="space-y-4">
                                {projectData.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                        <div>
                                            <p className="font-medium text-gray-900">{item.project}</p>
                                            <div className="flex gap-4 mt-1">
                                                <p className="text-xs text-gray-500">Сэжим: {item.leads}</p>
                                                <p className="text-xs text-green-600">Амжилттай: {item.won}</p>
                                            </div>
                                        </div>
                                        {item.value > 0 && (
                                            <div className="text-right">
                                                <p className="font-bold text-primary">{formatCurrency(item.value)}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
