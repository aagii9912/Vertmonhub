'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Users, UserPlus, FileText, UserCheck, CalendarDays, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { formatShortDate } from '@/lib/utils/date';
import Link from 'next/link';

/** Админ хяналт — платформын CRM тойм (бүх байгууллагын нийлбэр). */
interface DashboardData {
    stats: { total_shops: number };
    crm: { users: number; leads: number; contracts: number; customers: number; viewings: number };
    recent_shops: Array<{ id: string; name: string; created_at: string }>;
}

async function fetchDashboard(): Promise<DashboardData> {
    const res = await fetch('/api/admin/dashboard');
    const result = await res.json();
    if (!res.ok || !result.crm) throw new Error(result.error || 'Мэдээлэл дутуу ирлээ');
    return result;
}

export default function AdminDashboard() {
    const { shop, user } = useAuth();
    const { data, error, isFetching, refetch } = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-dashboard', shop?.id, user?.id, user?.role],
        queryFn: fetchDashboard,
        enabled: !!user?.id,
        staleTime: 30_000,
    });

    if (!data && isFetching) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">{error ? 'Хяналтын самбарын мэдээлэл ачаалагдсангүй. Дахин оролдоно уу.' : 'Хяналтын самбар ачаалахад алдаа гарлаа'}</p>
                <button onClick={() => void refetch()} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2">Дахин ачаалах</button>
            </div>
        );
    }

    const crm = data.crm;
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

            <div className="flex flex-wrap gap-2">
                {[
                    { href: '/admin/users', label: 'Хэрэглэгчид' },
                    { href: '/admin/projects', label: 'Төслүүд' },
                    { href: '/admin/sales-targets', label: 'Борлуулалтын төлөвлөгөө' },
                    { href: '/admin/import', label: 'Дата импорт' },
                ].map((action) => <Link key={action.href} href={action.href} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-brand">{action.label}</Link>)}
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
                        <p className="text-muted-foreground text-center py-4">Байгууллага бүртгэгдээгүй байна</p>
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
