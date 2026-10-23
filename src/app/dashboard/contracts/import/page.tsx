'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { confirmToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ubDateStr } from '@/lib/utils/date';
import { HUB_STATUS_LABEL } from '@/lib/contracts/labels';
import type {
    ContractListBlockingItem, ContractListCounts, ContractListFileTotal, ContractListInfoItem, ContractListInsertItem,
    ContractListMissingItem, ContractListReviewItem, ContractListUnitMismatch, ContractListUpdateGroup,
} from '@/lib/contracts/list-import';

/**
 * «Гэрээ» → «Excel импорт»: ERP-ийн HUB гэрээний жагсаалт (16 багана). 1 «Файл» → 2 «Шалгах» (юу ч бичихгүй,
 * өөрчлөлтийн жагсаалт) → 3 «Хадгалсан». Төлсөн дүн, үлдэгдэл, байрны төлөвт импорт хүрэхгүй.
 */

interface LatestImport { report_date: string; file_name: string | null; row_count: number; created_at: string; created_by_name: string | null }
interface Preview {
    fileName: string | null;
    reportDate: string;
    sheetName: string | null;
    rowCount: number;
    counts: ContractListCounts;
    fileTotals: ContractListFileTotal[];
    units: { distinct: number; resold: number };
    review: ContractListReviewItem[];
    updates: ContractListUpdateGroup[];
    inserts: ContractListInsertItem[];
    missing: ContractListMissingItem[];
    stillUndated: number;
    unitStatusMismatches: ContractListUnitMismatch[];
    info: ContractListInfoItem[];
    blocking: ContractListBlockingItem[];
    olderThanLatest: string | null;
    extraColumns: string[];
    ignoredColumns: string[];
    skipped: Array<{ row: number; reason: string }>;
    planHash: string;
    opsCount: number;
    canCommit: boolean;
}
interface Saved { inserted: number; updated: number; replayed?: boolean }
type Step = 'file' | 'review' | 'done';

const STEPS: Array<[Step, string]> = [['file', 'Файл'], ['review', 'Шалгах'], ['done', 'Хадгалсан']];
const MONEY_FIELDS = new Set(['total_price', 'price_per_sqm', 'prepayment_due', 'overdue_amount']);
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Мөнгө ERP-ийн файлын форматаар (#,##0) — бүхэл төгрөг. */
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

function formatValue(field: string, value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'contract_status') return HUB_STATUS_LABEL[value as keyof typeof HUB_STATUS_LABEL] ?? String(value);
    if (typeof value === 'number' && MONEY_FIELDS.has(field)) return money(value);
    if (typeof value === 'number' && field === 'contracted_area') return number(value);
    return String(value);
}

export default function ContractImportPage() {
    const { shop, user } = useAuth();
    const { canWrite } = useModuleAccess();
    const { data: mode, isPending: modePending } = useDashboardMode();
    if (!shop) return <Spinner label="Уншиж байна…" />;
    if (!canWrite('contracts') || !canWrite('erp-imports')) {
        return <Alert variant="warning">Гэрээний Excel импорт хийхэд «Гэрээ» болон «ERP импорт»-ын бичих эрх шаардлагатай.</Alert>;
    }
    if (modePending) return <Spinner label="Уншиж байна…" />;
    // Хязгаарлагдсан (хувийн горимын) менежерийг сервер 403-аар буцаана; горим уншигдаагүй бол админыг хаахгүй.
    if (mode?.isManager) return <Alert variant="warning">Гэрээний Excel импортыг удирдлага (админ) хийнэ.</Alert>;
    return <ImportWorkspace key={`${user?.id}:${shop.id}`} shopId={shop.id} />;
}

function ImportWorkspace({ shopId }: { shopId: string }) {
    const cache = useQueryClient();
    const { can, isSuperAdmin } = useModuleAccess();
    const [step, setStep] = useState<Step>('file');
    const [file, setFile] = useState<File | null>(null);
    const [reportDate, setReportDate] = useState(ubDateStr);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [requestId, setRequestId] = useState('');
    const [acceptReview, setAcceptReview] = useState(false);
    const [allowOlder, setAllowOlder] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ message: string; details: string[]; stale?: boolean } | null>(null);
    const [saved, setSaved] = useState<Saved | null>(null);
    const latest = useQuery({
        queryKey: ['contracts', 'list-import', shopId],
        queryFn: () => dashboardJson<{ latest: LatestImport | null; available: boolean }>('/api/dashboard/contracts/import', { shopId }),
        retry: false,
    });
    const latestDate = latest.data?.latest?.report_date ?? null;
    const older = !!latestDate && reportDate < latestDate;

    async function send(action: 'preview' | 'commit') {
        const form = new FormData();
        form.set('file', file as File);
        form.set('action', action);
        form.set('reportDate', reportDate);
        if (action === 'commit' && preview) {
            form.set('requestId', requestId);
            form.set('planHash', preview.planHash);
            form.set('acceptReview', String(acceptReview));
            form.set('allowOlder', String(allowOlder));
        }
        const response = await dashboardFetch('/api/dashboard/contracts/import', { method: 'POST', body: form, shopId });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return { ok: response.ok, body };
    }

    async function check() {
        if (!file) return;
        setBusy(true); setError(null);
        try {
            const { ok, body } = await send('preview');
            if (!ok) {
                setError({ message: String(body.error ?? 'Файлыг шалгаж чадсангүй'), details: Array.isArray(body.errors) ? body.errors as string[] : [] });
                return;
            }
            setPreview(body as unknown as Preview);
            setRequestId(crypto.randomUUID());
            setAcceptReview(false);
            setStep('review');
        } catch {
            setError({ message: 'Сүлжээний алдаа. Дахин оролдоно уу.', details: [] });
        } finally {
            setBusy(false);
        }
    }

    async function commit() {
        if (!preview) return;
        const created = preview.counts.insert + preview.counts.insertCancelled;
        const ok = await confirmToast({
            title: 'Импортыг батлах уу?',
            description: `${created} шинэ гэрээ, ${preview.counts.update} гэрээний шинэчлэл хадгалагдана. Төлсөн дүн, үлдэгдэл өөрчлөгдөхгүй.`,
            confirmLabel: 'Батлах',
            cancelLabel: 'Болих',
        });
        if (!ok) return;
        setBusy(true); setError(null);
        try {
            const { ok: success, body } = await send('commit');
            if (!success) {
                const conflicts = Array.isArray(body.conflicts) ? (body.conflicts as Array<{ label?: string; message?: string }>).map(c => `${c.label ?? ''}: ${c.message ?? ''}`) : [];
                const blocking = Array.isArray(body.blocking) ? (body.blocking as ContractListBlockingItem[]).map(b => `${b.label}: ${b.message}`) : [];
                const stale = ['stale_preview', 'conflicts', 'older_file', 'request_reused'].includes(String(body.code));
                setError({ message: String(body.error ?? 'Импорт хадгалж чадсангүй'), details: [...conflicts, ...blocking], stale });
                return;
            }
            setSaved({ inserted: Number(body.inserted ?? 0), updated: Number(body.updated ?? 0), replayed: body.replayed === true });
            setStep('done');
            toast.success('Гэрээний жагсаалт импортлогдлоо');
            for (const key of ['contracts', 'operations-report', 'weekly-sales', 'director', 'kpi-report', 'my-stats', 'sales-kpi', 'admin-sales-targets', 'plan-performance', 'units']) {
                void cache.invalidateQueries({ queryKey: [key] });
            }
        } catch {
            setError({ message: 'Хариу ирсэнгүй. Ижил хүсэлтээр дахин «Батлах» дарж болно — давхар хадгалагдахгүй.', details: [] });
        } finally {
            setBusy(false);
        }
    }

    function restart() {
        setStep('file'); setPreview(null); setSaved(null); setError(null); setAcceptReview(false); setAllowOlder(false); setFile(null);
    }

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <PageHeader title="Гэрээний Excel импорт" className="mb-0"
                subtitle="ERP-ийн HUB гэрээний жагсаалтыг (16 багана) оруулж, гэрээний огноо, нөхцөл, төлбөр хоцролтыг шинэчилнэ." />
            <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Импортын алхам">
                {STEPS.map(([key, label], index) => {
                    const current = step === key;
                    const done = STEPS.findIndex(([k]) => k === step) > index;
                    return (
                        <li key={key} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
                            {index > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                            <span className={cn('inline-flex size-6 items-center justify-center rounded-full border text-xs num',
                                current ? 'border-brand bg-brand text-brand-fg' : done ? 'border-border-strong text-foreground' : 'border-border text-muted-foreground')}>{index + 1}</span>
                            <span className={current ? 'font-medium text-foreground' : 'text-muted-foreground'}>{label}</span>
                        </li>
                    );
                })}
            </ol>

            {error && (
                <Alert variant="danger">
                    <AlertTitle>{error.message}</AlertTitle>
                    {error.details.length > 0 && (
                        <AlertDescription>
                            <ul className="max-h-64 list-disc space-y-0.5 overflow-auto pl-5 text-[13px]">{error.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
                        </AlertDescription>
                    )}
                    {error.stale && <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => void check()}>Дахин шалгах</Button></div>}
                </Alert>
            )}

            {step === 'file' && (
                <SectionCard title="Файл" icon={FileSpreadsheet} description="ERP-ээс татсан гэрээний жагсаалт (.xlsx, .csv), 4 MB хүртэл. Файл баганын нэрээрээ танигдана.">
                    <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                        <label className="grid min-w-0 gap-1.5 text-sm">Файл
                            {/* Preflight нь файлын товчийг цэвэрлэдэг — талбарын хүрээ, харагдах товчтой (огнооны талбартай ижил өндөр). */}
                            <Input className="cursor-pointer pl-1 file:mr-3 file:cursor-pointer file:rounded-md file:bg-surface-2 file:px-3" type="file" accept=".xlsx,.csv,.tsv" disabled={busy}
                                onChange={event => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
                        </label>
                        <label className="grid gap-1.5 text-sm">Файлын огноо
                            <Input type="date" max={ubDateStr()} value={reportDate} disabled={busy}
                                onChange={event => { setReportDate(event.target.value); setAllowOlder(false); }} />
                        </label>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Төлбөр хоцролт энэ өдрийн байдлаар хадгалагдана.</p>
                    {latest.data?.latest && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Сүүлийн импорт: <span className="num">{latest.data.latest.report_date}</span> · {latest.data.latest.file_name ?? 'файл'} · <span className="num">{latest.data.latest.row_count}</span> мөр
                        </p>
                    )}
                    {older && <OlderFile latest={latestDate!} checked={allowOlder} onChange={setAllowOlder} disabled={busy} />}
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button disabled={!file || !reportDate || busy || (older && !allowOlder)} isLoading={busy} onClick={() => void check()}>Файл шалгах</Button>
                        <Button variant="ghost" href="/dashboard/contracts">Болих</Button>
                    </div>
                </SectionCard>
            )}

            {step === 'review' && preview && (
                <ReviewStep preview={preview} busy={busy} acceptReview={acceptReview} onAcceptReview={setAcceptReview}
                    allowOlder={allowOlder} onAllowOlder={setAllowOlder} onCommit={() => void commit()} onCancel={restart} />
            )}

            {step === 'done' && saved && preview && (
                <SectionCard title="Хадгалсан" description={saved.replayed ? 'Энэ импорт өмнө нь хадгалагдсан байсан — давхар бичигдээгүй.' : undefined}>
                    <p className="mt-3 text-sm">
                        <span className="num">{saved.inserted}</span> шинэ · <span className="num">{saved.updated}</span> шинэчилсэн · <span className="num">{preview.counts.unchanged}</span> хэвээр · <span className="num">{preview.reportDate}</span>-ны файл
                    </p>
                    {preview.stillUndated > 0 && <p className="mt-1 text-xs text-muted-foreground">Огноогүй <span className="num">{preview.stillUndated}</span> гэрээ файлд байхгүй тул огноогүй хэвээр — гэрээ бүрийн дэлгэрэнгүйгээс огноо оруулна.</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button href="/dashboard/contracts">Гэрээ харах</Button>
                        {preview.stillUndated > 0 && <Button variant="secondary" href="/dashboard/contracts?filter=undated">Огноогүй {preview.stillUndated} гэрээ</Button>}
                        {can('reports') && <Button variant="secondary" href="/dashboard/reports/plan">Төлөвлөгөөний биелэлт</Button>}
                        {isSuperAdmin && <Button variant="secondary" href="/admin/history">Өөрчлөлтийн түүх</Button>}
                        <Button variant="ghost" onClick={restart}>Өөр файл импортлох</Button>
                    </div>
                </SectionCard>
            )}
        </div>
    );
}

function OlderFile({ latest, checked, onChange, disabled }: { latest: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
    return (
        <div className="mt-3 rounded-lg border border-status-pending/30 bg-status-pending-soft p-3 text-sm text-status-pending">
            <p>Сүүлийн импорт <span className="num">{latest}</span>-ны файлаар хийгдсэн. Хуучин файл хоцролт, төлвийг хуучин утгаар солино.</p>
            <label className="mt-2 flex items-center gap-2 text-foreground">
                <Checkbox checked={checked} disabled={disabled} onCheckedChange={value => onChange(value === true)} />
                Хуучин файлыг мэдсээр оруулж байна
            </label>
        </div>
    );
}

function ReviewStep({ preview, busy, acceptReview, onAcceptReview, allowOlder, onAllowOlder, onCommit, onCancel }: {
    preview: Preview; busy: boolean; acceptReview: boolean; onAcceptReview: (value: boolean) => void;
    allowOlder: boolean; onAllowOlder: (value: boolean) => void; onCommit: () => void; onCancel: () => void;
}) {
    const { counts } = preview;
    const nothing = preview.opsCount === 0;
    const blocked = preview.blocking.length > 0;
    const disabled = busy || !preview.canCommit || (preview.review.length > 0 && !acceptReview) || (!!preview.olderThanLatest && !allowOlder);
    const undated = preview.missing.filter(item => item.undated).length;
    return (
        <>
            <p className="text-sm text-muted-foreground">
                {preview.fileName ?? 'Файл'} · <span className="num">{preview.rowCount}</span> мөр · 16 багана танигдлаа · <span className="num">{preview.units.distinct}</span> байр
                {preview.units.resold > 0 && <> (<span className="num">{preview.units.resold}</span> байр цуцлагдаж дахин зарагдсан)</>} · файлын огноо <span className="num">{preview.reportDate}</span>
            </p>

            <StatBar columns={3} className="mb-0">
                <StatTile label="Шинэ гэрээ" value={counts.insert + counts.insertCancelled} helper={`${counts.insert} идэвхтэй · ${counts.insertCancelled} цуцлагдсан`} />
                <StatTile label="Шинэчлэгдэх" value={counts.update} helper={counts.review ? `${counts.review} нь шалгах шаардлагатай` : undefined} />
                <StatTile label="Хэвээр" value={counts.unchanged} />
                <StatTile label="Шалгах" value={<span className={counts.review ? 'text-status-danger' : undefined}>{counts.review}</span>} helper="Дүн, огноо, төлөв өөрчлөгдөх" />
                <StatTile label="Файлд байхгүй" value={counts.missing} helper={undated ? `${undated} нь огноогүй` : 'Өөрчлөхгүй'} />
                <StatTile label="Байрны төлөв зөрүүтэй" value={preview.unitStatusMismatches.length} helper="Импорт байрны төлөвийг өөрчлөхгүй" />
            </StatBar>

            {nothing && !blocked && <Alert variant="success">Бүгд хэвээр — өөрчлөх зүйлгүй.</Alert>}
            {preview.olderThanLatest && <OlderFile latest={preview.olderThanLatest} checked={allowOlder} onChange={onAllowOlder} disabled={busy} />}

            {blocked && (
                <Alert variant="danger">
                    <AlertTitle>Батлах боломжгүй — дараах зөрчлийг засаад файлаа дахин шалгана уу</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{preview.blocking.map((item, index) => <li key={`${item.code}-${item.label}-${index}`}><b>{item.label}</b>: {item.message}</li>)}</ul>
                    </AlertDescription>
                </Alert>
            )}

            <SectionCard title="Файлын нийлбэр" description="Excel файлынхаа нийлбэртэй тулгана уу. Цуцлагдсан мөр гэрээний нийт дүнд орохгүй.">
                <Table head={['Төлөв', 'Мөр', 'Нийт дүн', 'Урьдчилгааны дүн', 'Төлбөр хоцролт']} numeric={[1, 2, 3, 4]}
                    rows={preview.fileTotals.map(total => [total.label, number(total.rows), money(total.total), money(total.prepaymentDue), money(total.overdue)])} />
            </SectionCard>

            {preview.review.length > 0 && (
                <SectionCard title="Шалгах шаардлагатай" description="Гэрээнд бүртгэлтэй дүн, огноо, төлвийг файлын утгаар солино. Шалгаж баталгаажуулсны дараа л хадгалагдана.">
                    <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                        {preview.review.map(item => (
                            <li key={item.contractId} className="px-3 py-2.5 text-sm">
                                <p className="font-medium">{item.label} <span className="text-xs font-normal text-muted-foreground">· мөр {item.row}</span></p>
                                <p className="mt-0.5 text-[13px] text-muted-foreground">
                                    {item.changes.map(change => `${change.label} ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`).join(' · ')}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                        <Checkbox checked={acceptReview} disabled={busy} onCheckedChange={value => onAcceptReview(value === true)} />
                        Дүн, төлөв өөрчлөгдөх гэрээг шалгасан
                    </label>
                </SectionCard>
            )}

            {preview.info.length > 0 && (
                <SectionCard title="Мэдээлэл" description="Импорт эзэмшигчийг өөрчлөхгүй. Нэр зөрвөл гэрээний хуудасны «Гэрээ шилжүүлэх» → «Нэр засах»-аар засна.">
                    <Table head={['Байр', 'Тайлбар', 'Файлд', 'Одоо']}
                        rows={preview.info.map(item => [item.label, item.message, item.fileName ?? '—', item.currentName ?? '—'])} />
                </SectionCard>
            )}

            {preview.updates.length > 0 && (
                <SectionCard title="Шинэчлэгдэх" description="Хоосон талбарыг бөглөх, нөхцөл, төлбөр хоцролтыг файлын огноогоор — автоматаар.">
                    <div className="mt-3 space-y-2">
                        {preview.updates.map(group => (
                            <details key={group.field} className="rounded-xl border border-border">
                                <summary className="cursor-pointer px-3 py-2.5 text-sm">
                                    {group.label} — <span className="num">{group.count}</span>
                                </summary>
                                <div className="border-t border-border px-3 pb-3">
                                    <Table head={['Байр', 'Одоо', 'Файлд']}
                                        rows={group.items.map(item => [item.label, formatValue(group.field, item.from), formatValue(group.field, item.to)])} />
                                </div>
                            </details>
                        ))}
                    </div>
                </SectionCard>
            )}

            {preview.inserts.length > 0 && (
                <SectionCard title="Шинэ гэрээ" description="Төлсөн дүн, үлдэгдэлгүй (мэдэгдэхгүй) бүртгэгдэнэ. Цуцлагдсан мөр түүх болж хадгалагдана.">
                    <Table head={['Байр', 'Төлөв', 'Захиалга өгсөн огноо', 'Нийт дүн', 'Эзэмшигч']} numeric={[3]}
                        rows={preview.inserts.map(item => [item.label, HUB_STATUS_LABEL[item.status], item.orderDate, money(item.total), item.name ?? '—'])} />
                </SectionCard>
            )}

            {preview.missing.length > 0 && (
                <SectionCard title="Файлд байхгүй — өөрчлөхгүй" description={undated ? `Эдгээр гэрээ хэвээр үлдэнэ. ${undated} нь огноогүй тул сарын гүйцэтгэлд орохгүй.` : 'Эдгээр гэрээ хэвээр үлдэнэ.'}>
                    <Table head={['Байр', 'Төлөв', 'Захиалга өгсөн огноо', 'Нийт дүн']} numeric={[3]}
                        rows={preview.missing.map(item => [item.label, formatValue('contract_status', item.status), item.orderDate ?? 'Огноогүй', item.total === null ? '—' : money(item.total)])} />
                </SectionCard>
            )}

            {preview.unitStatusMismatches.length > 0 && (
                <SectionCard title="Байрны төлөв зөрүүтэй — импорт байрны төлөвийг өөрчлөхгүй" description="Байрны төлөвийг байрны жагсаалтаас засна.">
                    <Table head={['Байр', 'Байрны төлөв', 'Тайлбар']}
                        rows={preview.unitStatusMismatches.map(item => [item.label, item.unitStatusLabel,
                            item.kind === 'live_on_free' ? 'Идэвхтэй гэрээтэй боловч байр чөлөөтэй/захиалсан' : 'Гэрээ цуцлагдсан боловч байр зарагдсан'])} />
                </SectionCard>
            )}

            {(preview.skipped.length > 0 || preview.ignoredColumns.length > 0 || preview.extraColumns.length > 0) && (
                <SectionCard title="Импортлоогүй">
                    {preview.ignoredColumns.length > 0 && <p className="mt-2 text-sm">Импортлохгүй багана: {preview.ignoredColumns.join(', ')}</p>}
                    {preview.extraColumns.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Нэмэлт багана танигдлаа: {preview.extraColumns.join(', ')}. «Нийт төлсөн дүн» гэрээнд бичигдэхгүй — импортын түүхэнд хадгалагдаж, «Төлөвлөгөөний биелэлт»-ийн орсон мөнгийг (тухайн сард захиалсан гэрээнээс, файлын огноогоор) тооцоход ашиглагдана.</p>}
                    {preview.skipped.length > 0 && <Table head={['Мөр', 'Шалтгаан']} rows={preview.skipped.map(item => [String(item.row), item.reason])} />}
                </SectionCard>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Төлсөн дүн, үлдэгдлийг энэ импорт өөрчлөхгүй.</p>
                <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" disabled={busy} onClick={onCancel}>Болих</Button>
                    <Button disabled={disabled} isLoading={busy} onClick={onCommit}>Батлах</Button>
                </div>
            </div>
        </>
    );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
    return (
        <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-border">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                    <tr>{head.map((label, index) => (
                        <th key={label} className={cn('sticky top-0 border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-muted-foreground',
                            numeric.includes(index) ? 'text-right' : 'text-left')}>{label}</th>
                    ))}</tr>
                </thead>
                <tbody>
                    {rows.map((cells, rowIndex) => (
                        <tr key={rowIndex}>{cells.map((cell, index) => (
                            <td key={index} className={cn('border-b border-border px-3 py-2 align-top', numeric.includes(index) && 'num text-right whitespace-nowrap')}>{cell}</td>
                        ))}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
