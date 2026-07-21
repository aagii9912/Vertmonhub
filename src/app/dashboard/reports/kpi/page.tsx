'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import {
    formatKpiReportText,
    LEAD_SOURCE_LABELS,
    LEAD_STATUS_LABELS,
    VIEWING_STATUS_LABELS,
    type KpiContractRow,
    type KpiSummary,
    type KpiTaskRow,
    type KpiViewingRow,
} from '@/lib/dashboard/kpi-report';
import { formatShortDate } from '@/lib/utils/date';
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ClipboardCopy,
    FileBarChart,
    Printer,
    UserRound,
} from 'lucide-react';

/**
 * «Сарын KPI тайлан» — менежерийн сарын бүх ажлыг автоматаар нэгтгэсэн,
 * хэвлэх/хуулахад бэлэн тайлан (/api/dashboard/kpi-report).
 * Сар бүр хийсэн ажлаа гараар санаж бичих шаардлагагүй — лид, уулзалт, гэрээ,
 * борлуулалт, дуусгасан ажлууд системд байгаагаараа тайлан болно.
 */

interface KpiReportData {
    manager: { name: string | null; isSelf: boolean };
    shopName: string | null;
    year: number;
    month: number;
    onboarding: boolean;
    summary?: KpiSummary;
    leadsByStatus?: Record<string, number>;
    leadsBySource?: Record<string, number>;
    viewingsByStatus?: Record<string, number>;
    contracts?: KpiContractRow[];
    viewings?: KpiViewingRow[];
    tasksDone?: KpiTaskRow[];
    target?: { teamTarget: number; teamActual: number; myShare: number | null } | null;
}

interface ManagerOption {
    name: string;
    is_active: boolean;
}

/** Medium/Stripe маягийн намуухан өөрчлөлтийн мөр («+12% өмнөх сараас»). */
function DeltaLine({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined) {
        return <p className="text-2xs text-muted-foreground mt-1">өмнөх сард дүнгүй</p>;
    }
    return (
        <p
            className={`text-2xs mt-1 tabular-nums ${
                value > 0 ? 'text-status-success' : value < 0 ? 'text-status-danger' : 'text-muted-foreground'
            }`}
        >
            {value > 0 ? '↑' : value < 0 ? '↓' : ''} {value >= 0 ? '+' : ''}
            {value}% өмнөх сараас
        </p>
    );
}

export default function KpiReportPage() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const { data: mode } = useDashboardMode();
    const canPickManager = !!mode && mode.mode === 'org' && mode.canViewTeam;

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [managerChoice, setManagerChoice] = useState('');

    const { data: managerList } = useQuery<{ managers: ManagerOption[] }>({
        queryKey: ['managers', shopId],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/managers', { headers: { 'x-shop-id': shopId! } });
            if (!res.ok) return { managers: [] };
            return res.json();
        },
        enabled: !!shopId && canPickManager,
        staleTime: 300000,
    });

    // Админ/тайлангийн хэрэглэгчид: сонгоогүй бол жагсаалтын эхний менежер (derived — effect хэрэггүй)
    const manager = canPickManager ? managerChoice || managerList?.managers?.[0]?.name || '' : '';

    const { data, isLoading } = useQuery<KpiReportData>({
        queryKey: ['kpi-report', shopId, year, month, manager || 'self'],
        queryFn: async () => {
            const params = new URLSearchParams({ year: String(year), month: String(month) });
            if (manager) params.set('manager', manager);
            const res = await fetch(`/api/dashboard/kpi-report?${params.toString()}`, {
                headers: { 'x-shop-id': shopId! },
            });
            if (!res.ok) throw new Error(`KPI report failed: ${res.status}`);
            return res.json();
        },
        enabled: !!shopId && (!canPickManager || !!manager),
        staleTime: 60000,
    });

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const shiftMonth = (dir: -1 | 1) => {
        const d = new Date(year, month - 1 + dir, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
    };

    const reportText = useMemo(() => {
        if (!data?.summary || !data.manager.name) return '';
        return formatKpiReportText({
            managerName: data.manager.name,
            shopName: data.shopName,
            year: data.year,
            month: data.month,
            summary: data.summary,
            leadsByStatus: data.leadsByStatus || {},
            leadsBySource: data.leadsBySource || {},
            viewingsByStatus: data.viewingsByStatus || {},
            contracts: data.contracts || [],
            tasksDone: data.tasksDone || [],
            target: data.target,
        });
    }, [data]);

    const copyReport = async () => {
        if (!reportText) return;
        try {
            await navigator.clipboard.writeText(reportText);
            toast.success('Тайлан хуулагдлаа — имэйл/чат руугаа буулгаж болно');
        } catch {
            toast.error('Хуулж чадсангүй');
        }
    };

    const summary = data?.summary;
    const targetPct =
        data?.target && data.target.teamTarget > 0
            ? Math.min(100, Math.round((data.target.teamActual / data.target.teamTarget) * 100))
            : null;

    return (
        <div className="mx-auto max-w-4xl">
            <div className="print:hidden">
                <PageHeader
                    eyebrow="Аналитик"
                    title="Сарын KPI тайлан"
                    subtitle="Лид · уулзалт · гэрээ · борлуулалт · хийсэн ажлууд — системд бүртгэлтэй бүх ажил автоматаар нэгтгэгдэнэ"
                    secondaryActions={
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={copyReport} disabled={!reportText}>
                                <ClipboardCopy className="w-4 h-4 mr-1.5" />
                                Хуулах
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => window.print()}>
                                <Printer className="w-4 h-4 mr-1.5" />
                                Хэвлэх
                            </Button>
                        </div>
                    }
                />

                {/* Сар + менежер сонголт */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <div className="flex items-center gap-1">
                        <Button variant="secondary" size="iconSm" onClick={() => shiftMonth(-1)} title="Өмнөх сар">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="min-w-36 text-center text-sm font-medium text-foreground tabular-nums">
                            {year} оны {month}-р сар
                        </span>
                        <Button
                            variant="secondary"
                            size="iconSm"
                            onClick={() => shiftMonth(1)}
                            disabled={isCurrentMonth}
                            title="Дараах сар"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {canPickManager && (
                        <Select value={manager} onValueChange={setManagerChoice}>
                            <SelectTrigger className="h-9 w-56" aria-label="Менежер сонгох">
                                <span className="flex items-center gap-2">
                                    <UserRound className="size-4 text-muted-foreground/70" />
                                    <SelectValue placeholder="Менежер сонгох" />
                                </span>
                            </SelectTrigger>
                            <SelectContent>
                                {(managerList?.managers || []).map((m) => (
                                    <SelectItem key={m.name} value={m.name}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {isLoading || !data ? (
                <KpiGridSkeleton />
            ) : data.onboarding || !summary ? (
                <Alert variant="info">
                    <AlertTitle>Тайлан гаргах менежер олдсонгүй</AlertTitle>
                    <AlertDescription>
                        Таны нэр борлуулалтын менежерийн бүртгэлд алга. Админ таныг бүртгэлд нэмсний
                        дараа хувийн KPI тайлан автоматаар гарна.
                    </AlertDescription>
                </Alert>
            ) : (
                <div className="space-y-4 md:space-y-6">
                    {/* Тайлангийн editorial толгой (хэвлэлтэд гарна) */}
                    <div>
                        <p className="text-2xs font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
                            {data.shopName || 'Vertmon Hub'} · Сарын KPI тайлан
                        </p>
                        <h2 className="heading-display text-2xl md:text-3xl text-foreground mt-1.5">
                            {data.manager.name} — {data.year} оны {data.month}-р сар
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1.5">
                            Гаргасан: {formatShortDate(new Date())} · Vertmon Hub автоматаар нэгтгэв
                        </p>
                    </div>

                    {/* Нэгдсэн үзүүлэлт — hairline metric band (Stripe/Medium жишиг) */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border/60 border border-border/60 rounded-lg overflow-hidden">
                        {[
                            { label: 'Шинэ лид', value: String(summary.newLeads), delta: summary.deltas.leads },
                            {
                                label: 'Уулзалт',
                                value: String(summary.viewings),
                                delta: summary.deltas.viewings,
                                hint: `болсон: ${summary.viewingsDone}`,
                            },
                            { label: 'Гэрээ', value: String(summary.contracts), delta: summary.deltas.contracts },
                            { label: 'Дууссан ажил', value: String(summary.tasksDone), delta: undefined },
                        ].map((kpi) => (
                            <div key={kpi.label} className="bg-surface px-4 py-4">
                                <p className="text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground/80">
                                    {kpi.label}
                                </p>
                                <p className="heading-display text-3xl tabular-nums text-foreground mt-1.5">
                                    {kpi.value}
                                </p>
                                {kpi.delta !== undefined ? (
                                    <DeltaLine value={kpi.delta} />
                                ) : kpi.hint ? null : (
                                    <p className="text-2xs text-muted-foreground mt-1">энэ сард</p>
                                )}
                                {kpi.hint && <p className="text-2xs text-muted-foreground mt-0.5">{kpi.hint}</p>}
                            </div>
                        ))}
                        <div className="bg-surface px-4 py-4 col-span-2 md:col-span-1">
                            <p className="text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground/80">
                                Борлуулалт
                            </p>
                            <Money
                                value={summary.revenue}
                                compact
                                className="heading-display text-3xl text-foreground mt-1.5 block"
                            />
                            <DeltaLine value={summary.deltas.revenue} />
                        </div>
                    </div>

                    {/* Багийн зорилт — ring + тоонууд (Origin жишиг) */}
                    {data.target && targetPct !== null && (
                        <Card>
                            <CardContent className="flex items-center gap-5 py-4">
                                <ProgressRing
                                    value={targetPct}
                                    size={84}
                                    strokeWidth={8}
                                    tone={targetPct >= 100 ? 'success' : targetPct >= 60 ? 'brand' : 'pending'}
                                    aria-label={`Багийн зорилтын биелэлт ${targetPct}%`}
                                >
                                    <span className="heading-display text-lg tabular-nums">{targetPct}%</span>
                                </ProgressRing>
                                <div className="min-w-0">
                                    <p className="text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground/80">
                                        Багийн сарын зорилт
                                    </p>
                                    <p className="text-sm text-foreground mt-1">
                                        <Money value={data.target.teamActual} compact className="font-medium" /> /{' '}
                                        <Money value={data.target.teamTarget} compact className="text-muted-foreground" />
                                    </p>
                                    {data.target.myShare !== null && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Багийн гүйцэтгэлд {data.manager.isSelf ? 'миний' : `${data.manager.name}-ийн`} хувь:{' '}
                                            <span className="font-medium text-foreground">{data.target.myShare}%</span>
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Лидийн задаргаа */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-base">Лид — төлөвөөр</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {Object.keys(data.leadsByStatus || {}).length > 0 ? (
                                    <ul className="space-y-1.5">
                                        {Object.entries(data.leadsByStatus || {}).map(([status, count]) => (
                                            <li key={status} className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {LEAD_STATUS_LABELS[status] || status}
                                                </span>
                                                <span className="font-medium tabular-nums">{count}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Энэ сард шинэ лид байхгүй</p>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-base">Лид — эх үүсвэрээр</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {Object.keys(data.leadsBySource || {}).length > 0 ? (
                                    <ul className="space-y-1.5">
                                        {Object.entries(data.leadsBySource || {}).map(([source, count]) => (
                                            <li key={source} className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {LEAD_SOURCE_LABELS[source] || source}
                                                </span>
                                                <span className="font-medium tabular-nums">{count}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Энэ сард шинэ лид байхгүй</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Гэрээнүүд */}
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-base">
                                Байгуулсан гэрээнүүд{' '}
                                <span className="text-muted-foreground font-normal">
                                    ({(data.contracts || []).length})
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {(data.contracts || []).length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                                                <th className="px-4 md:px-6 py-2 font-medium">Гэрээний №</th>
                                                <th className="px-2 py-2 font-medium">Харилцагч</th>
                                                <th className="px-2 py-2 font-medium text-right">Дүн</th>
                                                <th className="px-4 md:px-6 py-2 font-medium text-right">Огноо</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {(data.contracts || []).map((c) => (
                                                <tr key={c.id}>
                                                    <td className="px-4 md:px-6 py-2.5">{c.contract_number || '—'}</td>
                                                    <td className="px-2 py-2.5">{c.customer_name || '—'}</td>
                                                    <td className="px-2 py-2.5 text-right">
                                                        <Money value={c.total_price ?? null} />
                                                    </td>
                                                    <td className="px-4 md:px-6 py-2.5 text-right text-muted-foreground tabular-nums">
                                                        {c.contract_date ? formatShortDate(c.contract_date) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="px-4 md:px-6 py-4 text-sm text-muted-foreground">
                                    Энэ сард байгуулсан гэрээ байхгүй
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Уулзалтууд */}
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-base">Уулзалтууд</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {Object.entries(data.viewingsByStatus || {}).map(([status, count]) => (
                                    <StatusPill
                                        key={status}
                                        variant={
                                            status === 'completed'
                                                ? 'success'
                                                : status === 'cancelled'
                                                  ? 'danger'
                                                  : status === 'no_show'
                                                    ? 'neutral'
                                                    : 'info'
                                        }
                                    >
                                        {VIEWING_STATUS_LABELS[status] || status}: {count}
                                    </StatusPill>
                                ))}
                                {Object.keys(data.viewingsByStatus || {}).length === 0 && (
                                    <p className="text-sm text-muted-foreground">Энэ сард уулзалт байхгүй</p>
                                )}
                            </div>
                            {(data.viewings || []).length > 0 && (
                                <ul className="space-y-1.5">
                                    {(data.viewings || []).slice(0, 12).map((v) => (
                                        <li key={v.id} className="flex justify-between gap-2 text-sm">
                                            <span className="truncate">
                                                {v.property_name || v.customer_name || 'Уулзалт'}
                                                {v.customer_name && v.property_name ? ` · ${v.customer_name}` : ''}
                                            </span>
                                            <span className="text-muted-foreground tabular-nums flex-shrink-0">
                                                {v.scheduled_at ? formatShortDate(v.scheduled_at) : ''}
                                            </span>
                                        </li>
                                    ))}
                                    {(data.viewings || []).length > 12 && (
                                        <li className="text-xs text-muted-foreground">
                                            … нийт {(data.viewings || []).length} уулзалт
                                        </li>
                                    )}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    {/* Хийсэн ажлууд (user_tasks) */}
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-base">
                                Хийсэн ажлууд{' '}
                                <span className="text-muted-foreground font-normal">
                                    ({(data.tasksDone || []).length})
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {(data.tasksDone || []).length > 0 ? (
                                <ul className="space-y-1.5">
                                    {(data.tasksDone || []).map((t) => (
                                        <li key={t.id} className="flex items-start gap-2 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0 mt-0.5" />
                                            <span className="min-w-0">
                                                {t.title}
                                                {t.completed_at && (
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {' '}
                                                        · {formatShortDate(t.completed_at)}
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <EmptyState
                                    icon={<FileBarChart className="w-7 h-7" />}
                                    title="Бүртгэсэн ажил алга"
                                    description="«Миний ажлууд» хуудсанд хийх ажлаа бүртгэвэл дууссан ажлууд энд автоматаар орно"
                                />
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
