'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, UserPlus, FileText, UserCheck, CalendarDays, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatShortDate } from '@/lib/utils/date';

/**
 * Админ хяналт — платформын CRM тойм (бүх байгууллагын нийлбэр).
 * 2026-09 review (M6): billing (захиалга / орлого / багц / нэхэмжлэх) хүснэгтүүд prod DB-д байхгүй тул
 * `/api/admin/dashboard`-ийн `crm` талбарыг харуулна; хуучин SaaS картууд хасагдсан.
 */
interface DashboardData {
    stats: { total_shops: number };
    crm?: { users: number; leads: number; contracts: number; customers: number; viewings: number };
    recent_shops: Array<{ id: string; name: string; created_at: string }>;
}

const EMPTY_CRM = { users: 0, leads: 0, contracts: 0, customers: 0, viewings: 0 };

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
                <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Хяналтын самбар ачаалахад алдаа гарлаа</p>
            </div>
        );
    }

    const crm = data.crm ?? EMPTY_CRM;
    const cards: { label: string; value: number; icon: LucideIcon }[] = [
        { label: 'Байгууллага', value: data.stats.total_shops, icon: Building2 },
        { label: 'Хэрэглэгч', value: crm.users, icon: Users },
        { label: 'Лид', value: crm.leads, icon: UserPlus },
        { label: 'Гэрээ', value: crm.contracts, icon: FileText },
        { label: 'Харилцагч', value: crm.customers, icon: UserCheck },
        { label: 'Уулзалт', value: crm.viewings, icon: CalendarDays },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="heading-display text-2xl text-foreground">Админ хяналт</h1>
                <p className="text-muted-foreground mt-1">Платформын CRM тойм — бүх байгууллагын нийлбэр</p>
            </div>

            {/* CRM stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {cards.map(({ label, value, icon: Icon }) => (
                    <Card key={label}>
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[12.5px] text-muted-foreground">{label}</p>
                                    <p className="num mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
                                        {Number(value ?? 0).toLocaleString('en-US')}
                                    </p>
                                </div>
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft">
                                    <Icon className="h-5 w-5 text-brand-strong" strokeWidth={1.75} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Recent shops */}
            <Card>
                <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Сүүлийн байгууллагууд</h2>
                    {data.recent_shops.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">Шинэ байгууллага алга</p>
                    ) : (
                        <div className="space-y-1">
                            {data.recent_shops.map((shop) => (
                                <div key={shop.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">{shop.name}</p>
                                        <p className="mono-label text-[11px] text-muted-foreground">{formatShortDate(shop.created_at)}</p>
                                    </div>
                                    <ArrowUpRight className="w-4 h-4 shrink-0 text-brand-strong" />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
