'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarX2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, FilePlus2, FileUp, FileX2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { formatShortDate } from '@/lib/utils/date';
import { useContractsList, type ContractRow, type ContractStats } from '@/hooks/useContracts';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { CONTRACT_STATUS_META } from '@/lib/contracts/labels';
import {
    CONTRACT_LIST_COLUMNS, HUB_STATUS_LABEL, HUB_TYPE_LABEL, contractListNames, contractListPricePerSqm, contractUnitNumber, hubFloor,
    isDerivedPricePerSqm, type ContractListColumn,
} from '@/lib/contracts/list-format';
import { useManagers } from '@/hooks/useLeads';
import { Avatar, Pill, Progress, Skeleton } from '@/components/dashboard/v2/primitives';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterChip } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';
import { dashboardDownload } from '@/lib/api/dashboardFetch';

/**
 * «Гэрээнүүд» — ERP-ийн HUB загвар (16 багана, файлтай ижил дараалал) ба «Төлбөр, менежер» харагдац.
 * Статистик нь төслийн бүх гэрээ (цуцалсныг мөнгөн дүнд оруулахгүй), хүснэгтийн хөл нь шүүсэн гэрээний нийлбэр.
 * Серверийн хуудаслалт; мөр дарахад бүтэн дэлгэрэнгүй хуудас (/dashboard/contracts/[id]).
 * `?filter=overdue|undated|not-in-latest` — мэдэгдэл, тайлангийн холбоосоос шүүлттэй нээгдэнэ.
 */

const VIEW_KEY = 'vh-contracts-view';
type View = 'hub' | 'payments';
const PAGE_SIZES = [25, 50, 100, 200] as const;
const DEFAULT_SORT = 'contract_date';
/** Текст баганыг А→Я, тоо/огноог их → бага эхэлж эрэмбэлнэ. */
const ASC_FIRST = new Set(['customer_name', 'customer_first_name', 'customer_last_name', 'product_type', 'block_name', 'unit_label', 'floor', 'model', 'prepayment_condition', 'payment_condition', 'contract_status']);

/** HUB баганын өргөн (px, 13px текстэд 16 багана ≈ 1536px), эрэмбийн багана, тоо эсэх. Сүүлийн багана үлдсэн өргөнийг авна. */
const HUB_COLUMN_META: Record<ContractListColumn, { width?: number; sort: string; numeric?: boolean; sticky?: number; title?: string }> = {
    'Төрөл': { width: 88, sort: 'product_type', sticky: 0 },
    'Блок': { width: 56, sort: 'block_name', sticky: 88 },
    'Тоот': { width: 64, sort: 'unit_label', sticky: 144 },
    'Давхар': { width: 60, sort: 'floor' },
    'Загвар': { width: 96, sort: 'model' },
    'Гэрээлсэн талбай': { width: 76, sort: 'contracted_area', numeric: true, title: 'м²' },
    'Урьдчилгааны нөхцөл': { width: 104, sort: 'prepayment_condition' },
    'М.кв үнэ': { width: 96, sort: 'price_per_sqm', numeric: true },
    'Нийт дүн': { width: 112, sort: 'total_price', numeric: true },
    'Урьдчилгааны дүн': { width: 112, sort: 'prepayment_due', numeric: true, title: 'Нөхцлөөр төлөх ёстой дүн — орсон мөнгө биш' },
    'Төлбөр хоцролт': { width: 112, sort: 'overdue_amount', numeric: true, title: 'HUB файлын огноогоор' },
    'Захиалга өгсөн огноо': { width: 104, sort: 'contract_date' },
    'Төлөв': { width: 112, sort: 'contract_status' },
    'Нэр': { width: 128, sort: 'customer_first_name' },
    'Овог': { width: 128, sort: 'customer_last_name' },
    'Захиалгын нөхцөл': { sort: 'payment_condition' },
};
const HUB_TABLE_MIN_WIDTH = 1536;
const OVERDUE_DAYS_RULE = 'Системийн тооцоо: гэрээний огнооноос 90 хоногийн дараа үлдэгдэлтэй бол хоцорсон хоног тоологдоно. ₮ дүн HUB файлаас орно.';

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};
/** HUB нүдний мөнгө: ₮-гүй, бүхэл (файлын `#,##0` формат). */
const money = (value: unknown) => {
    const n = toNumber(value);
    return n === null ? null : Math.round(n).toLocaleString('en-US');
};
const area = (value: unknown) => {
    const n = toNumber(value);
    return n === null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const statusTone = (status: string | null | undefined) => (status && CONTRACT_STATUS_META[status]?.tone) || 'neutral';
const hubStatusLabel = (status: string | null | undefined) =>
    status && Object.hasOwn(HUB_STATUS_LABEL, status) ? HUB_STATUS_LABEL[status as keyof typeof HUB_STATUS_LABEL] : status || '—';

export function ContractsPage() {
    const search = useSearchParams();
    const filter = search.get('filter');
    // Мэдэгдлээс өөр шүүлттэй холбоос нээгдвэл хуудсыг шинэ шүүлтээр эхлүүлнэ.
    return <ContractsWorkspace key={filter ?? ''} initialFilter={filter} />;
}

function ContractsWorkspace({ initialFilter }: { initialFilter: string | null }) {
    const router = useRouter();
    const { canWrite } = useModuleAccess();
    const { data: mode } = useDashboardMode();
    const canCreate = canWrite('contracts');
    // Импорт RPC нь гэрээ ба ERP импортын бичих эрхтэй, хувийн горимгүй (хязгааргүй) удирдлагад — горим ачаалж
    // байх эсвэл уншиж чадаагүй үед нууна (сервер дахин шалгана).
    const canImport = canWrite('contracts') && canWrite('erp-imports') && mode?.isManager === false;
    // Багийн төлөвлөгөө: super_admin эсвэл `reports` эрхтэй, хязгаарлагдаагүй (хувийн горимгүй) хэрэглэгч — серверийн дүрэм.
    const canSeePlan = !!mode?.canViewTeam;
    const [view, setView] = useState<View>('hub');
    const [exporting, setExporting] = useState(false);
    const [status, setStatus] = useState('all');
    const [manager, setManager] = useState('all');
    const [productType, setProductType] = useState('all');
    const [block, setBlock] = useState('all');
    const [paymentCondition, setPaymentCondition] = useState('all');
    const [overdue, setOverdue] = useState(initialFilter === 'overdue');
    const [undated, setUndated] = useState(initialFilter === 'undated');
    const [notInLatest, setNotInLatest] = useState(initialFilter === 'not-in-latest');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [qInput, setQInput] = useState('');
    const [q, setQ] = useState('');
    const [sortBy, setSortBy] = useState(DEFAULT_SORT);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

    // Хадгалсан харагдац (хэрэглэгч бүрийн хөтөчид; хадгалах боломжгүй бол HUB).
    useEffect(() => {
        try {
            const saved = localStorage.getItem(VIEW_KEY);
            if (saved === 'hub' || saved === 'payments') setView(saved);
        } catch { /* алгасна */ }
    }, []);
    const changeView = (next: View) => {
        setView(next);
        try { localStorage.setItem(VIEW_KEY, next); } catch { /* алгасна */ }
    };

    useEffect(() => {
        const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [qInput]);

    const params = useMemo(() => ({
        search: q, status, manager, productType, block, paymentCondition, overdue, undated, notInLatest,
        from: from || undefined, to: to || undefined, sortBy, sortOrder, page, pageSize,
    }), [q, status, manager, productType, block, paymentCondition, overdue, undated, notInLatest, from, to, sortBy, sortOrder, page, pageSize]);
    const { data, isLoading, isFetching, error, refetch } = useContractsList(params);
    const { data: managers = [] } = useManagers();

    const rows = data?.contracts ?? [];
    const stats = error ? undefined : data?.stats;
    const footer = error ? undefined : data?.footer;
    const latestImport = data?.latestImport ?? null;
    const facets = data?.facets;
    const total = data?.pagination?.total ?? 0;
    const totalPages = data?.pagination?.totalPages ?? 1;
    const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const toRow = Math.min(page * pageSize, total);

    const withReset = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
    const filtered = status !== 'all' || manager !== 'all' || productType !== 'all' || block !== 'all' || paymentCondition !== 'all'
        || overdue || undated || notInLatest || !!from || !!to || !!qInput;
    const clearFilters = () => {
        setStatus('all'); setManager('all'); setProductType('all'); setBlock('all'); setPaymentCondition('all');
        setOverdue(false); setUndated(false); setNotInLatest(false); setFrom(''); setTo(''); setQInput(''); setQ(''); setPage(1);
    };
    const toggleSort = (key: string) => {
        if (sortBy === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortBy(key); setSortOrder(ASC_FIRST.has(key) ? 'asc' : 'desc'); }
        setPage(1);
    };
    async function download(type: 'contracts_hub' | 'contracts') {
        setExporting(true);
        // Файлын нэрийг сервер өгнө: «<Төсөл>_гэрээ_<огноо>.xlsx».
        try { await dashboardDownload(`/api/dashboard/export/excel?type=${type}`); }
        catch (e) { toast.error(e instanceof Error ? e.message : 'Файл татаж чадсангүй.'); }
        finally { setExporting(false); }
    }
    const open = (id: string) => router.push(`/dashboard/contracts/${id}`);

    const typeOptions: [string, string][] = (facets?.productTypes.length ? facets.productTypes : Object.keys(HUB_TYPE_LABEL))
        .map((key) => [key, HUB_TYPE_LABEL[key] ?? key]);
    const statusOptions: [string, string][] = Object.keys(CONTRACT_STATUS_META)
        .map((key) => [key, view === 'hub' ? hubStatusLabel(key) : CONTRACT_STATUS_META[key].label]);

    return (
        <div className="flex w-full min-w-0 flex-col gap-5">
            <PageHeader title="Гэрээнүүд" subtitle="ERP-ийн HUB загвараар" className="mb-0"
                primaryAction={canCreate && <Button href="/dashboard/contracts/generate"><FilePlus2 />Гэрээ үүсгэх</Button>}
                secondaryActions={<>
                    {canImport && <Button variant="secondary" href="/dashboard/contracts/import"><FileUp />Excel импорт</Button>}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" isLoading={exporting} title="Төслийн бүх гэрээг татна"><Download />Excel татах<ChevronDown className="size-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void download('contracts_hub')}>HUB загвар (16 багана)</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void download('contracts')}>Дэлгэрэнгүй (төлбөр, менежер, шилжүүлэг)</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>} />

            {(latestImport || canSeePlan) && (
                <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {latestImport && <p>
                        Сүүлийн HUB файл: <span className="num text-fg-2">{latestImport.report_date}</span> · <span className="num">{latestImport.row_count}</span> мөр
                        {!!latestImport.not_in_file && <> · <span className="num">{latestImport.not_in_file}</span> гэрээ файлд байхгүй</>}
                    </p>}
                    {canSeePlan && <Link href="/dashboard/reports/plan" className="ml-auto inline-flex items-center gap-1 font-medium text-brand-strong hover:underline"><Target className="size-3.5" />Төлөвлөгөөний биелэлт<ChevronRight className="size-3.5" /></Link>}
                </div>
            )}

            <ContractTiles stats={stats} loading={isLoading} />

            <FilterBar className="mb-0" search={{ value: qInput, onChange: setQInput, label: 'Гэрээ хайх', placeholder: 'Тоот, нэр, утас, гэрээ…' }}
                showClear={filtered} onClear={clearFilters}>
                <FilterChip value={productType} onChange={withReset(setProductType)} label="Төрөл" options={typeOptions} />
                {((facets?.blocks.length ?? 0) > 1 || block !== 'all') && <FilterChip value={block} onChange={withReset(setBlock)} label="Блок" options={(facets?.blocks ?? [block]).map((b) => [b, b])} />}
                <FilterChip value={status} onChange={withReset(setStatus)} label="Төлөв" options={statusOptions} />
                {((facets?.paymentConditions.length ?? 0) > 0 || paymentCondition !== 'all') && <FilterChip value={paymentCondition} onChange={withReset(setPaymentCondition)} label="Захиалгын нөхцөл" options={(facets?.paymentConditions ?? [paymentCondition]).map((c) => [c, c])} />}
                {managers.length > 0 && <FilterChip value={manager} onChange={withReset(setManager)} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
                <Toggle pressed={overdue} onChange={withReset(setOverdue)} tone="danger"><AlertCircle className="size-4" />Хоцролттой</Toggle>
                {latestImport && <Toggle pressed={notInLatest} onChange={withReset(setNotInLatest)}><FileX2 className="size-4" />Сүүлийн файлд байхгүй</Toggle>}
                {undated && <Toggle pressed={undated} onChange={withReset(setUndated)}><CalendarX2 className="size-4" />Огноогүй</Toggle>}
                <span title="Захиалга өгсөн огноо" className={cn('inline-flex h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs md:h-9', from || to ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border bg-surface text-fg-2')}>
                    <span className="whitespace-nowrap">Огноо</span>
                    <input type="date" value={from} max={to || undefined} onChange={(e) => withReset(setFrom)(e.target.value)} aria-label="Захиалга өгсөн огноо — эхлэх" className="num h-7 rounded-md border border-control bg-surface px-1.5 text-xs text-foreground" />
                    <span aria-hidden>–</span>
                    <input type="date" value={to} min={from || undefined} onChange={(e) => withReset(setTo)(e.target.value)} aria-label="Захиалга өгсөн огноо — дуусах" className="num h-7 rounded-md border border-control bg-surface px-1.5 text-xs text-foreground" />
                </span>
            </FilterBar>

            <div className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="Харагдац" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface-2 p-1">
                    {([['hub', 'HUB загвар'], ['payments', 'Төлбөр, менежер']] as const).map(([key, label]) => (
                        <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)}
                            className={cn('h-8 rounded-md px-3 text-[13px] font-medium focus-ring', view === key ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:text-foreground')}>
                            {label}
                        </button>
                    ))}
                </div>
                <p className="ml-auto text-xs text-muted-foreground">{view === 'hub' ? 'Дүн ₮-өөр, талбай м²-ээр. ' : ''}Хөлийн нийлбэрт цуцалсан гэрээ орохгүй.</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {error ? <div role="alert" className="space-y-3 p-6 text-sm">
                    <p className="font-medium text-status-danger">Гэрээнүүдийг уншиж чадсангүй.</p><p className="text-muted-foreground">Жагсаалт хоосон гэсэн үг биш. Дахин оролдоно уу.</p>
                    <Button variant="secondary" onClick={() => void refetch()}>Дахин оролдох</Button>
                </div> : (
                    <div className="max-h-[calc(100dvh-20rem)] overflow-auto">
                        {view === 'hub'
                            ? <HubTable rows={rows} footer={footer} total={total} latestImportDate={latestImport?.report_date ?? null} loading={isLoading} fetching={isFetching} sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} onOpen={open} />
                            : <PaymentsTable rows={rows} footer={footer} total={total} loading={isLoading} fetching={isFetching} sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} onOpen={open} />}
                    </div>
                )}
                <div className={cn('flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground', error && 'hidden')}>
                    <span className="num">{fromRow}–{toRow} / {total}</span>
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Өмнөх"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Дараах"><ChevronRight className="h-4 w-4" /></button>
                    <label className="ml-auto flex items-center gap-2">
                        Хуудсанд
                        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="num h-8 rounded-md border border-control bg-surface px-2 text-xs text-foreground">
                            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                        </select>
                    </label>
                </div>
            </div>
        </div>
    );
}

/** Статистикийн мөр: төслийн бүх гэрээ (шүүлтгүй). Төлсөн дүн мэдэгдэх гэрээтэй үед л төлөлт, үлдэгдлийн карт. */
function ContractTiles({ stats, loading }: { stats?: ContractStats; loading: boolean }) {
    const placeholder = loading ? null : '—';
    const cancelled = stats?.cancelled ?? 0;
    const live = stats ? stats.total - cancelled : 0;
    // ERP-ийн экспортоос үүссэн гэрээнд төлсөн дүн байхгүй: 0₮ гэж харуулахгүй.
    const unknownPaid = stats?.unknown_paid ?? 0;
    const showPaid = !!stats && unknownPaid < live;
    const paidNote = unknownPaid > 0 ? `${unknownPaid} гэрээний төлсөн дүн тодорхойгүй (ERP)` : undefined;
    const overdueAmount = stats?.overdue_amount ?? null;
    const overdueDays = stats?.overdue_days_count ?? 0;
    const stale = stats?.overdue_stale ?? 0;
    const staleNote = stale ? `${stale} гэрээний хоцролт өмнөх файлынх` : null;
    // Сүүлийн файлд ₮ дүнгүй ч өмнөх файлын дүн байвал «Бүртгээгүй» гэж нуухгүй.
    const overdueSub = !stats ? undefined
        : overdueAmount !== null
            ? [`${stats.overdue_count} гэрээ`, stats.overdue_as_of ? `${stats.overdue_as_of}-ны файлаар` : null, staleNote].filter(Boolean).join(' · ')
            : [overdueDays > 0 ? `₮ дүн бүртгээгүй · ${overdueDays} гэрээ хоногоор хоцорсон*` : 'Бүртгээгүй', staleNote].filter(Boolean).join(' · ');

    return (<>
        <StatBar className="mb-0" columns={showPaid ? 3 : 4}>
            <Kpi label="Нийт гэрээ" value={stats ? String(stats.total) : placeholder}
                sub={stats ? [`${stats.active} идэвхтэй`, `${stats.closed} хаагдсан`, `${cancelled} цуцалсан`, stats.transferred ? `${stats.transferred} тоот шилжсэн` : null].filter(Boolean).join(' · ') : undefined} />
            <Kpi label="Нийт дүн" value={stats ? formatMNTShort(stats.total_sales) : placeholder} sub={cancelled ? `Цуцалсан ${cancelled} гэрээ хассан` : undefined} />
            <Kpi label="Төлөх урьдчилгаа" value={stats ? formatMNTShort(stats.prepayment_due) : placeholder} sub="Гэрээний нөхцлөөр · орсон мөнгө биш" />
            <Kpi label="Төлбөр хоцролт" value={stats ? formatMNTShort(overdueAmount) : placeholder} sub={overdueSub}
                tone={overdueAmount !== null && overdueAmount > 0 ? 'danger' : undefined} title={overdueAmount === null && overdueDays > 0 ? OVERDUE_DAYS_RULE : undefined} />
            {showPaid && <>
                <Kpi label="Гэрээнд бүртгэсэн төлөлт" value={formatMNTShort(stats.total_paid)}
                    sub={paidNote ?? (stats.total_sales > 0 ? `${Math.round((stats.total_paid / stats.total_sales) * 100)}%` : undefined)} />
                <Kpi label="Үлдэгдэл" value={formatMNTShort(stats.total_balance)} sub={paidNote} />
            </>}
        </StatBar>
        {showPaid && <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">Төлөлт, үлдэгдлийг гэрээний бүртгэлээс харуулав. Энэ нь тухайн сарын мөнгөн орлогын тайлан биш.</p>}
    </>);
}

function Kpi({ label, value, sub, tone, title }: { label: string; value: string | null; sub?: string; tone?: 'danger'; title?: string }) {
    return <StatTile label={label} value={value === null ? <Skeleton className="h-8 w-24" /> : <span className={tone === 'danger' ? 'text-status-danger' : undefined}>{value}</span>}
        helper={sub && <span title={title} className={tone === 'danger' ? 'font-medium text-status-danger' : undefined}>{sub}</span>} />;
}

function Toggle({ pressed, onChange, tone, children }: { pressed: boolean; onChange: (value: boolean) => void; tone?: 'danger'; children: React.ReactNode }) {
    const on = tone === 'danger' ? 'border-status-danger bg-status-danger-soft text-status-danger' : 'border-brand bg-brand-soft text-brand-strong';
    return <button type="button" aria-pressed={pressed} onClick={() => onChange(!pressed)}
        className={cn('inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-xs focus-ring md:h-9', pressed ? on : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>{children}</button>;
}

interface TableProps {
    rows: ContractRow[];
    footer?: ContractStats;
    total: number;
    loading: boolean;
    fetching: boolean;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onSort: (key: string) => void;
    onOpen: (id: string) => void;
}

/** Мөр бүр дэлгэрэнгүй рүү (гар, хулганаар). Наалттай нүд тунгалаг биш тул hover-ыг нүд бүрт өгнө. */
function RowLink({ id, onOpen, fetching, children }: { id: string; onOpen: (id: string) => void; fetching: boolean; children: React.ReactNode }) {
    return (
        <tr role="button" tabIndex={0} onClick={() => onOpen(id)}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); }
            }}
            className={cn('h-10 cursor-pointer focus-ring [&>td]:border-b [&>td]:border-border [&>td]:bg-surface [&>td]:transition-colors hover:[&>td]:bg-surface-2', fetching && 'opacity-90')}>
            {children}
        </tr>
    );
}

const Muted = ({ children = '—', title }: { children?: React.ReactNode; title?: string }) => <span className="text-muted-foreground" title={title}>{children}</span>;

function SortHeader({ label, sortKey, sortBy, sortOrder, onSort, right, title }: { label: string; sortKey: string; sortBy: string; sortOrder: 'asc' | 'desc'; onSort: (key: string) => void; right?: boolean; title?: string }) {
    const active = sortBy === sortKey;
    return (
        <button type="button" onClick={() => onSort(sortKey)} title={title}
            className={cn('inline-flex max-w-full items-end gap-1 text-left leading-tight hover:text-foreground focus-ring', right && 'flex-row-reverse text-right', active && 'text-foreground')}>
            <span className="line-clamp-2">{label}</span>
            {active && (sortOrder === 'asc' ? <ChevronUp className="mb-0.5 size-3 shrink-0" /> : <ChevronDown className="mb-0.5 size-3 shrink-0" />)}
        </button>
    );
}

const stickyStyle = (left: number | undefined) => (left === undefined ? undefined : { left });

/** HUB загвар: яг 16 багана, наалттай толгой/хөл, зүүн талын Төрөл · Блок · Тоот. */
function HubTable({ rows, footer, total, latestImportDate, loading, fetching, sortBy, sortOrder, onSort, onOpen }: TableProps & { latestImportDate: string | null }) {
    const columns = CONTRACT_LIST_COLUMNS.map((label) => ({ label, ...HUB_COLUMN_META[label] }));
    const stickyCell = (left: number | undefined, last: boolean) => cn(left !== undefined && 'sticky z-10', last && 'border-r border-border');
    return (
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]" style={{ minWidth: HUB_TABLE_MIN_WIDTH }}>
            <colgroup>{columns.map((c) => <col key={c.label} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
            <thead>
                <tr className="text-xs font-medium text-muted-foreground">
                    {columns.map((c) => {
                        const active = sortBy === c.sort;
                        return (
                            <th key={c.label} scope="col" aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} style={stickyStyle(c.sticky)}
                                className={cn('sticky top-0 h-12 border-b border-border bg-surface-2 px-2 pb-2 align-bottom font-medium', c.sticky !== undefined ? 'z-30' : 'z-20', c.numeric ? 'text-right' : 'text-left', c.label === 'Тоот' && 'border-r')}>
                                <SortHeader label={c.label} sortKey={c.sort} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} right={c.numeric} title={c.title} />
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {loading && Array.from({ length: 8 }).map((_, i) => <tr key={i} className="h-10"><td colSpan={columns.length} className="border-b border-border px-2"><Skeleton className="h-5" /></td></tr>)}
                {!loading && rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-[13px] text-muted-foreground">Гэрээ олдсонгүй</td></tr>}
                {rows.map((c) => {
                    const names = contractListNames(c);
                    const unitNumber = contractUnitNumber(c);
                    const pricePerSqm = contractListPricePerSqm(c);
                    const derivedPrice = isDerivedPricePerSqm(c);
                    const date = c.order_date ?? c.contract_date;
                    const type = c.product_type ? HUB_TYPE_LABEL[c.product_type] ?? c.product_type : null;
                    const cell = (column: ContractListColumn) => {
                        const meta = HUB_COLUMN_META[column];
                        return cn('whitespace-nowrap px-2', meta.numeric && 'num text-right', stickyCell(meta.sticky, column === 'Тоот'));
                    };
                    return (
                        <RowLink key={c.id} id={c.id} onOpen={onOpen} fetching={fetching}>
                            <td className={cell('Төрөл')} style={stickyStyle(0)}>{type ?? <Muted />}</td>
                            <td className={cell('Блок')} style={stickyStyle(88)}>{c.block_name ?? <Muted />}</td>
                            <td className={cn(cell('Тоот'), 'num font-medium text-foreground')} style={stickyStyle(144)}>{unitNumber ?? <Muted />}</td>
                            <td className={cn(cell('Давхар'), 'num')}>{hubFloor(c.floor) ?? <Muted />}</td>
                            <td className={cn(cell('Загвар'), 'truncate')} title={c.model ?? undefined}>{c.model ?? <Muted />}</td>
                            <td className={cell('Гэрээлсэн талбай')}>{area(c.contracted_area) ?? <Muted />}</td>
                            <td className={cn(cell('Урьдчилгааны нөхцөл'), 'truncate')} title={c.prepayment_condition ?? undefined}>{c.prepayment_condition ?? <Muted />}</td>
                            <td className={cell('М.кв үнэ')}>
                                {pricePerSqm === null ? <Muted /> : derivedPrice
                                    ? <span title="Нэгжийн үнэ (ERP-ийн загвараар)" className="cursor-help underline decoration-dotted underline-offset-2">{money(pricePerSqm)}</span>
                                    : money(pricePerSqm)}
                            </td>
                            <td className={cn(cell('Нийт дүн'), 'text-foreground')}>{money(c.total_price) ?? <Muted />}</td>
                            <td className={cell('Урьдчилгааны дүн')}>{money(c.prepayment_due) ?? <Muted />}</td>
                            <td className={cell('Төлбөр хоцролт')}><OverdueCell contract={c} latestImportDate={latestImportDate} /></td>
                            <td className={cn(cell('Захиалга өгсөн огноо'), 'num')}>{date ? formatShortDate(date) : <Muted />}</td>
                            <td className={cell('Төлөв')}><Pill tone={statusTone(c.contract_status)} className="text-xs">{hubStatusLabel(c.contract_status)}</Pill></td>
                            <td className={cn(cell('Нэр'), 'truncate')} title={names.first ?? undefined}>
                                {names.first === null ? <Muted /> : names.fallback ? <Muted title="Нэр, овог салгаагүй — бүтэн нэр">{names.first}</Muted> : names.first}
                            </td>
                            <td className={cn(cell('Овог'), 'truncate')} title={names.last ?? undefined}>{names.last ?? <Muted />}</td>
                            <td className={cn(cell('Захиалгын нөхцөл'), 'truncate')}>{c.payment_condition ?? <Muted />}</td>
                        </RowLink>
                    );
                })}
            </tbody>
            {footer && rows.length > 0 && (
                <tfoot>
                    <tr className="h-10 text-[13px] font-medium text-foreground [&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:border-t [&>td]:border-border [&>td]:bg-surface-2 [&>td]:px-2 [&>td]:whitespace-nowrap">
                        <td colSpan={3} className="left-0 z-30! border-r" style={stickyStyle(0)}>Нийт · <span className="num">{total}</span> гэрээ</td>
                        <td colSpan={2} />
                        <td className="num text-right">{area(footer.area) ?? '—'}</td>
                        <td colSpan={2} />
                        <td className="num text-right">{money(footer.total_sales)}</td>
                        <td className="num text-right">{money(footer.prepayment_due) ?? '—'}</td>
                        <td className={cn('num text-right', (footer.overdue_amount ?? 0) > 0 && 'text-status-danger')}>{money(footer.overdue_amount) ?? '—'}</td>
                        <td colSpan={5} />
                    </tr>
                </tfoot>
            )}
        </table>
    );
}

/** ₮ мэдэгдвэл дүн (0 бүдэг, > 0 улаан; өмнөх файлынх бүдэг); үгүй бол системийн хоног «N хоног*», эс бөгөөс «—». */
function OverdueCell({ contract: c, latestImportDate }: { contract: ContractRow; latestImportDate: string | null }) {
    const amount = toNumber(c.overdue_amount);
    if (amount === null) {
        const days = toNumber(c.overdue_days) ?? 0;
        return days > 0 ? <Muted title={OVERDUE_DAYS_RULE}>{days} хоног*</Muted> : <Muted />;
    }
    if (latestImportDate && c.overdue_as_of && c.overdue_as_of !== latestImportDate) {
        return <Muted title={`${c.overdue_as_of}-ны файлаар — сүүлийн файлд байхгүй`}>{money(amount)}</Muted>;
    }
    if (amount === 0) return <Muted>0</Muted>;
    return <span className="font-medium text-status-danger" title={c.overdue_as_of ? `${c.overdue_as_of}-ны байдлаар` : undefined}>{money(amount)}</span>;
}

/** «Төлбөр, менежер»: гэрээний дугаар, харилцагч, төлсөн, үлдэгдэл, менежер (Мандалын төлбөрийн хяналт). */
function PaymentsTable({ rows, footer, total, loading, fetching, sortBy, sortOrder, onSort, onOpen }: TableProps) {
    const unknownPaid = footer?.unknown_paid ?? 0;
    const live = footer ? footer.total - (footer.cancelled ?? 0) : 0;
    // Төлсөн дүн тодорхойгүй гэрээтэй бол нийлбэр доод хязгаар («+»); бүгд тодорхойгүй бол «—».
    const knownSum = (value: number) => (unknownPaid >= live ? '—' : `${formatMNT(value)}${unknownPaid > 0 ? '+' : ''}`);
    const th = 'sticky top-0 z-20 h-11 border-b border-border bg-surface-2 px-2 font-medium';
    return (
        <table className="w-full min-w-[960px] border-separate border-spacing-0 text-[13px]">
            <thead>
                <tr className="text-xs font-medium text-muted-foreground">
                    <th scope="col" aria-sort={ariaSort(sortBy, sortOrder, 'contract_date')} className={cn(th, 'text-left')}><SortHeader label="Гэрээ" sortKey="contract_date" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
                    <th scope="col" aria-sort={ariaSort(sortBy, sortOrder, 'customer_name')} className={cn(th, 'text-left')}><SortHeader label="Харилцагч" sortKey="customer_name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
                    <th scope="col" className={cn(th, 'text-left')}>Блок / Тоот</th>
                    <th scope="col" aria-sort={ariaSort(sortBy, sortOrder, 'total_price')} className={cn(th, 'text-right')}><SortHeader label="Нийт үнэ" sortKey="total_price" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} right /></th>
                    <th scope="col" className={cn(th, 'text-right')}>Төлсөн</th>
                    <th scope="col" aria-sort={ariaSort(sortBy, sortOrder, 'balance')} className={cn(th, 'text-right')}><SortHeader label="Үлдэгдэл" sortKey="balance" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} right /></th>
                    <th scope="col" className={cn(th, 'text-left')}>Менежер</th>
                    <th scope="col" className={cn(th, 'text-left')}>Төлөв</th>
                </tr>
            </thead>
            <tbody>
                {loading && Array.from({ length: 8 }).map((_, i) => <tr key={i} className="h-9"><td colSpan={8} className="border-b border-border px-2"><Skeleton className="h-5" /></td></tr>)}
                {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">Гэрээ олдсонгүй</td></tr>}
                {rows.map((c) => {
                    const paidKnown = c.paid_amount !== null && c.paid_amount !== undefined;
                    const paidPct = paidKnown && c.total_price && c.total_price > 0 ? Math.round(((c.paid_amount || 0) / c.total_price) * 100) : 0;
                    const st = CONTRACT_STATUS_META[c.contract_status] ?? { label: c.contract_status, tone: 'neutral' as const };
                    const overdueDays = c.overdue_days || 0;
                    const unitNumber = contractUnitNumber(c);
                    return (
                        <RowLink key={c.id} id={c.id} onOpen={onOpen} fetching={fetching}>
                            <td className="h-16 px-2">
                                <div className="mono-label font-medium text-foreground">{c.contract_number || c.unit_label || '—'}</div>
                                <div className="num text-xs text-muted-foreground">{c.contract_date ? formatShortDate(c.contract_date) : '—'}</div>
                            </td>
                            <td className="px-2">
                                <div className="max-w-[200px] truncate font-medium text-foreground">{c.customer_name || [c.customer_last_name, c.customer_first_name].filter(Boolean).join(' ') || '—'}</div>
                                <div className="num text-xs text-muted-foreground">{c.customer_phone || c.customer_mobile || ''}</div>
                            </td>
                            <td className="px-2 text-fg-2">
                                <span className="mono-label">{[c.block_name ? `Блок ${c.block_name}` : null, unitNumber].filter(Boolean).join(' / ') || '—'}</span>
                                {(c.unit_type || c.rooms) && <span className="text-muted-foreground"> · {c.unit_type || `${c.rooms} өрөө`}</span>}
                            </td>
                            <td className="num px-2 text-right text-foreground">{formatMNT(c.total_price)}</td>
                            <td className="px-2 text-right">
                                {paidKnown ? (<>
                                    <div className="num text-fg-2">{formatMNT(c.paid_amount || 0)}</div>
                                    <div className="flex items-center justify-end gap-1.5"><Progress value={paidPct} className="w-12" overColor={false} /><span className="num text-xs text-muted-foreground">{paidPct}%</span></div>
                                </>) : <div className="text-muted-foreground" title="ERP-ийн экспортод төлсөн дүн байхгүй">—</div>}
                            </td>
                            <td className={cn('num px-2 text-right', (c.balance || 0) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                                {c.balance === null || c.balance === undefined ? '—' : formatMNT(c.balance)}
                                {overdueDays > 0 && <div className="text-xs font-medium text-status-danger">{overdueDays} хоног хоцорсон</div>}
                            </td>
                            <td className="px-2">{c.sales_manager ? <span className="inline-flex items-center gap-1.5"><Avatar name={c.sales_manager} /><span className="truncate text-fg-2">{c.sales_manager}</span></span> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-2"><Pill tone={st.tone} className="text-xs">{st.label}</Pill></td>
                        </RowLink>
                    );
                })}
            </tbody>
            {footer && rows.length > 0 && (
                <tfoot>
                    <tr className="h-10 text-[13px] font-medium text-foreground [&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:border-t [&>td]:border-border [&>td]:bg-surface-2 [&>td]:px-2 [&>td]:whitespace-nowrap">
                        <td colSpan={3}>Нийт · <span className="num">{total}</span> гэрээ</td>
                        <td className="num text-right">{formatMNT(footer.total_sales)}</td>
                        <td className="num text-right" title={unknownPaid ? `${unknownPaid} гэрээний төлсөн дүн тодорхойгүй (ERP)` : undefined}>{knownSum(footer.total_paid)}</td>
                        <td className="num text-right">{knownSum(footer.total_balance)}</td>
                        <td colSpan={2} />
                    </tr>
                </tfoot>
            )}
        </table>
    );
}

const ariaSort = (sortBy: string, sortOrder: 'asc' | 'desc', key: string) => (sortBy === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none');
