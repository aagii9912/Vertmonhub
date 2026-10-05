'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
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
import { formatShortDate, ubDateStr, ubParts } from '@/lib/utils/date';
import { allocateAnnualBudget, MarketingBudgetSchema, MAX_BUDGET_AMOUNT, type BudgetOverview, type BudgetStatus } from '@/lib/marketing/budget';
import type { spendQuality } from '@/lib/marketing/performance';
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
 * «Төсвийн хяналт» — жилийн/сарын маркетингийн төсөв vs бүртгэсэн зарцуулалт vs
 * борлуулалтын орлого (гэрээний дүн). Зарцуулалт төсвийн <80% ногоон,
 * 80–100% шар, >100% улаан өнгөөр ялгарна. Зарцуулалтыг гараар бүртгэнэ
 * (билборд, радио, boost...); Meta Ads-ийн автомат spend тусдаа харагдана.
 */

interface SpendEntry {
    source?: 'manual' | 'meta';
    ingestionSource?: 'api' | 'file';
    exclusion?: string | null;
    id: string;
    spent_at: string;
    amount: number;
    channel: string;
    note: string | null;
}

interface BudgetData {
    spendQuality?: ReturnType<typeof spendQuality>;
    year: number;
    available: boolean;
    error?: string;
    projects?: Array<{ id: string; name: string }>;
    project_id?: string | null;
    unassignedSpendCount?: number;
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
    const { shop, user } = useAuth();
    if (!shop || !user) return <p className="py-8 text-sm text-muted-foreground">Төсөв харахын тулд байгууллага сонгоно уу.</p>;
    const hasModule = user?.role === 'super_admin' || !!user?.permissions?.modules.includes('marketing-roi');
    if (!hasModule) return <p className="py-8 text-sm text-muted-foreground">Маркетингийн төсөв харах эрх алга.</p>;
    const canWrite = !!user.permissions.canWrite;
    const canDelete = !!user.permissions.canDelete;
    return <MarketingBudgetWorkspace key={`${user.id}:${shop.id}:${canWrite}:${canDelete}`} shopId={shop.id} userId={user.id}
        canWrite={canWrite} canDelete={canDelete} />;
}

function MarketingBudgetWorkspace({ shopId, userId, canWrite, canDelete }: { shopId: string; userId: string; canWrite: boolean; canDelete: boolean }) {
    const queryClient = useQueryClient();

    const now = ubParts();
    const [year, setYear] = useState(now.year);
    const [project, setProject] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [draftBudgets, setDraftBudgets] = useState<Record<number, string>>({});
    const [annualAmount, setAnnualAmount] = useState('');

    // Зарцуулалтын форм
    const [spentAt, setSpentAt] = useState(ubDateStr());
    const [amount, setAmount] = useState('');
    const [channel, setChannel] = useState('board');
    const [note, setNote] = useState('');

    const { data, isLoading, error, refetch } = useQuery<BudgetData>({
        queryKey: ['marketing-budget', userId, shopId, year, project],
        queryFn: async () => {
            const params = new URLSearchParams({ year: String(year), ...(project ? { project } : {}) });
            const res = await dashboardFetch(`/api/marketing/budget?${params}`, { shopId });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Төсвийн мэдээлэл татах алдаа');
            return body;
        },
        enabled: !!shopId,
        staleTime: 30000,
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['marketing-budget'] });

    const saveBudgets = useMutation({
        mutationFn: async () => {
            const parsed = MarketingBudgetSchema.safeParse({ year, project_id: project || null, annualAmount: Number(annualAmount),
                months: Object.entries(draftBudgets).map(([m, v]) => ({ month: Number(m), amount: v.trim() ? Number(v) : 0 })) });
            if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Төсөв буруу байна');
            const res = await dashboardFetch('/api/marketing/budget', {
                shopId,
                method: 'PUT',
                body: JSON.stringify(parsed.data),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Алдаа');
        },
        onSuccess: () => {
            setEditMode(false);
            setDraftBudgets({});
            setAnnualAmount('');
            invalidate();
            toast.success('Төсөв хадгалагдлаа');
        },
        onError: (e) => toast.error(e.message),
    });

    const addSpend = useMutation({
        mutationFn: async () => {
            const res = await dashboardFetch('/api/marketing/budget', {
                shopId,
                method: 'POST',
                body: JSON.stringify({
                    spentAt,
                    amount: Number(amount),
                    project_id: project || null,
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
            const params = new URLSearchParams({ id, ...(project ? { project } : {}) });
            const res = await dashboardFetch(`/api/marketing/budget?${params}`, { method: 'DELETE', shopId });
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
    const scopeBusy = editMode || saveBudgets.isPending || addSpend.isPending || removeSpend.isPending;
    const draftTotal = Object.values(draftBudgets).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const validDraft = annualAmount.trim() !== '' && MarketingBudgetSchema.safeParse({ year, annualAmount: Number(annualAmount),
        months: Object.entries(draftBudgets).map(([m, v]) => ({ month: Number(m), amount: v.trim() ? Number(v) : 0 })) }).success;

    const startEdit = () => {
        const init: Record<number, string> = {};
        overview?.months.forEach((m) => {
            init[m.month] = m.budget ? String(m.budget) : '';
        });
        setDraftBudgets(init);
        setAnnualAmount(String(overview?.totals.budget ?? 0));
        setEditMode(true);
    };

    const distributeAnnual = () => {
        try {
            const months = allocateAnnualBudget(Number(annualAmount));
            setDraftBudgets(Object.fromEntries(months.map(m => [m.month, String(m.amount)])));
        } catch { toast.error('Жилийн төсөв 0-ээс их эсвэл тэнцүү бүхэл төгрөгөөр байна'); }
    };
    const resetSpendDraft = () => { setAmount(''); setNote(''); };

    return (
        <div className="mx-auto max-w-5xl">
            <PageHeader
                eyebrow="Маркетинг"
                title="Төсвийн хяналт"
                subtitle="Төслийн маркетингийн жилийн үндсэн төсвийг сараар хуваарилж, бүртгэсэн зарцуулалт, гэрээний дүнтэй харьцуулна"
                secondaryActions={
                    <div className="flex items-center gap-1">
                        <Button variant="secondary" size="iconSm" disabled={scopeBusy || year <= 2020} onClick={() => { setYear((y) => y - 1); resetSpendDraft(); }} title="Өмнөх он">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="min-w-16 text-center text-sm font-medium tabular-nums">{year}</span>
                        <Button
                            variant="secondary"
                            size="iconSm"
                            onClick={() => { setYear((y) => y + 1); resetSpendDraft(); }}
                            disabled={scopeBusy || year >= 2100}
                            title="Дараах он"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                }
            />

            {/* Shop = төсөл: ганц төсөлтэй ажлын орчинд энэ төсөв нь тухайн төслийн жилийн үндсэн төсөв. */}
            {(data?.projects?.length ?? 0) > 1 && <label className="mb-5 grid max-w-sm gap-1.5 text-sm">
                Төсвийн хамрах хүрээ
                <select aria-label="Төсвийн хамрах хүрээ" className="h-10 rounded-md border border-border bg-surface px-3 text-sm" value={project}
                    disabled={scopeBusy || isLoading} onChange={e => { setProject(e.target.value); resetSpendDraft(); }}>
                    <option value="">Ажлын орчны нийт төсөв</option>
                    {data?.projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="text-xs text-muted-foreground">Хуучин олон төсөлтэй ажлын орчин. Төсөл бүрийг тусдаа ажлын орчин болгосны дараа энэ сонголт алга болно.</span>
            </label>}

            {error ? <Alert variant="danger"><AlertTitle>Төсөв татахад алдаа гарлаа</AlertTitle><AlertDescription>{error.message}</AlertDescription><Button variant="secondary" size="sm" onClick={() => void refetch()}>Дахин оролдох</Button></Alert> : isLoading || !data ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" />
                </div>
            ) : !data.available ? (
                <Alert variant="warning">
                    <AlertTitle>Хүснэгт үүсээгүй байна</AlertTitle>
                    <AlertDescription>
                        {data.error || 'Төсвийн хадгалалт бэлэн биш байна.'}
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
                                        label: 'Гэрээний нийт дүн',
                                        node: <Money value={overview?.totals.revenue} compact />,
                                    },
                                    {
                                        label: 'Гэрээний дүн / зардал',
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
                            Meta Ads өдрийн зардал (жилийн нийтэд орсон):{' '}
                            <Money value={data.metaAdsTotalSpend} className="font-medium text-foreground" /> — саруудад автоматаар хуваарилсан. Гараар дахин нэмэхгүй.
                        </p>
                    )}

                    {!!(data.spendQuality?.missingFx || data.spendQuality?.excludedManual) && <Alert variant="warning">Ханшгүй Meta: {data.spendQuality?.missingFx} мөр; нийтээс хассан гар Meta: {data.spendQuality?.excludedManual} мөр. Ханшгүй бол нийт зардал бүрэн биш. <a href="/marketing" className="underline">Meta синк / ханш тохируулах</a></Alert>}
                    {!!data.unassignedSpendCount && <Alert variant="warning">Төсөлд холбоогүй {data.unassignedSpendCount} зардлын мөр энэ төслийн нийтэд ороогүй. Маркетингийн зардлын бүртгэлээс төслийг холбоно уу.</Alert>}
                    {/* Сар бүрийн хяналт */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between py-3">
                            <CardTitle className="text-base">Сар бүрийн төсөв ба гүйцэтгэл</CardTitle>
                            {editMode ? (
                                <div className="flex gap-2">
                                    <Button variant="secondary" size="sm" disabled={saveBudgets.isPending} onClick={() => setEditMode(false)}>
                                        Болих
                                    </Button>
                                    <Button size="sm" disabled={!validDraft} onClick={() => saveBudgets.mutate()} isLoading={saveBudgets.isPending}>
                                        Хадгалах
                                    </Button>
                                </div>
                            ) : (
                                canWrite && <Button variant="secondary" size="sm" onClick={startEdit}>
                                    <Pencil className="w-4 h-4 mr-1.5" />
                                    Төсөв засах
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            {editMode && <div className="space-y-2 border-b border-border px-4 py-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="grid gap-1.5 text-sm">Жилийн төсөв (₮)<Input type="number" min={0} max={MAX_BUDGET_AMOUNT} step={1}
                                        value={annualAmount} disabled={saveBudgets.isPending} onChange={e => setAnnualAmount(e.target.value)} /></label>
                                    <Button variant="secondary" disabled={saveBudgets.isPending || annualAmount.trim() === '' || !Number.isSafeInteger(Number(annualAmount)) || Number(annualAmount) < 0 || Number(annualAmount) > MAX_BUDGET_AMOUNT}
                                        onClick={distributeAnnual}>12 сард тэнцүү хуваарилах</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Хуваарилах товч доорх 12 сарын дүнг шинэчилнэ. Сар бүрийг шалгаж, шаардлагатай бол өөрчилсний дараа хадгална.</p>
                                <p className="text-sm">Хуваарилсан нийт: <Money value={draftTotal} />{draftTotal !== Number(annualAmount) && <span className="ml-2 text-status-pending">Жилийн дүнтэй тэнцүүлэх шаардлагатай</span>}</p>
                            </div>}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                                            <th className="px-4 py-2 font-medium">Сар</th>
                                            <th className="px-2 py-2 font-medium text-right">Төсөв</th>
                                            <th className="px-2 py-2 font-medium text-right">Зарцуулалт</th>
                                            <th className="px-2 py-2 font-medium w-[26%]">Гүйцэтгэл</th>
                                            <th className="px-2 py-2 font-medium text-right">Гэрээний дүн</th>
                                            <th className="px-4 py-2 font-medium text-right">Төлөв</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {overview?.months.map((m) => (
                                            <tr key={m.month} className={m.month === now.month && year === now.year ? 'bg-brand-soft/20' : undefined}>
                                                <td className="px-4 py-2.5 whitespace-nowrap">{m.month}-р сар</td>
                                                <td className="px-2 py-2.5 text-right">
                                                    {editMode ? (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={MAX_BUDGET_AMOUNT}
                                                            step={1}
                                                            disabled={saveBudgets.isPending}
                                                            value={draftBudgets[m.month] ?? ''}
                                                            onChange={(e) => {
                                                                const next = { ...draftBudgets, [m.month]: e.target.value };
                                                                setDraftBudgets(next);
                                                                setAnnualAmount(String(Object.values(next).reduce((sum, value) => sum + (Number(value) || 0), 0)));
                                                            }}
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
                                <Wallet className="w-4 h-4 text-brand-strong" />
                                Зарцуулалтын бүртгэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {canWrite && <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    type="date"
                                    value={spentAt}
                                    disabled={addSpend.isPending}
                                    onChange={(e) => setSpentAt(e.target.value)}
                                    className="w-auto"
                                    aria-label="Огноо"
                                />
                                <Input
                                    type="number"
                                    min={0}
                                    max={MAX_BUDGET_AMOUNT}
                                    step={1}
                                    value={amount}
                                    disabled={addSpend.isPending}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="Дүн (₮)"
                                    className="w-36"
                                    aria-label="Дүн"
                                />
                                <Select value={channel} onValueChange={setChannel} disabled={addSpend.isPending}>
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
                                    disabled={addSpend.isPending}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Тайлбар (заавал биш)"
                                    className="flex-1 min-w-40"
                                    aria-label="Тайлбар"
                                />
                                <Button
                                    onClick={() => addSpend.mutate()}
                                    isLoading={addSpend.isPending}
                                    disabled={!amount || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || Number(amount) > MAX_BUDGET_AMOUNT}
                                >
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Бүртгэх
                                </Button>
                            </div>}

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
                                                    {e.source === 'meta' ? ` · Meta ${e.ingestionSource === 'file' ? 'файл импорт' : 'API'}` : ''}{e.exclusion ? ' · Нийтээс хассан' : ''}
                                                    {e.note ? ` · ${e.note}` : ''}
                                                </p>
                                                <p className="text-xs text-muted-foreground tabular-nums">
                                                    {formatShortDate(e.spent_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {e.exclusion ? <span className="text-xs text-muted-foreground">Нийтэд ороогүй</span> : <Money value={e.amount} className="text-sm font-medium" />}
                                                {canDelete && <Button
                                                    variant="ghost"
                                                    size="iconSm"
                                                    disabled={e.source === 'meta' || removeSpend.isPending}
                                                    onClick={() => removeSpend.mutate(e.id)}
                                                    title="Устгах"
                                                >
                                                    <Trash2 className="w-4 h-4 text-status-danger" />
                                                </Button>}
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
