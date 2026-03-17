'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Building2,
    TrendingUp,
    Eye,
    DollarSign,
    Download,
    ArrowUpRight,
    ArrowDownRight,
    MapPin,
    Home,
    CheckCircle2,
    Clock,
    Tag,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface PropertyStats {
    total: number;
    available: number;
    reserved: number;
    sold: number;
    total_value: number;
    avg_price: number;
    total_views: number;
}

interface ProjectData {
    project: string;
    total: number;
    available: number;
    reserved: number;
    sold: number;
    value: number;
    views: number;
}

interface TopViewed {
    name: string;
    views: number;
    status: string;
    price: number;
}

export default function PropertiesReportPage() {
    const { shop } = useAuth();
    const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<PropertyStats>({
        total: 0, available: 0, reserved: 0, sold: 0,
        total_value: 0, avg_price: 0, total_views: 0,
    });
    const [projectData, setProjectData] = useState<ProjectData[]>([]);
    const [topViewed, setTopViewed] = useState<TopViewed[]>([]);

    useEffect(() => {
        if (!shop?.id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: properties, error } = await supabase
                    .from('properties')
                    .select('*')
                    .eq('shop_id', shop.id);

                if (error) throw error;

                if (!properties || properties.length === 0) {
                    setLoading(false);
                    return;
                }

                // Calculate stats
                const available = properties.filter(p => p.status === 'available').length;
                const reserved = properties.filter(p => p.status === 'reserved').length;
                const sold = properties.filter(p => p.status === 'sold').length;
                const totalValue = properties.reduce((sum, p) => sum + (p.price || 0), 0);
                const totalViews = properties.reduce((sum, p) => sum + (p.views_count || 0), 0);

                setStats({
                    total: properties.length,
                    available,
                    reserved,
                    sold,
                    total_value: totalValue,
                    avg_price: properties.length > 0 ? totalValue / properties.length : 0,
                    total_views: totalViews,
                });

                // Group by project
                const projectMap = new Map<string, ProjectData>();
                for (const p of properties) {
                    const project = p.project_name || p.type || 'Бусад';
                    if (!projectMap.has(project)) {
                        projectMap.set(project, {
                            project, total: 0, available: 0, reserved: 0, sold: 0, value: 0, views: 0,
                        });
                    }
                    const d = projectMap.get(project)!;
                    d.total++;
                    if (p.status === 'available') d.available++;
                    if (p.status === 'reserved') d.reserved++;
                    if (p.status === 'sold') d.sold++;
                    d.value += p.price || 0;
                    d.views += p.views_count || 0;
                }
                setProjectData(Array.from(projectMap.values()));

                // Top viewed
                const sorted = [...properties].sort((a, b) => (b.views_count || 0) - (a.views_count || 0)).slice(0, 5);
                setTopViewed(sorted.map(p => ({
                    name: p.name || p.title || '',
                    views: p.views_count || 0,
                    status: p.status || 'available',
                    price: p.price || 0,
                })));
            } catch (error) {
                console.error('Error fetching properties report:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [shop?.id, period]);

    const formatCurrency = (value: number) => {
        if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} тэрбум`;
        if (value >= 1000000) return `${(value / 1000000).toFixed(0)} сая`;
        return value.toLocaleString() + '₮';
    };

    const statusColors: Record<string, string> = {
        available: 'bg-emerald-100 text-emerald-700',
        reserved: 'bg-amber-100 text-amber-700',
        sold: 'bg-gray-100 text-gray-600',
    };

    const statusLabels: Record<string, string> = {
        available: 'Зарагдаж байна',
        reserved: 'Захиалгатай',
        sold: 'Зарагдсан',
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
                <Building2 className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                <p className="text-gray-500 max-w-md">
                    Үл хөдлөхийн тайлан харахын тулд эхлээд үл хөдлөх нэмнэ үү.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-emerald-600" />
                        Үл хөдлөхийн тайлан
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Борлуулалтын үл хөдлөхийн дэлгэрэнгүй статистик
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as typeof period)}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
                    >
                        <option value="week">7 хоног</option>
                        <option value="month">Сар</option>
                        <option value="quarter">Улирал</option>
                        <option value="year">Жил</option>
                    </select>
                    <Button variant="secondary" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Татах
                    </Button>
                </div>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Building2 className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                            <p className="text-sm text-gray-500">Нийт байр</p>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded">{stats.available} зарж байна</span>
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">{stats.reserved} захиалгатай</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <Eye className="w-5 h-5 text-emerald-600" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl font-bold text-gray-900">{stats.total_views.toLocaleString()}</p>
                            <p className="text-sm text-gray-500">Нийт үзэлт</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-purple-600" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total_value)}</p>
                            <p className="text-sm text-gray-500">Нийт үнэлгээ</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <CheckCircle2 className="w-5 h-5 text-amber-600" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl font-bold text-gray-900">{stats.sold}</p>
                            <p className="text-sm text-gray-500">Зарагдсан</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Project & Top Viewed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Project */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Төслөөр</h3>
                        {projectData.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2 text-xs text-gray-500 font-medium">Төсөл</th>
                                            <th className="text-center py-2 text-xs text-gray-500 font-medium">Нийт</th>
                                            <th className="text-center py-2 text-xs text-gray-500 font-medium">Зарж байна</th>
                                            <th className="text-right py-2 text-xs text-gray-500 font-medium">Үзэлт</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {projectData.map((project) => (
                                            <tr key={project.project} className="border-b border-gray-50 hover:bg-gray-50">
                                                <td className="py-3">
                                                    <p className="text-sm font-medium text-gray-900">{project.project}</p>
                                                    <p className="text-xs text-gray-500">{formatCurrency(project.value)}</p>
                                                </td>
                                                <td className="py-3 text-sm text-center text-gray-600">{project.total}</td>
                                                <td className="py-3 text-sm text-center">
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">
                                                        {project.available}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-sm text-right text-gray-600">
                                                    {project.views.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Top Viewed */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Хамгийн их үзэлттэй</h3>
                        {topViewed.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2 text-xs text-gray-500 font-medium">Байр</th>
                                            <th className="text-center py-2 text-xs text-gray-500 font-medium">Үзэлт</th>
                                            <th className="text-center py-2 text-xs text-gray-500 font-medium">Төлөв</th>
                                            <th className="text-right py-2 text-xs text-gray-500 font-medium">Үнэ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topViewed.map((property, idx) => (
                                            <tr key={property.name} className="border-b border-gray-50 hover:bg-gray-50">
                                                <td className="py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-gray-300'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-900">{property.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 text-sm text-center">
                                                    <span className="flex items-center justify-center gap-1 text-gray-600">
                                                        <Eye className="w-3 h-3" />
                                                        {property.views}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-center">
                                                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[property.status] || 'bg-gray-100 text-gray-600'}`}>
                                                        {statusLabels[property.status] || property.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-sm text-right font-medium text-gray-900">
                                                    {formatCurrency(property.price)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
