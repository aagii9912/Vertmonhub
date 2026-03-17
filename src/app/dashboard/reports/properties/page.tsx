'use client';

import React, { useState } from 'react';
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

// Mock data for property reports
const MOCK_PROPERTY_STATS = {
    total: 24,
    available: 18,
    reserved: 4,
    sold: 2,
    total_value: 15800000000, // 15.8 тэрбум
    avg_price: 658000000, // 658 сая
    total_views: 4523,
    avg_views: 188,
    comparison: {
        views: '+34%',
        value: '+12%',
        sold: '+50%',
    },
};

const MOCK_PROPERTY_BY_PROJECT = [
    {
        project: 'Mandala Garden',
        total: 8,
        available: 6,
        reserved: 1,
        sold: 1,
        value: 2100000000,
        views: 1245,
    },
    {
        project: 'Mandala Tower',
        total: 10,
        available: 8,
        reserved: 2,
        sold: 0,
        value: 6500000000,
        views: 2034,
    },
    {
        project: 'Elysium Residence',
        total: 6,
        available: 4,
        reserved: 1,
        sold: 1,
        value: 7200000000,
        views: 1244,
    },
];

const MOCK_TOP_VIEWED = [
    { name: 'Mandala Tower 365 - 3 өрөө', views: 823, status: 'available', price: 580000000 },
    { name: 'Elysium 4 өрөө Лакшери', views: 934, status: 'sold', price: 1100000000 },
    { name: 'Mandala Tower Пентхаус', views: 567, status: 'available', price: 1250000000 },
    { name: 'Elysium 3 өрөө Премиум', views: 612, status: 'reserved', price: 780000000 },
    { name: 'Mandala Garden 3 өрөө', views: 412, status: 'available', price: 380000000 },
];

const MOCK_PRICE_RANGE = [
    { range: '100-200 сая', count: 3, percentage: 12 },
    { range: '200-400 сая', count: 8, percentage: 33 },
    { range: '400-600 сая', count: 6, percentage: 25 },
    { range: '600-1 тэрбум', count: 4, percentage: 17 },
    { range: '1 тэрбум+', count: 3, percentage: 13 },
];

const MOCK_MONTHLY_DATA = [
    { month: '10-р сар', views: 2100, sold: 1 },
    { month: '11-р сар', views: 2800, sold: 0 },
    { month: '12-р сар', views: 3200, sold: 1 },
    { month: '1-р сар', views: 4523, sold: 2 },
];

export default function PropertiesReportPage() {
    const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

    const stats = MOCK_PROPERTY_STATS;
    const projectData = MOCK_PROPERTY_BY_PROJECT;
    const topViewed = MOCK_TOP_VIEWED;
    const priceRange = MOCK_PRICE_RANGE;
    const monthlyData = MOCK_MONTHLY_DATA;

    const formatCurrency = (value: number) => {
        if (value >= 1000000000) {
            return `${(value / 1000000000).toFixed(1)} тэрбум`;
        }
        return `${(value / 1000000).toFixed(0)} сая`;
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
                            <span className="text-xs text-emerald-600 font-medium flex items-center">
                                <ArrowUpRight className="w-3 h-3" /> {stats.comparison.views}
                            </span>
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
                            <span className="text-xs text-emerald-600 font-medium flex items-center">
                                <ArrowUpRight className="w-3 h-3" /> {stats.comparison.value}
                            </span>
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
                            <span className="text-xs text-emerald-600 font-medium flex items-center">
                                <ArrowUpRight className="w-3 h-3" /> {stats.comparison.sold}
                            </span>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl font-bold text-gray-900">{stats.sold}</p>
                            <p className="text-sm text-gray-500">Зарагдсан (энэ сар)</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Project & Price Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Project */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Төслөөр</h3>
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
                    </CardContent>
                </Card>

                {/* Price Distribution */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Үнийн тархалт</h3>
                        <div className="space-y-3">
                            {priceRange.map((item) => (
                                <div key={item.range}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-gray-700">{item.range}</span>
                                        <span className="text-sm font-medium text-gray-900">{item.count} байр</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{ width: `${item.percentage}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top Viewed Properties */}
            <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Хамгийн их үзэлттэй байрууд</h3>
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
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-gray-300'
                                                    }`}>
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
                                            <span className={`px-2 py-1 text-xs rounded-full ${statusColors[property.status]}`}>
                                                {statusLabels[property.status]}
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
                </CardContent>
            </Card>

            {/* Monthly Trend */}
            <Card className="bg-white border-gray-200">
                <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Сарын чиг хандлага</h3>
                    <div className="h-48 flex items-end justify-around gap-4">
                        {monthlyData.map((month) => (
                            <div key={month.month} className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-full flex flex-col items-center">
                                    <div
                                        className="w-full bg-emerald-500 rounded-t"
                                        style={{ height: `${(month.views / 5000) * 150}px` }}
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-medium text-gray-900">{month.views.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">{month.month}</p>
                                    {month.sold > 0 && (
                                        <p className="text-xs text-emerald-600 mt-1">+{month.sold} зарагдсан</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
