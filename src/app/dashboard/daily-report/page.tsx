'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, PencilLine, Printer, RefreshCw, Settings2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDailyReport } from '@/hooks/useDailyReport';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { shiftDate } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import {
    DAILY_COUNT_MAX, DailyReportDateSchema, formatDailyReportText,
    type DailyReport, type DailyReportNotes,
} from '@/lib/dashboard/daily-report';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { cellKey, DailyReportDocument } from '@/components/daily-report/DailyReportDocument';
import { DailyReportSettingsSheet } from '@/components/daily-report/DailyReportSettingsSheet';

export default function DailyReportPage() {
    const { shop, user } = useAuth();
    // Байгууллага/хэрэглэгч солиход өмнөх ноорог, огноог авч үлдэхгүй.
    return <DailyReportView key={`${shop?.id}:${user?.id}`} />;
}

const savedNotes = (report: DailyReport): DailyReportNotes => ({
    lines: Object.fromEntries(report.lines.map(line => [line.key, line.note])),
    chats: report.chats.note,
    general: report.generalNote,
});

function DailyReportView() {
    const { shop } = useAuth();
    const { canWrite } = useModuleAccess();
    const queryClient = useQueryClient();
    const today = ubDateStr();
    const [date, setDate] = useState(today);
    const [editOverride, setEditOverride] = useState<boolean | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [notesDraft, setNotesDraft] = useState<DailyReportNotes | null>(null);
    const [saving, setSaving] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const query = useDailyReport(date);
    const data = query.data?.date === date ? query.data : undefined;
    const report = data?.report ?? null;
    const viewer = data?.viewer;
    const editable = new Set(viewer?.editable ?? []);
    // Менежер өнөөдрийн тоогоо оруулаагүй бол шууд оруулах горимоор нээгдэнэ.
    const editMode = editOverride ?? (!!viewer?.personal && editable.size > 0 && !!report && report.filled.length === 0);
    const dirty = Object.keys(draft).length > 0 || notesDraft !== null;
    const canConfigure = canWrite('settings') && !!data?.config && !viewer?.personal;

    const goTo = (next: string) => {
        if (dirty) return;
        setDate(next);
        setEditOverride(null);
    };
    const cancelEdit = () => { setDraft({}); setNotesDraft(null); setEditOverride(false); };

    async function save(extra: { complete?: boolean } = {}) {
        if (!report) return;
        const cells: Array<{ manager: string; metric: string; value: number | null }> = [];
        for (const [key, raw] of Object.entries(draft)) {
            const [manager, metric] = key.split('\u0000');
            const text = raw.trim();
            const value = text === '' ? null : Number(text);
            if (value !== null && (!Number.isInteger(value) || value < 0 || value > DAILY_COUNT_MAX)) {
                toast.error(`Тоо буруу байна: ${manager} — ${text}`);
                return;
            }
            const saved = [...report.lines.flatMap(line => line.rows), ...report.chats.rows].find(row => row.key === metric)?.values[manager] ?? null;
            if (saved !== value) cells.push({ manager, metric, value });
        }
        setSaving(true);
        try {
            await dashboardMutate('/api/dashboard/daily-report', 'PUT', {
                date, cells,
                ...(notesDraft ? { notes: notesDraft } : {}),
                ...extra,
            });
            await queryClient.invalidateQueries({ queryKey: ['daily-report'] });
            setDraft({});
            setNotesDraft(null);
            setEditOverride(false);
            toast.success(extra.complete === true ? 'Тайланг баталгаажууллаа' : extra.complete === false ? 'Баталгаажуулалтыг цуцаллаа' : 'Хадгалагдлаа');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй. Дахин оролдоно уу.');
        } finally {
            setSaving(false);
        }
    }

    async function copy() {
        if (!report) return;
        try { await navigator.clipboard.writeText(formatDailyReportText(report)); toast.success('Тайлангийн текст хууллаа'); }
        catch { toast.error('Хуулж чадсангүй. PDF / хэвлэх үйлдлийг ашиглана уу.'); }
    }

    const notices: Array<{ tone: 'info' | 'warning'; text: ReactNode }> = [];
    if (report && date === today) notices.push({ tone: 'info', text: 'Өдөр дуусаагүй — одоогоор бүртгэсэн мэдээллийг харуулж байна.' });
    if (report && report.meetings.pending > 0) notices.push({ tone: 'warning', text: <>Энэ өдөр товлосон {report.meetings.pending} уулзалтын үр дүн бүртгэгдээгүй тул тайланд ороогүй. <Link href="/dashboard/viewings" className="font-medium underline">Уулзалт</Link> хуудсанд «Болсон» гэж тэмдэглэнэ үү.</> });
    if (report && !viewer?.personal && report.missing.length > 0) notices.push({ tone: 'warning', text: `Тоо оруулаагүй: ${report.missing.join(', ')}.` });
    if (data?.configInvalid) notices.push({ tone: 'warning', text: 'Хадгалсан загвар уншигдсангүй — анхдагч загварыг харуулж байна. «Загвар»-аас дахин хадгална уу.' });
    if (data && !data.configSaved && canConfigure) notices.push({ tone: 'info', text: 'Энэ төслийн загварыг тохируулаагүй байна. «Загвар» товчоор утасны шугам, чатын суваг, менежерийн баганаа тохируулна уу.' });

    return (
        <div className="mx-auto max-w-[1180px] space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-tight">Өдрийн тайлан</h1>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        Утасны шугам, чатын тоог менежер бүр оруулна; уулзалт системээс автоматаар орно. Хуулж мессенжерт явуулах эсвэл PDF болгоно.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching || dirty}>
                    <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />Шинэчлэх
                </Button>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" aria-label="Өмнөх өдөр" disabled={dirty} onClick={() => goTo(shiftDate(date, -1))}><ChevronLeft /></Button>
                    <input type="date" value={date} max={today} disabled={dirty} aria-label="Тайлангийн өдөр"
                        onChange={event => {
                            const parsed = DailyReportDateSchema.safeParse(event.target.value);
                            if (parsed.success && parsed.data <= today) goTo(parsed.data);
                        }}
                        className="h-9 rounded-lg border border-control bg-surface px-3 text-sm text-foreground" />
                    <Button variant="ghost" size="icon" aria-label="Дараах өдөр" disabled={dirty || date >= today} onClick={() => goTo(shiftDate(date, 1))}><ChevronRight /></Button>
                    {date !== today && <Button variant="ghost" size="sm" disabled={dirty} onClick={() => goTo(today)}>Өнөөдөр</Button>}
                </div>
                <div className="flex flex-wrap gap-2">
                    {editMode ? <>
                        <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Болих</Button>
                        <Button onClick={() => void save()} disabled={saving || !dirty}>{saving ? 'Хадгалж байна…' : 'Хадгалах'}</Button>
                    </> : <>
                        {editable.size > 0 && report && <Button variant="secondary" onClick={() => setEditOverride(true)}><PencilLine />{viewer?.personal ? 'Тоогоо оруулах' : 'Засах'}</Button>}
                        {canConfigure && <Button variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 />Загвар</Button>}
                        <Button variant="ghost" disabled={!report} onClick={() => void copy()}><ClipboardCopy />Хуулах</Button>
                        <Button variant="secondary" disabled={!report} onClick={() => window.print()}><Printer />PDF / хэвлэх</Button>
                        {viewer?.canEditTeam && report && (report.completed
                            ? <Button variant="ghost" disabled={saving} onClick={() => void save({ complete: false })}><Undo2 />Баталгаажуулалт цуцлах</Button>
                            : <Button disabled={saving} onClick={() => void save({ complete: true })}><CheckCircle2 />Баталгаажуулах</Button>)}
                    </>}
                </div>
            </div>

            {notices.length > 0 && (
                <div className="space-y-2 print:hidden">
                    {notices.map((notice, index) => <Alert key={index} variant={notice.tone}>{notice.text}</Alert>)}
                </div>
            )}

            {query.isPending || (!data && query.isFetching) ? <Skeleton className="h-[560px]" /> : !data ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">
                    Өдрийн тайланг ачаалж чадсангүй. {query.error?.message}
                    <Button size="sm" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Дахин оролдох</Button>
                </div>
            ) : viewer?.onboarding || !report ? (
                <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">
                    Таны нэр энэ төслийн борлуулалтын менежерийн бүртгэлд холбогдоогүй байна. Админ бүртгэлд холбосны дараа өөрийн тоогоо энд оруулна.
                </p>
            ) : (
                <article className="daily-report min-w-0 bg-background">
                    <DailyReportDocument report={report} editing={editMode ? {
                        editable,
                        draft,
                        onCell: (manager, metric, value) => setDraft(current => ({ ...current, [cellKey(manager, metric)]: value })),
                        notes: viewer?.canEditTeam ? (notesDraft ?? savedNotes(report)) : null,
                        onNotes: setNotesDraft,
                    } : null} />
                </article>
            )}

            {canConfigure && data?.config && settingsOpen && (
                <DailyReportSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} config={data.config} roster={data.roster} shopName={shop?.name || 'Төсөл'} />
            )}
        </div>
    );
}
