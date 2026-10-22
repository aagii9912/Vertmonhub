'use client';

import { Suspense, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCopy, ImageDown, PencilLine, Printer, RefreshCw, Settings2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDailyReport } from '@/hooks/useDailyReport';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { activityWeekStart, daySpan, periodBounds, shiftDate } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { downloadElementImage, type ImageFormat } from '@/lib/utils/element-image';
import { cn } from '@/lib/utils';
import {
    DAILY_COUNT_MAX, DAILY_RANGE_MAX_DAYS, DailyReportDateSchema, formatDailyReportText,
    type DailyReport, type DailyReportNotes,
} from '@/lib/dashboard/daily-report';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { cellKey, DailyReportDocument } from '@/components/daily-report/DailyReportDocument';
import { DailyReportSettingsSheet } from '@/components/daily-report/DailyReportSettingsSheet';

export default function DailyReportPage() {
    return <Suspense fallback={<Skeleton className="mx-auto h-[560px] max-w-[1180px]" />}><DailyReportRoute /></Suspense>;
}

type DateRange = { from: string; to: string };

/** `?from=&to=` (AI-ийн холбоос) → хугацааны нэгтгэл; буруу, ирээдүйн эсвэл хэт урт бол null. */
function rangeFromSearch(from: string | null, to: string | null, today: string): DateRange | null {
    const start = DailyReportDateSchema.safeParse(from), end = DailyReportDateSchema.safeParse(to);
    if (!start.success || !end.success) return null;
    if (start.data >= end.data || end.data > today || daySpan(start.data, end.data) > DAILY_RANGE_MAX_DAYS) return null;
    return { from: start.data, to: end.data };
}

function DailyReportRoute() {
    const { shop, user } = useAuth();
    const search = useSearchParams();
    const initialRange = rangeFromSearch(search.get('from'), search.get('to'), ubDateStr());
    // Байгууллага/хэрэглэгч солиход өмнөх ноорог, огноог авч үлдэхгүй.
    return <DailyReportView key={`${shop?.id}:${user?.id}`} initialRange={initialRange} />;
}

/** Хугацааны бэлэн сонголт: сүүлийн 7 хоног, Лхагвагийн хурлын өмнөх 7 хоног (Лхагва–Мягмар), энэ/өмнөх сар. */
function rangePresets(today: string): Array<{ label: string; title: string; range: DateRange }> {
    const month = periodBounds(today, 'month');
    const previousMonth = periodBounds(shiftDate(month.from, -1), 'month');
    const meetingWeek = periodBounds(shiftDate(activityWeekStart(today), -1), 'week');
    return [
        { label: 'Сүүлийн 7 хоног', title: 'Өнөөдрийг оруулаад сүүлийн 7 өдөр', range: { from: shiftDate(today, -6), to: today } },
        { label: 'Хурлын 7 хоног', title: 'Өнгөрсөн Лхагва–Мягмар (Лхагвагийн хурлын тайлан)', range: meetingWeek },
        { label: 'Энэ сар', title: 'Сарын эхнээс өнөөдөр хүртэл', range: { from: month.from, to: today } },
        { label: 'Өмнөх сар', title: 'Өмнөх сарын бүх өдөр', range: previousMonth },
    ];
}

const savedNotes = (report: DailyReport): DailyReportNotes => ({
    lines: Object.fromEntries(report.lines.map(line => [line.key, line.note])),
    chats: report.chats.note,
    general: report.generalNote,
});

function DailyReportView({ initialRange }: { initialRange: DateRange | null }) {
    const { shop } = useAuth();
    const { canWrite } = useModuleAccess();
    const queryClient = useQueryClient();
    const today = ubDateStr();
    const [date, setDate] = useState(initialRange?.from ?? today);
    /** Хугацааны нэгтгэлийн дуусах өдөр; null = нэг өдрийн тайлан. */
    const [rangeTo, setRangeTo] = useState<string | null>(initialRange?.to ?? null);
    const [editOverride, setEditOverride] = useState<boolean | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [notesDraft, setNotesDraft] = useState<DailyReportNotes | null>(null);
    const [saving, setSaving] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [imageFormat, setImageFormat] = useState<ImageFormat | null>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const ranged = rangeTo !== null;
    const to = rangeTo ?? date;
    const query = useDailyReport(date, to);
    const data = query.data?.date === date && (query.data.to ?? query.data.date) === to ? query.data : undefined;
    const report = data?.report ?? null;
    const viewer = data?.viewer;
    // Хугацааны нэгтгэл зөвхөн харах: тоо, тэмдэглэл, баталгаажуулалтыг өдөр бүрээр нь хийнэ.
    const editable = new Set(ranged ? [] : viewer?.editable ?? []);
    // Менежер өнөөдрийн тоогоо оруулаагүй бол шууд оруулах горимоор нээгдэнэ.
    const editMode = !ranged && (editOverride ?? (!!viewer?.personal && editable.size > 0 && !!report && !report.filled.some(name => editable.has(name))));
    const dirty = Object.keys(draft).length > 0 || notesDraft !== null;
    const canConfigure = canWrite('settings') && !!data?.config && !viewer?.personal;

    const goTo = (next: string) => {
        if (dirty) return;
        setDate(next);
        setEditOverride(null);
    };
    /** Хугацааг тохируулна: ирээдүй хасагдана; урт хугацааг өөрчилсөн захаас нь DAILY_RANGE_MAX_DAYS-д багтаана. */
    const selectRange = (from: string, until: string, anchor: 'from' | 'to' = 'to') => {
        if (dirty) return;
        let start = from > today ? today : from;
        let end = until > today ? today : until;
        if (start > end) { if (anchor === 'from') end = start; else start = end; }
        if (daySpan(start, end) > DAILY_RANGE_MAX_DAYS) {
            if (anchor === 'from') end = shiftDate(start, DAILY_RANGE_MAX_DAYS - 1);
            else start = shiftDate(end, 1 - DAILY_RANGE_MAX_DAYS);
        }
        setDate(start);
        setRangeTo(end);
        setEditOverride(null);
    };
    const switchMode = (next: 'day' | 'range') => {
        if (dirty || (next === 'range') === ranged) return;
        if (next === 'range') selectRange(shiftDate(date, -6), date);
        else { setDate(to); setRangeTo(null); setEditOverride(null); }
    };
    const presets = rangePresets(today);
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

    async function downloadImage(format: ImageFormat) {
        if (!report) return;
        // Зургийн хувилбарыг (цагаан цаас, дэлгэцийн өргөн загвар) дэлгэцээс гадуур зурж авна.
        flushSync(() => setImageFormat(format));
        try {
            if (!imageRef.current) throw new Error('Тайлангийн зураг зурагдсангүй');
            await downloadElementImage(imageRef.current, ranged ? `өдрийн_тайлан_${date}_${to}` : `өдрийн_тайлан_${date}`, format);
            toast.success('Тайлангийн зураг татагдлаа');
        } catch {
            toast.error('Зураг үүсгэж чадсангүй. PDF / хэвлэх үйлдлийг ашиглана уу.');
        } finally {
            setImageFormat(null);
        }
    }

    const notices: Array<{ tone: 'info' | 'warning'; text: ReactNode }> = [];
    if (report && ranged) notices.push({ tone: 'info', text: `${report.days} өдрийн тайланг нэгтгэв: дуудлага, чатын тоо, уулзалт нийлбэрээр. Тоо засах, тэмдэглэл, баталгаажуулалтыг «Өдөр» горимд өдөр тус бүрээр хийнэ.` });
    if (report && to === today) notices.push({ tone: 'info', text: 'Өдөр дуусаагүй — одоогоор бүртгэсэн мэдээллийг харуулж байна.' });
    if (report && viewer?.personal && !ranged) notices.push({ tone: 'info', text: 'Төслийн бүх менежерийн мэдээлэл харагдана. Зөвхөн өөрийн тоог засна; багийн тайлбар, баталгаажуулалтыг ээлжийн менежер хийнэ.' });
    if (report && report.meetings.pending > 0) notices.push({ tone: 'warning', text: <span>{ranged ? 'Энэ хугацаанд' : 'Энэ өдөр'} товлосон {report.meetings.pending} уулзалтын үр дүн бүртгэгдээгүй тул тайланд ороогүй. <Link href="/dashboard/viewings" className="font-medium underline">Уулзалт</Link> хуудсанд «Болсон» гэж тэмдэглэнэ үү.</span> });
    if (report && report.missing.length > 0) notices.push({ tone: 'warning', text: `${ranged ? 'Энэ хугацаанд тоо огт оруулаагүй' : 'Тоо оруулаагүй'}: ${report.missing.join(', ')}.` });
    if (data?.configInvalid) notices.push({ tone: 'warning', text: 'Хадгалсан загвар уншигдсангүй — анхдагч загварыг харуулж байна. «Загвар»-аас дахин хадгална уу.' });
    if (data && !data.configSaved && canConfigure) notices.push({ tone: 'info', text: 'Энэ төслийн загварыг тохируулаагүй байна. «Загвар» товчоор утасны шугам, чатын суваг, менежерийн баганаа тохируулна уу.' });

    return (
        <div className="mx-auto max-w-[1180px] space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-tight">Өдрийн тайлан</h1>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        Менежер бүр дуудлага, чатын тоогоо оруулна; уулзалт системээс автоматаар орно. Ээлжийн менежер багийн бүх мэдээллийг нэгтгэн тайланг баталгаажуулна.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching || dirty}>
                    <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />Шинэчлэх
                </Button>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="Тайлангийн хугацаа" className="flex rounded-lg border border-control p-0.5">
                        {(['day', 'range'] as const).map(mode => (
                            <button key={mode} type="button" aria-pressed={(mode === 'range') === ranged} disabled={dirty} onClick={() => switchMode(mode)}
                                className={cn('h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50',
                                    (mode === 'range') === ranged && 'bg-surface-2 text-foreground')}>
                                {mode === 'day' ? 'Өдөр' : 'Хугацаа'}
                            </button>
                        ))}
                    </div>
                    {ranged ? <>
                        <input type="date" value={date} max={today} disabled={dirty} aria-label="Эхлэх өдөр"
                            onChange={event => {
                                const parsed = DailyReportDateSchema.safeParse(event.target.value);
                                if (parsed.success) selectRange(parsed.data, to, 'from');
                            }}
                            className="h-9 rounded-lg border border-control bg-surface px-3 text-sm text-foreground" />
                        <span aria-hidden className="text-muted-foreground">–</span>
                        <input type="date" value={to} max={today} disabled={dirty} aria-label="Дуусах өдөр"
                            onChange={event => {
                                const parsed = DailyReportDateSchema.safeParse(event.target.value);
                                if (parsed.success) selectRange(date, parsed.data, 'to');
                            }}
                            className="h-9 rounded-lg border border-control bg-surface px-3 text-sm text-foreground" />
                        <div className="flex flex-wrap gap-1">
                            {presets.map(preset => (
                                <Button key={preset.label} variant="ghost" size="sm" title={preset.title} disabled={dirty}
                                    aria-pressed={preset.range.from === date && preset.range.to === to}
                                    className={cn(preset.range.from === date && preset.range.to === to && 'bg-surface-2 text-foreground')}
                                    onClick={() => selectRange(preset.range.from, preset.range.to)}>
                                    {preset.label}
                                </Button>
                            ))}
                        </div>
                    </> : <>
                        <Button variant="ghost" size="icon" aria-label="Өмнөх өдөр" disabled={dirty} onClick={() => goTo(shiftDate(date, -1))}><ChevronLeft /></Button>
                        <input type="date" value={date} max={today} disabled={dirty} aria-label="Тайлангийн өдөр"
                            onChange={event => {
                                const parsed = DailyReportDateSchema.safeParse(event.target.value);
                                if (parsed.success && parsed.data <= today) goTo(parsed.data);
                            }}
                            className="h-9 rounded-lg border border-control bg-surface px-3 text-sm text-foreground" />
                        <Button variant="ghost" size="icon" aria-label="Дараах өдөр" disabled={dirty || date >= today} onClick={() => goTo(shiftDate(date, 1))}><ChevronRight /></Button>
                        {date !== today && <Button variant="ghost" size="sm" disabled={dirty} onClick={() => goTo(today)}>Өнөөдөр</Button>}
                    </>}
                </div>
                <div className="flex flex-wrap gap-2">
                    {editMode ? <>
                        <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Болих</Button>
                        <Button onClick={() => void save()} disabled={saving || !dirty}>{saving ? 'Хадгалж байна…' : 'Хадгалах'}</Button>
                    </> : <>
                        {editable.size > 0 && report && <Button variant="secondary" onClick={() => setEditOverride(true)}><PencilLine />{viewer?.personal ? 'Тоогоо оруулах' : 'Засах'}</Button>}
                        {canConfigure && <Button variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 />Загвар</Button>}
                        <Button variant="ghost" disabled={!report} onClick={() => void copy()}><ClipboardCopy />Хуулах</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" disabled={!report || imageFormat !== null}>
                                    <ImageDown />{imageFormat ? 'Зураг бэлдэж байна…' : 'Зураг'}<ChevronDown className="size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => void downloadImage('png')}>PNG татах</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void downloadImage('jpeg')}>JPEG татах</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="secondary" disabled={!report} onClick={() => window.print()}><Printer />PDF / хэвлэх</Button>
                        {viewer?.canEditTeam && !ranged && report && (report.completed
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

            {imageFormat && report && (
                <div inert className="pointer-events-none fixed top-0 left-[-10000px]">
                    <div ref={imageRef} className="paper-theme w-[1180px] p-8">
                        <DailyReportDocument report={report} forImage />
                    </div>
                </div>
            )}

            {canConfigure && data?.config && settingsOpen && (
                <DailyReportSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} config={data.config} roster={data.roster} shopName={shop?.name || 'Төсөл'} />
            )}
        </div>
    );
}
