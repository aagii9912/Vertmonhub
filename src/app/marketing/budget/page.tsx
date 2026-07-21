'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Money } from '@/components/ui/Money';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatusPill } from '@/components/ui/StatusPill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { formatShortDate } from '@/lib/utils/date';
import type { BudgetOverview, BudgetStatus } from '@/lib/marketing/budget';
import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    Trash2,
    TrendingUp,
    Wallet,
} from 'lucide-react';

/**
 * «Төсвийн хяналт» — сар бүрийн маркетингийн төсөв vs бодит зарцуулалт vs
 * борлуулалтын орлого (гэрээний дүн). Зарцуулалт төсвийн <80% ногоон,
 * 80–100% шар, >100% улаан өнгөөр ялгарна. Зарцуулалтыг гараар бүртгэнэ
 * (билборд, радио, boost...); Meta Ads-ийн автомат spend тусдаа харагдана.
 */

interface SpendEntry {
    id: string;
    spent_at: string;
    amount: number;
    channel: string;
    note: string | null;
}

interface BudgetData {
    year: number;
    available: boolean;
    overview?: BudgetOverview;
    byChannel?: Array<{ channel: string; amount: number }>;
    entries?: SpendEntry[];
    metaAdsTotalSpend?: number;
    channels?: Record<string, string>;
}

const STATUS_BAR: Record<BudgetStatus, string> = {
    ok: 'bg-status-success',
    warn: 'bg-status-pending',
    over: 'bg-status-danger',
    none: 'bg-surface-3',
};

const STATUS_PILL: Record<BudgetStatus, 'success' | 'pending' | 'danger' | 'neutral'> = {
    ok: 'success',
    warn: 'pending',
    over: 'danger',
    none: 'neutral',
};

const STATUS_LABEL: Record<BudgetStatus, string> = {
    ok: 'Хэвийн',
    warn: 'Анхаарах',
    over: 'Хэтэрсэн',
    none: 'Төсөвгүй',
};

export default function MarketingBudgetPage() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const queryClient = useQueryClient();

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [editMode, setEditMode] = useState(false);
    const [draftBudgets, setDraftBudgets] = useState<Record<number, string>>({});

    // Зарцуулалтын форм
    const [spentAt, setSpentAt] = useState(now.toISOString().slice(0, 10));
    const [amount, setAmount] = useState('');
    const [channel, setChannel] = useState('board');
    const [note, setNote] = useState('');

    const headers = { 'Content-Type': 'application/json', 'x-shop-id': shopId || '' };

    const { data, isLoading } = useQuery<BudgetData>({
        queryKey: ['marketing-budget', shopId, year],
        queryFn: async () => {
            const res = await fetch(`/api/marketing/budget?year=${year}`, {
                headers: { 'x-shop-id': shopId! },
            });
            if (!res.ok) throw new Error(`Budget failed: ${res.status}`);
            return res.json();
        },
        enabled: !!shopId,
        staleTime: 30000,
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['marketing-budget'] });

    const saveBudgets = useMutation({
        mutationFn: async () => {
            const months = Object.entries(draftBudgets).map(([m, v]) => ({
                month: Number(m),
                amount: Math.max(0, Number(v) || 0),
            }));
            if (months.length === 0) return;
            const res = await fetch('/api/marketing/budget', {
                method: 'PUT',
                headers,
                body: JSON.stringify({ year, months }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Алдаа');
        },
        onSuccess: () => {
            setEditMode(false);
            setDraftBudgets({});
            invalidate();
            toast.success('Төсөв хадгалагдлаа');
        },
        onError: (e) => toast.error(e.message),
    });

    const addSpend = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/marketing/budget', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    spentAt,
                    amount: Math.max(0, Number(amount) || 0),
                    channel,
                    note: note.trim() || null,
                }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Алдаа');
        },
        onSuccess: () => {
            setAmount('');
            setNote('');
            invalidate();
            toast.success('Зарцуулалт бүртгэгдлээ');
        },
        onError: (e) => toast.error(e.message),
    });

    const removeSpend = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/marketing/budget?id=${id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error('Устгах алдаа');
        },
        onSuccess: () => {
            invalidate();
            toast.success('Устгагдлаа');
        },
        onError: (e) => toast.error(e.message),
    });

    const overview = data?.overview;
    const channelLabels = useMemo(() => data?.channels || {}, [data]);

    const startEdit = () => {
        const init: Record<number, string> = {};
        overview?.months.forEach((m) => {
            init[m.month] = m.budget ? String(m.budget) : '';
        });
        setDraftBudgets(init);
        setEditMode(true);
    };

    return (
        <div className="mx-auto max-w-5xl">
            <PageHeader
                eyebrow="Маркетинг"
                title="Төсвийн хяналт"
                subtitle="Сар бүрийн маркетингийн төсөв, бодит зарцуулалт, борлуулалтын орлогын харьцуулалт — өнгөөр ялгаж хянана"
                secondaryActions={
                    <div className="flex items-center gap-1">
                        <Button variant="secondary" size="iconSm" onClick={() => setYear((y) => y - 1)} title="Өмнөх он">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="min-w-16 text-center text-sm font-medium tabular-nums">{year}</span>
                        <Button
                            variant="secondary"
                            size="iconSm"
                            onClick={() => setYear((y) => y + 1)}
                            disabled={year >= now.getFullYear() + 1}
                            title="Дараах он"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                }
            />

            {isLoading || !data ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" />
                </div>
            ) : !data.available ? (
                <Alert variant="warning">
                    <AlertTitle>Хүснэгт үүсээгүй байна</AlertTitle>
                    <AlertDescription>
                        Төсвийн миграци (supabase/migrations/20260721140000_marketing_budget_indicators.sql)
                        хийгдээгүй тул энэ хуудас түр ажиллахгүй.
                    </AlertDescription>
                </Alert>
            ) : (
                <div className="space-y-6">
                    {/* Жилийн тойм — ring hero + stat мөрүүд (Origin/Monarch жишиг) */}
                    <Card>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-center gap-6 py-5">
                            <div className="flex flex-col items-center gap-2 justify-self-center">
                                <ProgressRing
                                    value={overview?.totals.pct ?? 0}
                                    size={132}
                                    strokeWidth={10}
                                    tone={
                                        overview
                                            ? overview.totals.status === 'over'
                                                ? 'danger'
                                                : overview.totals.status === 'warn'
                                                  ? 'pending'
                                                  : overview.totals.status === 'ok'
                                                    ? 'success'
                                                    : 'neutral'
                                            : 'neutral'
                                    }
                                    aria-label={`Жилийн төсвийн зарцуулалт ${overview?.totals.pct ?? 0}%`}
                                >
                                    <span className="heading-display text-2xl tabular-nums">
                                        {overview?.totals.pct !== null && overview?.totals.pct !== undefined
                                            ? `${overview.totals.pct}%`
                                            : '—'}
                                    </span>
                                    <span className="text-2xs text-muted-foreground">зарцуулсан</span>
                                </ProgressRing>
                                {overview && (
                                    <StatusPill variant={STATUS_PILL[overview.totals.status]}>
                                        {STATUS_LABEL[overview.totals.status]}
                                    </StatusPill>
                                )}
                            </div>
                            <div className="divide-y divide-border/50">
                                {[
                                    { label: 'Жилийн төсөв', node: <Money value={overview?.totals.budget} compact /> },
                                    { label: 'Зарцуулалт', node: <Money value={overview?.totals.spend} compact /> },
                                    {
                                        label: 'Борлуулалтын орлого',
                                        node: <Money value={overview?.totals.revenue} compact />,
                                    },
                                    {
                                        label: 'Өгөөж (орлого/зардал)',
                                        node: (
                                            <span className="inline-flex items-center gap-1.5">
                                                <TrendingUp className="w-3.5 h-3.5 text-status-success" />
                                                {overview?.totals.roi !== null && overview?.totals.roi !== undefined
                                                    ? `${overview.totals.roi}x`
                                                    : '—'}
                                            </span>
                                        ),
                                    },
                                ].map((row) => (
                                    <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5">
                                        <span className="text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground/80">
                                            {row.label}
                                        </span>
                                        <span className="heading-display text-xl tabular-nums text-foreground">
                                            {row.node}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {(data.metaAdsTotalSpend || 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                            ℹ️ Meta Ads кампанит ажлуудын нийт зарцуулалт (автомат sync):{' '}
                            <Money value={data.metaAdsTotalSpend} className="font-medium text-foreground" /> — сар руу
                            задлахын тулд зарцуулалтын бүртгэлд Facebook Ads сувгаар гараар нэмнэ үү.
                        </p>
                    )}

                    {/* Сар бүрийн хяналт */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between py-3">
                            <CardTitle className="text-base">Сар бүрийн төсөв ба гүйцэтгэл</CardTitle>
                            {editMode ? (
                                <div className="flex gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>
                                        Болих
                                    </Button>
                                    <Button size="sm" onClick={() => saveBudgets.mutate()} isLoading={saveBudgets.isPending}>
                                        Хадгалах
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="secondary" size="sm" onClick={startEdit}>
                                    <Pencil className="w-4 h-4 mr-1.5" />
                                    Төсөв засах
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                                            <th className="px-4 py-2 font-medium">Сар</th>
                                            <th className="px-2 py-2 font-medium text-right">Төсөв</th>
                                            <th className="px-2 py-2 font-medium text-right">Зарцуулалт</th>
                                            <th className="px-2 py-2 font-medium w-[26%]">Гүйцэтгэл</th>
                                            <th className="px-2 py-2 font-medium text-right">Орлого</th>
                                            <th className="px-4 py-2 font-medium text-right">Төлөв</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {overview?.months.map((m) => (
                                            <tr key={m.month} className={m.month === now.getMonth() + 1 && year === now.getFullYear() ? 'bg-brand-soft/20' : undefined}>
                                                <td className="px-4 py-2.5 whitespace-nowrap">{m.month}-р сар</td>
                                                <td className="px-2 py-2.5 text-right">
                                                    {editMode ? (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={draftBudgets[m.month] ?? ''}
                                                            onChange={(e) =>
                                                                setDraftBudgets((p) => ({ ...p, [m.month]: e.target.value }))
                                                            }
                                                            className="h-8 w-32 text-right ml-auto"
                                                            aria-label={`${m.month}-р сарын төсөв`}
                                                        />
                                                    ) : (
                                                        <Money value={m.budget || null} />
                                                    )}
                                                </td>
                                                <td className="px-2 py-2.5 text-right">
                                                    <Money value={m.spend || null} />
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-[width] duration-500 ${STATUS_BAR[m.status]}`}
                                                            style={{ width: `${Math.min(100, m.pct ?? 0)}%` }}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2.5 text-right">
                                                    <Money value={m.revenue || null} />
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <StatusPill variant={STATUS_PILL[m.status]}>
                                                        {m.pct !== null ? `${m.pct}% · ` : ''}
                                                        {STATUS_LABEL[m.status]}
                                                    </StatusPill>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Зарцуулалт бүртгэх */}
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-brand" />
                                Зарцуулалтын бүртгэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    type="date"
                                    value={spentAt}
                                    onChange={(e) => setSpentAt(e.target.value)}
                                    className="w-auto"
                                    aria-label="Огноо"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="Дүн (₮)"
                                    className="w-36"
                                    aria-label="Дүн"
                                />
                                <Select value={channel} onValueChange={setChannel}>
                                    <SelectTrigger className="h-10 w-44" aria-label="Суваг">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(channelLabels).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Тайлбар (заавал биш)"
                                    className="flex-1 min-w-40"
                                    aria-label="Тайлбар"
                                />
                                <Button
                                    onClick={() => addSpend.mutate()}
                                    isLoading={addSpend.isPending}
                                    disabled={!amount || Number(amount) <= 0}
                                >
                                    <Plus className="w-4 h-4 md:mr-1.5" />
                                    <span className="hidden md:inline">Бүртгэх</span>
                                </Button>
                            </div>

                            {(data.byChannel || []).length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground/80">
                                        Сувгаар
                                    </p>
                                    {(() => {
                                        const max = Math.max(...(data.byChannel || []).map((c) => c.amount), 1);
                                        return (data.byChannel || []).map((c) => (
                                            <div key={c.channel} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
                                                <span className="text-xs text-muted-foreground truncate">
                                                    {channelLabels[c.channel] || c.channel}
                                                </span>
                                                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-brand"
                                                        style={{ width: `${Math.max(2, (c.amount / max) * 100)}%` }}
                                                    />
                                                </div>
                                                <Money value={c.amount} compact className="text-xs font-medium" />
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}

                            {(data.entries || []).length > 0 ? (
                                <div className="divide-y divide-border/60 border-t border-border/60">
                                    {(data.entries || []).map((e) => (
                                        <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm text-foreground">
                                                    {channelLabels[e.channel] || e.channel}
                                                    {e.note ? ` · ${e.note}` : ''}
                                                </p>
                                                <p className="text-xs text-muted-foreground tabular-nums">
                                                    {formatShortDate(e.spent_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <Money value={e.amount} className="text-sm font-medium" />
                                                <Button
                                                    variant="ghost"
                                                    size="iconSm"
                                                    onClick={() => removeSpend.mutate(e.id)}
                                                    title="Устгах"
                                                >
                                                    <Trash2 className="w-4 h-4 text-status-danger" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Энэ онд бүртгэсэн зарцуулалт алга — билборд, радио, boost зэрэг зардлаа бүртгэвэл
                                    төсвийн гүйцэтгэл автоматаар бодогдоно.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
