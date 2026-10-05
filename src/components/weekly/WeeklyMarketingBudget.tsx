'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { formatMNTShort } from '@/lib/utils/currency';
import type { BudgetOverview } from '@/lib/marketing/budget';
import { cn } from '@/lib/utils';

type BudgetResponse = { year: number; available: boolean; error?: string; overview?: BudgetOverview };

/** Төслийн маркетингийн жилийн үндсэн төсөв: он эхнээс болон тухайн сарын зарцуулалт. */
export function WeeklyMarketingBudget({ to }: { to: string }) {
    const { shop, user } = useAuth();
    const year = Number(to.slice(0, 4));
    const month = Number(to.slice(5, 7));
    const query = useQuery<BudgetResponse>({
        queryKey: ['marketing-budget', 'weekly', shop?.id, user?.id, year],
        queryFn: ({ signal }) => dashboardJson(`/api/marketing/budget?year=${year}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id, staleTime: 60_000, retry: 1,
    });
    const overview = query.data?.overview;
    if (query.isPending) return null;
    if (!query.data?.available || !overview) {
        return <p className="text-xs text-muted-foreground">Маркетингийн жилийн төсөв: {query.data?.error || query.error?.message || 'мэдээлэл алга'}</p>;
    }
    const ytd = overview.months.filter(row => row.month <= month);
    const ytdSpend = ytd.reduce((sum, row) => sum + row.spend, 0);
    const ytdBudget = ytd.reduce((sum, row) => sum + row.budget, 0);
    const current = overview.months[month - 1];
    const pct = (spend: number, budget: number) => budget > 0 ? `${Math.round(spend / budget * 100)}%` : 'төсөвгүй';
    return (
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border p-5 sm:grid-cols-4">
            <Cell label={`${year} оны үндсэн төсөв`} value={overview.totals.budget ? formatMNTShort(overview.totals.budget) : 'Оруулаагүй'} />
            <Cell label="Он эхнээс зарцуулсан" value={formatMNTShort(ytdSpend)} helper={`${pct(ytdSpend, ytdBudget)} (энэ хүртэлх сарын төсвөөс)`} tone={ytdBudget > 0 && ytdSpend > ytdBudget ? 'danger' : undefined} />
            <Cell label={`${month}-р сарын төсөв`} value={current?.budget ? formatMNTShort(current.budget) : 'Оруулаагүй'} />
            <Cell label={`${month}-р сард зарцуулсан`} value={formatMNTShort(current?.spend ?? 0)} helper={current ? pct(current.spend, current.budget) : undefined} tone={current?.status === 'over' ? 'danger' : undefined} />
            <Link href="/marketing/budget" className="col-span-full inline-flex items-center gap-1 text-xs text-brand-strong hover:underline focus-ring print:hidden">Төсөв засах, зардал нэмэх<ArrowUpRight className="size-3" /></Link>
        </div>
    );
}

function Cell({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: 'danger' }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className={cn('num mt-1.5 text-lg font-semibold', tone === 'danger' && 'text-status-danger')}>{value}</p>{helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}</div>;
}
