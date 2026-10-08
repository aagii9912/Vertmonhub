'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, TrendingUp, Users, Check, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { formatMNT } from '@/lib/utils/currency';
import {
    emptyMonthlySales, MONTHLY_SALES_FIELDS, MONTHLY_SALES_LABELS, MonthlySalesMonthSchema,
    monthlySalesAttainment, monthlySalesPatches, parseMonthlySalesAmount, summarizeMonthlySales,
    type MonthlySalesField, type MonthlySalesMonth,
} from '@/lib/sales/monthly';

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super Admin', admin: 'Админ', marketing: 'Маркетинг', viewer: 'Харах эрх' };
const MONTHS = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];
const NO_MONTHS: number[] = Array(12).fill(0);

interface ManagerRow {
    name: string;
    is_active: boolean;
    user_id: string | null;
    year_actual: number;
    project_ids: string[];
}

interface SalesTargetsData {
    months: MonthlySalesMonth[];
    teamActual: number[];
    computedActualSource: string;
    managers: ManagerRow[];
    teamMembers: Array<{ id: string; full_name: string; role?: string | null }>;
    projects: Array<{ id: string; name: string }>;
}

const NO_MANAGERS: ManagerRow[] = [];
const NO_TEAM_MEMBERS: SalesTargetsData['teamMembers'] = [];
const NO_PROJECTS: SalesTargetsData['projects'] = [];
const NO_SHOPS: Array<{ id: string; name: string }> = [];
const NO_MONTHLY_SALES = emptyMonthlySales();
type MonthInputs = { month: number; revision: number } & Record<MonthlySalesField, string>;
type TargetDraft = { before: MonthlySalesMonth[]; inputs: MonthInputs[] };

function monthInputs(months: MonthlySalesMonth[]): MonthInputs[] {
    return months.map(row => ({ month: row.month, revision: row.revision,
        ...Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, row[field] === null ? '' : row[field].toLocaleString('en-US', { maximumFractionDigits: 2 })])),
    })) as MonthInputs[];
}
const pctLabel = (value: number | null) => value === null ? '—' : `${value}%`;

export default function SalesTargetsAdminPage() {
    const queryClient = useQueryClient();
    const { shop, user, shops: accessibleShops } = useAuth();
    const authScope = [shop?.id, user?.id, user?.role] as const;
    const [selectedShopId, setShopId] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());

    // Хадгалаагүй засварууд — серверийн өгөгдлийн дээр давхарлана (null бол серверийнхийг харуулна).
    const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);
    const [targetConflict, setTargetConflict] = useState(false);
    const [managersDraft, setManagersDraft] = useState<ManagerRow[] | null>(null);
    const [newManagerName, setNewManagerName] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    const [savingTarget, setSavingTarget] = useState(false);
    const [savingRoster, setSavingRoster] = useState(false);
    const saving = savingTarget || savingRoster;

    const nowYear = new Date().getFullYear();
    const yearOptions = [nowYear - 1, nowYear, nowYear + 1];

    // Shop жагсаалт
    const shopsQuery = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-shops', 'sales-targets', ...authScope],
        queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
            const res = await fetch('/api/admin/shops');
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Төслүүд ачаалагдсангүй');
            return d.shops || [];
        },
        enabled: !!user?.id,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const allowedShopIds = new Set(accessibleShops.map(row => row.id));
    const shops = (shopsQuery.data ?? NO_SHOPS).filter(row => allowedShopIds.has(row.id));
    // Анхдагч нь одоо ажиллаж буй төсөл (shop = төсөл).
    const shopId = selectedShopId || (shops.some((s) => s.id === shop?.id) ? shop!.id : shops[0]?.id) || '';

    const targetsQuery = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-sales-targets', shopId, year, ...authScope],
        queryFn: async (): Promise<SalesTargetsData> => {
            const res = await fetch(`/api/admin/sales-targets?shopId=${shopId}&year=${year}`);
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Төлөвлөгөө ачаалагдсангүй');
            const parsedMonths = MonthlySalesMonthSchema.array().length(12).safeParse(d.months);
            if (!parsedMonths.success) throw new Error('Сарын төлөвлөгөөний мэдээлэл дутуу байна. Дахин ачаална уу.');
            return {
                months: parsedMonths.data,
                teamActual: d.teamActual || Array(12).fill(0),
                computedActualSource: d.computedActualSource || 'CRM-ийн гэрээ · одоо идэвхтэй менежерүүдийн нийлбэр',
                managers: (d.managers || []).map((manager: ManagerRow) => ({ ...manager, project_ids: manager.project_ids || [] })),
                teamMembers: d.teamMembers || [],
                projects: d.projects || [],
            };
        },
        enabled: !!user?.id && !!shopId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const data = targetsQuery.data;

    // Компани эсвэл он солигдвол өмнөх хүрээний хадгалаагүй засварыг хаяна.
    const scopeKey = `${shopId}:${year}:${user?.id}:${user?.role}`;
    const [draftScope, setDraftScope] = useState(scopeKey);
    if (draftScope !== scopeKey) {
        setDraftScope(scopeKey);
        setTargetDraft(null);
        setTargetConflict(false);
        setManagersDraft(null);
    }

    const inputs = targetDraft?.inputs ?? monthInputs(data?.months ?? NO_MONTHLY_SALES);
    const invalidAmounts = inputs.some(row => MONTHLY_SALES_FIELDS.some(field => parseMonthlySalesAmount(row[field]) === undefined));
    const months = inputs.map(row => ({ month: row.month, revision: row.revision,
        ...Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, parseMonthlySalesAmount(row[field]) ?? null])),
    })) as MonthlySalesMonth[];
    const patches = targetDraft && !invalidAmounts ? monthlySalesPatches(targetDraft.before, months) : [];
    const summary = summarizeMonthlySales(months);
    const teamActual = data?.teamActual ?? NO_MONTHS;
    const managers = managersDraft ?? data?.managers ?? NO_MANAGERS;
    const teamMembers = data?.teamMembers ?? NO_TEAM_MEMBERS;
    const projects = data?.projects ?? NO_PROJECTS;

    const shopsError = shopsQuery.data
        ? (shops.length ? null : 'Хандах эрхтэй төсөл бүртгэгдээгүй байна')
        : shopsQuery.error?.message ?? null;
    // Өгөгдөл ачаалагдсан бол дэвсгэрт шинэчлэл унахад (toast) хадгалаагүй засварыг нуухгүй.
    const error = (!shopsQuery.isFetching && shopsError) || (!targetsQuery.data && !targetsQuery.isFetching && targetsQuery.error?.message) || null;
    const scopeReady = !!data && !error;

    function setMonth(month: number, field: MonthlySalesField, value: string) {
        if (!scopeReady || saving) return;
        setTargetDraft(previous => {
            const draft = previous ?? { before: data!.months, inputs: monthInputs(data!.months) };
            return { ...draft, inputs: draft.inputs.map(row => row.month === month ? { ...row, [field]: value } : row) };
        });
    }

    async function saveTarget() {
        if (!scopeReady || saving || invalidAmounts || !patches.length || targetConflict) return;
        setSavingTarget(true);
        try {
            const res = await fetch('/api/admin/sales-targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId, year, months: patches }),
            });
            const result = await res.json();
            if (!res.ok) {
                if (res.status === 409) setTargetConflict(true);
                throw new Error(result.error || 'Төлөвлөгөө, гүйцэтгэл хадгалагдсангүй');
            }
            const saved = new Map((result.months as MonthlySalesMonth[]).map(row => [row.month, row]));
            queryClient.setQueryData<SalesTargetsData>(['admin-sales-targets', shopId, year, ...authScope], current => current ? {
                ...current, months: current.months.map(row => saved.get(row.month) ?? row),
            } : current);
            setTargetDraft(null);
            await Promise.all(['admin-sales-targets', 'director', 'kpi-report', 'my-stats', 'operations-report', 'weekly-sales'].map(key =>
                queryClient.invalidateQueries({ queryKey: [key, shopId] })));
            toast.success('Төлөвлөгөө, гүйцэтгэл хадгалагдлаа');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Төлөвлөгөө, гүйцэтгэл хадгалагдсангүй');
        } finally {
            setSavingTarget(false);
        }
    }

    function toggleManager(name: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((m) => (m.name === name ? { ...m, is_active: !m.is_active } : m)));
    }

    function toggleManagerProject(name: string, projectId: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((manager) => manager.name !== name ? manager : {
            ...manager,
            project_ids: manager.project_ids.includes(projectId)
                ? manager.project_ids.filter((id) => id !== projectId)
                : [...manager.project_ids, projectId],
        }));
    }

    function unlinkManager(name: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((m) => (m.name === name ? { ...m, user_id: null } : m)));
    }

    /** Зөвхөн өөрчлөгдсөн мөрийг илгээнэ — хуучирсан цонх бусдын холбоос, төлөвийг дарахгүй. */
    async function persistRoster(list: ManagerRow[]) {
        const saved = new Map((data?.managers ?? []).map((m) => [m.name, m]));
        const changed = list.filter((m) => {
            const before = saved.get(m.name);
            return !before || before.is_active !== m.is_active || before.user_id !== m.user_id
                || before.project_ids.length !== m.project_ids.length || before.project_ids.some((id) => !m.project_ids.includes(id));
        });
        if (!changed.length) { setManagersDraft(null); return; }
        const res = await fetch('/api/admin/sales-targets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopId,
                    managers: changed.map((m) => ({ name: m.name, is_active: m.is_active, user_id: m.user_id, project_ids: m.project_ids })),
                }),
            });
        if (!res.ok) throw new Error((await res.json()).error || 'Менежерийн жагсаалт хадгалагдсангүй');
        await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['managers', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['director', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['kpi-report', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['my-stats', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['lead-projects', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['leads', 'list', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['leads', 'summary', shopId] }),
        ]);
        await targetsQuery.refetch();
        setManagersDraft(null);
    }

    async function saveRoster() {
        if (!scopeReady || saving) return;
        setSavingRoster(true);
        try {
            await persistRoster(managers);
            toast.success('Менежерийн жагсаалт хадгалагдлаа');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Менежерийн жагсаалт хадгалагдсангүй');
        } finally {
            setSavingRoster(false);
        }
    }

    // Шинэ борлуулалтын менежер нэмэх (ростерт шингээж шууд хадгална)
    async function addManager(name: string, userId: string | null) {
        if (!scopeReady || saving) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        // Хадгалаагүй өөрчлөлтийг нэмэлттэй хамт санамсаргүй хадгалахгүй.
        if (managersDraft) {
            toast.error('Хадгалаагүй өөрчлөлт байна. Эхлээд «Менежерийн бүртгэл хадгалах» дарна уу.');
            return;
        }
        const existing = managers.find((m) => m.name === trimmed);
        if (existing?.is_active && (!userId || existing.user_id === userId)) {
            setNewManagerName('');
            toast.info(`${trimmed} аль хэдийн идэвхтэй менежер байна`);
            return;
        }
        // Нэг төсөлтэй бол сервер тухайн төслийг автоматаар онооно.
        const next = existing
            ? managers.map((m) => (m.name === trimmed ? { ...m, is_active: true, user_id: userId ?? m.user_id } : m))
            : [
                ...managers,
                { name: trimmed, is_active: true, user_id: userId, year_actual: 0, project_ids: projects.length === 1 ? [projects[0].id] : [] },
            ].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
        const previousDraft = managersDraft;
        setManagersDraft(next);
        setNewManagerName('');
        setSavingRoster(true);
        try {
            await persistRoster(next);
            toast.success(existing ? 'Менежер дахин идэвхжлээ' : 'Менежер нэмэгдлээ');
        } catch (cause) {
            setManagersDraft(previousDraft);
            setNewManagerName(trimmed);
            toast.error(cause instanceof Error ? cause.message : 'Менежер нэмэгдсэнгүй');
        } finally {
            setSavingRoster(false);
        }
    }

    const computedYearActual = teamActual.reduce((total, amount) => total + amount, 0);
    const activeCount = managers.filter((m) => m.is_active).length;
    const visibleManagers = showInactive ? managers : managers.filter((m) => m.is_active);
    const inactiveCount = managers.length - activeCount;

    // Жагсаалтад ороогүй акаунттай гишүүд (шууд менежер болгож нэмэх)
    const unlistedMembers = teamMembers.filter(
        (t) => !managers.some((m) => m.name === t.full_name || (m.user_id && m.user_id === t.id)),
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Борлуулалтын төлөвлөгөө"
                subtitle="Гэрээ, тухайн сард орсон мөнгөний төлөвлөгөө ба гараар оруулах гүйцэтгэл."
            />

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <Select value={shopId} onValueChange={setShopId} disabled={saving}>
                    <SelectTrigger className="h-9 w-56 text-sm" aria-label="Төсөл сонгох">
                        <SelectValue placeholder="Төсөл сонгох" />
                    </SelectTrigger>
                    <SelectContent>
                        {shops.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} disabled={saving}>
                    <SelectTrigger className="h-9 w-28 text-sm" aria-label="Он сонгох">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {yearOptions.map((y) => (
                            <SelectItem key={y} value={String(y)}>{y} он</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error ? (
                <div role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">
                    {error} <button onClick={() => void (shopsError ? shopsQuery.refetch() : targetsQuery.refetch())} className="ml-2 font-semibold underline">Дахин ачаалах</button>
                </div>
            ) : !scopeReady ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-strong" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* A) Багийн сарын төлөвлөгөө */}
                    <Card>
                        <CardContent className="space-y-4 py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Сарын төлөвлөгөө, гүйцэтгэл</p>
                                    <p className="text-xs text-muted-foreground">{year} он · дүнг ₮-ээр оруулна · хоосон нүд = оруулаагүй</p>
                                </div>
                                <TrendingUp className="h-4 w-4 text-brand-strong" />
                            </div>

                            <p className="text-xs text-muted-foreground">Орсон мөнгө нь тухайн сард хүлээн авсан урьдчилгаа, төлбөрийн дүн. Гүйцэтгэлийг гараар нөхөж бичнэ.</p>
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full min-w-[900px] text-sm">
                                    <caption className="sr-only">{year} оны сарын гэрээ, орсон мөнгөний төлөвлөгөө ба гар гүйцэтгэл</caption>
                                    <thead className="bg-surface-2 text-xs text-muted-foreground">
                                        <tr className="border-b border-border">
                                            <th rowSpan={2} scope="col" className="px-3 py-3 text-left">Сар</th>
                                            <th colSpan={2} scope="colgroup" className="px-3 py-2 text-center text-gold">Төлөвлөгөө</th>
                                            <th colSpan={2} scope="colgroup" className="px-3 py-2 text-center">Гүйцэтгэл · гараар</th>
                                            <th colSpan={2} scope="colgroup" className="px-3 py-2 text-center">Биелэлт</th>
                                        </tr>
                                        <tr className="border-b border-border">
                                            {['Гэрээний дүн', 'Орсон мөнгө', 'Гэрээний дүн', 'Орсон мөнгө', 'Гэрээ', 'Мөнгө'].map((label, index) => (
                                                <th key={index} scope="col" className="px-3 py-2 text-right font-medium">{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inputs.map((row, index) => (
                                            <tr key={row.month} className="border-b border-border last:border-b-0">
                                                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{MONTHS[row.month - 1]} сар</th>
                                                {MONTHLY_SALES_FIELDS.map(field => {
                                                    const invalid = parseMonthlySalesAmount(row[field]) === undefined;
                                                    return <td key={field} className="px-2 py-2">
                                                        <input
                                                            type="text" inputMode="decimal"
                                                            aria-label={`${year} оны ${MONTHS[row.month - 1]} сар ${MONTHLY_SALES_LABELS[field]}`}
                                                            aria-invalid={invalid}
                                                            disabled={saving}
                                                            value={row[field]}
                                                            onChange={event => setMonth(row.month, field, event.target.value)}
                                                            placeholder="—"
                                                            className={`num w-full min-w-28 rounded-md border bg-surface-2 px-2 py-2 text-right text-sm text-foreground ${invalid ? 'border-status-danger' : 'border-control'}`}
                                                        />
                                                    </td>;
                                                })}
                                                <td className="num px-3 py-2 text-right">{pctLabel(monthlySalesAttainment(months[index].manual_contract_actual_amount, months[index].target_amount))}</td>
                                                <td className="num px-3 py-2 text-right">{pctLabel(monthlySalesAttainment(months[index].manual_cashflow_actual_amount, months[index].cashflow_target_amount))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t border-border bg-surface-2">
                                        <tr>
                                            <th scope="row" className="px-3 py-3 text-left">Оруулсан нийт</th>
                                            {MONTHLY_SALES_FIELDS.map(field => (
                                                <td key={field} className="num px-3 py-3 text-right">
                                                    <span className="font-semibold">{summary.totals[field].amount === null ? '—' : formatMNT(summary.totals[field].amount)}</span>
                                                    <span className="mt-1 block text-xs text-muted-foreground">{summary.totals[field].filledMonths}/12 сар</span>
                                                </td>
                                            ))}
                                            <td className="num px-3 py-3 text-right font-semibold">{pctLabel(summary.contractAttainmentPct)}</td>
                                            <td className="num px-3 py-3 text-right font-semibold">{pctLabel(summary.cashflowAttainmentPct)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground">Нийт дүн нь бөглөсөн саруудын нийлбэр. Биелэлтийг төлөвлөгөө, гүйцэтгэл нь ижил саруудаар бөглөгдсөн үед тооцно.</p>
                            {invalidAmounts && <p role="alert" className="text-xs text-status-danger">Дүнг 0–10,000,000,000,000₮ хооронд, хамгийн ихдээ хоёр орны бутархайтай оруулна уу.</p>}
                            {targetConflict && (
                                <div role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning-soft p-3 text-sm">
                                    <p>Өөр хэрэглэгч сарын мэдээллийг өөрчилсөн. Таны засвар хадгалагдаагүй.</p>
                                    <button type="button" disabled={saving} onClick={async () => {
                                        const refreshed = await targetsQuery.refetch();
                                        if (refreshed.error) { toast.error('Шинэ мэдээлэл ачаалагдсангүй'); return; }
                                        setTargetDraft(null); setTargetConflict(false);
                                    }} className="mt-2 font-medium text-brand-strong underline">Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх</button>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button onClick={saveTarget} disabled={!scopeReady || saving || invalidAmounts || !patches.length || targetConflict} isLoading={savingTarget} variant="primary" size="sm">
                                    {!savingTarget && <Save className="h-4 w-4" />} Төлөвлөгөө, гүйцэтгэл хадгалах
                                </Button>
                            </div>
                            <details className="rounded-lg border border-border px-3 py-2">
                                <summary className="cursor-pointer text-sm font-medium">CRM-ээр тооцсон гэрээний дүн · {formatMNT(computedYearActual)}</summary>
                                <p className="mt-2 text-xs text-muted-foreground">{data?.computedActualSource}. Энэ дүнг дээрх гар гүйцэтгэлд нэмж нийлбэрлэхгүй.</p>
                                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                                    {teamActual.map((amount, index) => <p key={index} className="num rounded-md bg-surface-2 p-2">{MONTHS[index]} сар: {formatMNT(amount)}</p>)}
                                </div>
                            </details>
                        </CardContent>
                    </Card>

                    {/* B) Идэвхтэй менежерүүд */}
                    <Card>
                        <CardContent className="space-y-3 py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                        <Users className="h-4 w-4 text-brand-strong" /> Идэвхтэй менежерүүд
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {activeCount} идэвхтэй · багийн гүйцэтгэл эдгээрийн нийлбэр
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {projects.length === 1
                                            ? `Энд нэмсэн менежер «${projects[0].name}» төслийн өөрт хуваарилсан лидийг хариуцна. Өөр төсөлд нэмэхдээ дээрээс төслөө сонгоно уу.`
                                            : 'Менежер зөвхөн сонгосон төслийн лидийг хариуцна. Нэг менежерт олон төсөл сонгож болно.'}
                                    </p>
                                </div>
                            </div>

                            {visibleManagers.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Идэвхтэй менежер байхгүй
                                </p>
                            ) : (
                                <div className="max-h-[32rem] space-y-2 overflow-y-auto">
                                    {visibleManagers.map((m) => (
                                        <div key={m.name} className="rounded-lg border border-border">
                                        <button
                                            type="button"
                                            aria-pressed={m.is_active}
                                            onClick={() => toggleManager(m.name)}
                                            disabled={!scopeReady || saving}
                                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                                m.is_active
                                                    ? 'border-brand/40 bg-brand-soft/30'
                                                    : 'border-border bg-surface-2 opacity-60'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                                    m.is_active ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface'
                                                }`}>
                                                    {m.is_active && <Check className="h-3.5 w-3.5" />}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                                                    <p className="text-2xs text-muted-foreground">
                                                        {year} борлуулалт: {m.year_actual > 0 ? formatMNT(m.year_actual, { compact: true }) : '—'}
                                                        {m.user_id && ' · акаунттай'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-2xs font-medium ${m.is_active ? 'text-brand-strong' : 'text-muted-foreground'}`}>
                                                {m.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
                                            </span>
                                        </button>
                                        {m.user_id && <div className="flex justify-end px-3 pt-2">
                                            <button type="button" onClick={() => unlinkManager(m.name)} disabled={!scopeReady || saving}
                                                className="text-2xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
                                                Акаунтын холбоос салгах
                                            </button>
                                        </div>}
                                        {projects.length !== 1 && <fieldset disabled={!scopeReady || saving} className="space-y-2 px-3 pb-3 pt-2">
                                            <legend className="sr-only">{m.name} — төслийн харьяалал</legend>
                                            <p className="text-2xs text-muted-foreground">
                                                {m.project_ids.length ? 'Төслийн харьяалал' : 'Төсөл сонгоогүй — төслийн лид хариуцах эрхгүй'}
                                            </p>
                                            {projects.length ? (
                                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                                    {projects.map((project) => (
                                                        <label key={project.id} className="inline-flex min-h-7 items-center gap-2 text-xs text-foreground">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`${m.name}: ${project.name}`}
                                                                checked={m.project_ids.includes(project.id)}
                                                                onChange={() => toggleManagerProject(m.name, project.id)}
                                                                className="h-4 w-4 accent-brand"
                                                            />
                                                            {project.name}
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : <p className="text-xs text-muted-foreground">Энэ ажлын орчинд төсөл бүртгэгдээгүй байна.</p>}
                                        </fieldset>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {inactiveCount > 0 && (
                                <button
                                    type="button"
                                    aria-expanded={showInactive}
                                    onClick={() => setShowInactive((value) => !value)}
                                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                    {showInactive ? 'Идэвхгүй менежерүүдийг нуух' : `Идэвхгүй менежерүүдийг харах (${inactiveCount})`}
                                </button>
                            )}

                            {/* Шинэ борлуулалтын менежер нэмэх */}
                            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                                <p className="text-xs font-medium text-muted-foreground">Шинэ менежер нэмэх</p>
                                <p className="text-2xs text-muted-foreground">Акаунттай ажилтныг товчоор сонговол түүний акаунт холбогдоно. Энэ жагсаалтад гарахын тулд ажилтан энэ төсөлд гишүүн байх ёстой («Хэрэглэгчид» → төсөл нэмэх).</p>
                                {unlistedMembers.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {unlistedMembers.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => addManager(t.full_name, t.id)}
                                                disabled={!scopeReady || saving}
                                                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground hover:border-brand hover:text-brand-strong disabled:opacity-50"
                                            >
                                                <Plus className="h-3 w-3" /> {t.full_name}
                                                {t.role && t.role !== 'sales_manager' && <span className="text-muted-foreground">· {ROLE_LABEL[t.role] || t.role}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        disabled={savingRoster}
                                        value={newManagerName}
                                        onChange={(e) => setNewManagerName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') addManager(newManagerName, null); }}
                                        placeholder="Менежерийн нэр бичих..."
                                        className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                    />
                                    <Button
                                        onClick={() => addManager(newManagerName, null)}
                                        isLoading={savingRoster}
                                        variant="secondary"
                                        size="sm"
                                        disabled={!newManagerName.trim() || !scopeReady || saving}
                                    >
                                        {!savingRoster && <Plus className="h-4 w-4" />} Нэмэх
                                    </Button>
                                </div>
                            </div>

                            {managers.length > 0 && (
                                <div className="flex justify-end">
                                    <Button onClick={saveRoster} disabled={!scopeReady || saving} isLoading={savingRoster} variant="secondary" size="sm">
                                        {!savingRoster && <Save className="h-4 w-4" />} Менежерийн бүртгэл хадгалах
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
