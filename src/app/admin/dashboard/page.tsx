'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
    Users, CreditCard, TrendingUp, Package,
    ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';

interface DashboardData {
    stats: {
        total_shops: number;
        subscriptions: {
            active: number;
            canceled: number;
            past_due: number;
            total: number;
        };
        revenue: {
            total_revenue: number;
            pending_revenue: number;
            paid_count: number;
            pending_count: number;
        };
        plans_count: number;
    };
    plans: Array<{ id: string; name: string; price_monthly: number }>;
    recent_shops: Array<{ id: string; name: string; created_at: string }>;
    recent_invoices: Array<{ id: string; amount: number; status: string; created_at: string; shops: { name: string } }>;
}

export default function AdminDashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboard();
    }, []);

    async function fetchDashboard() {
        try {
            const res = await fetch('/api/admin/dashboard');
            if (res.ok) {
                const result = await res.json();
                setData(result);
            }
        } catch (error) {
            console.error('Dashboard error:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Хяналтын самбарыг ачааллахад алдаа гарлаа</p>
            </div>
        );
    }

    const formatMoney = (amount: number) => {
        return `₮${amount.toLocaleString()}`;
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Админ хяналт</h1>
                <p className="text-muted-foreground mt-1">Платформын ерөнхий тойм</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Shops */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт дэлгүүр</p>
                                <p className="text-3xl font-bold text-foreground mt-1">
                                    {data.stats.total_shops}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6 text-brand-strong" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Active Subscriptions */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Идэвхтэй захиалга</p>
                                <p className="text-3xl font-bold text-foreground mt-1">
                                    {data.stats.subscriptions.active}
                                </p>
                                {data.stats.subscriptions.past_due > 0 && (
                                    <p className="text-xs text-status-danger mt-1">
                                        {data.stats.subscriptions.past_due} хугацаа хэтэрсэн
                                    </p>
                                )}
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <CreditCard className="w-6 h-6 text-brand" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Total Revenue */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт орлого</p>
                                <p className="text-3xl font-bold text-foreground mt-1">
                                    {formatMoney(data.stats.revenue.total_revenue)}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    {data.stats.revenue.paid_count} төлбөр
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-brand" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Plans */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Идэвхтэй багц</p>
                                <p className="text-3xl font-bold text-foreground mt-1">
                                    {data.stats.plans_count}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-status-info-soft rounded-xl flex items-center justify-center">
                                <Package className="w-6 h-6 text-status-info" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Shops */}
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Сүүлийн дэлгүүрүүд</h2>
                        {data.recent_shops.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">Шинэ дэлгүүр байхгүй</p>
                        ) : (
                            <div className="space-y-3">
                                {data.recent_shops.map((shop) => (
                                    <div key={shop.id} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
                                        <div>
                                            <p className="font-medium text-foreground">{shop.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(shop.created_at).toLocaleDateString('mn-MN')}
                                            </p>
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-brand" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Invoices */}
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Сүүлийн нэхэмжлэхүүд</h2>
                        {data.recent_invoices.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">Нэхэмжлэх байхгүй</p>
                        ) : (
                            <div className="space-y-3">
                                {data.recent_invoices.map((invoice) => (
                                    <div key={invoice.id} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
                                        <div>
                                            <p className="font-medium text-foreground">{invoice.shops?.name}</p>
                                            <p className="text-sm text-muted-foreground">{formatMoney(invoice.amount)}</p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${invoice.status === 'paid'
                                            ? 'bg-brand-soft text-brand-dark'
                                            : invoice.status === 'pending'
                                                ? 'bg-status-pending-soft text-status-pending'
                                                : 'bg-status-danger-soft text-status-danger'
                                            }`}>
                                            {invoice.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Plans Overview */}
            <Card>
                <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Багцын тойм</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {data.plans.map((plan) => (
                            <div key={plan.id} className="p-4 bg-surface-2/40 rounded-xl text-center">
                                <p className="font-medium text-foreground">{plan.name}</p>
                                <p className="text-lg font-bold text-brand-strong mt-1">
                                    {plan.price_monthly === 0 ? 'Free' : formatMoney(plan.price_monthly)}
                                </p>
                                <p className="text-xs text-muted-foreground">/сар</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
