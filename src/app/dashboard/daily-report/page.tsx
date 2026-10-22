'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCopy, History, ImageDown, PencilLine, Printer, RefreshCw, Settings2, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { invalidateDailyMeetingQueries, useDailyReport, type DailyReportConflictResponse } from '@/hooks/useDailyReport';
import { dashboardFetch, dashboardMutate } from '@/lib/api/dashboardFetch';
import { activityWeekStart, daySpan, periodBounds, shiftDate } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { downloadElementImage, type ImageFormat } from '@/lib/utils/element-image';
import { cn } from '@/lib/utils';
import {
    DAILY_COUNT_MAX, DAILY_RANGE_MAX_DAYS, DailyReportDateSchema, dailyMetricLabel, dailyNoteLabel, formalManagerName, formatDailyReportText,
    type DailyMeetingItem, type DailyPendingMeeting, type DailyReport, type DailyReportConflict, type DailyReportNotes,
} from '@/lib/dashboard/daily-report';
import { DAILY_MEETING_BACKDATE_DAYS, type DailyMeetingRequestBody, type DailyMeetingResponse } from '@/lib/dashboard/daily-report-meetings';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { cellKey, DailyReportDocument, type DailyMeetingActions } from '@/components/daily-report/DailyReportDocument';
import { DailyMeetingDialog } from '@/components/daily-report/DailyMeetingDialog';
import { DailyReportHistorySheet } from '@/components/daily-report/DailyReportHistorySheet';
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
    const today = ubDateStr();
    // `?date=` (админы түүхийн холбоос) эсвэл `?from=&to=` (AI-ийн хугацааны холбоос).
    const range = rangeFromSearch(search.get('from'), search.get('to'), today);
    const initial = { date: range?.from ?? initialDate(search.get('date'), today), to: range?.to ?? null };
    // Байгууллага/хэрэглэгч солиход өмнөх ноорог, огноог авч үлдэхгүй.
    return <DailyReportView key={`${shop?.id}:${user?.id}`} initial={initial} />;
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

/** Тайланд харагдах хэлбэр: шугам/чатын тайлбар нэг мөрөнд (зай нэгтгэнэ), ерөнхий тэмдэглэл мөр шилжилттэй. */
const noteText = (key: string, value: string) => (key === 'general' ? value.trim() : value.replace(/\s+/g, ' ').trim());
const notesEntries = (notes: DailyReportNotes): Array<[string, string]> => [
    ...Object.entries(notes.lines ?? {}).map(([line, value]): [string, string] => [`line.${line}`, value]),
    ...(notes.chats !== undefined ? [['chats', notes.chats] as [string, string]] : []),
    ...(notes.general !== undefined ? [['general', notes.general] as [string, string]] : []),
];
const setNote = (target: DailyReportNotes, key: string, value: string) => {
    if (key === 'chats') target.chats = value;
    else if (key === 'general') target.general = value;
    else target.lines = { ...target.lines, [key.slice(5)]: value };
};
const noteOf = (notes: DailyReportNotes, key: string) => (key === 'chats' ? notes.chats : key === 'general' ? notes.general : notes.lines?.[key.slice(5)]) ?? '';

/** Хадгалсан тэмдэглэл дээр хэрэглэгчийн зассан түлхүүрүүд (`line.l1`, `chats`, `general` → текст). */
function mergedNotes(report: DailyReport, patch: Record<string, string>): DailyReportNotes {
    const notes = savedNotes(report);
    for (const [key, value] of Object.entries(patch)) setNote(notes, key, value);
    return notes;
}

/**
 * Зөвхөн хэрэглэгчийн зассан тэмдэглэл + засаж эхлэхдээ харсан текст (`notesExpected`, `base`).
 * Засаагүй түлхүүрийг илгээхгүй; энэ хооронд хамт олон өөрчилсөн бол сервер 409 буцаана
 * (дахин уншсан тайлангийн утгаар биш — харуулаагүй өөрчлөлтийг дарахгүй).
 */
function changedNotes(report: DailyReport, patch: Record<string, string>, base: Record<string, string>) {
    const shown = savedNotes(report);
    const notes: DailyReportNotes = {};
    const notesExpected: DailyReportNotes = {};
    let changed = false;
    for (const [key, raw] of Object.entries(patch)) {
        const value = noteText(key, raw);
        const seen = base[key] ?? noteOf(shown, key);
        if (value === noteText(key, seen)) continue;
        setNote(notes, key, value);
        setNote(notesExpected, key, seen);
        changed = true;
    }
    return changed ? { notes, notesExpected } : null;
}

function initialDate(raw: string | null, today: string) {
    const parsed = DailyReportDateSchema.safeParse(raw);
    return parsed.success && parsed.data <= today ? parsed.data : today;
}

/** `initial.to` = хугацааны нэгтгэлийн дуусах өдөр (null = нэг өдрийн тайлан). */
function DailyReportView({ initial }: { initial: { date: string; to: string | null } }) {
    const { shop } = useAuth();
    const { canWrite } = useModuleAccess();
    const queryClient = useQueryClient();
    const today = ubDateStr();
    const [date, setDate] = useState(initial.date);
    /** Хугацааны нэгтгэлийн дуусах өдөр; null = нэг өдрийн тайлан. */
    const [rangeTo, setRangeTo] = useState<string | null>(initial.to);
    const [editOverride, setEditOverride] = useState<boolean | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    // Зассан тэмдэглэлийн түлхүүрүүд л (бүх тэмдэглэлийн хуулбар биш).
    const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
    const [conflicts, setConflicts] = useState<DailyReportConflict[]>([]);
    // Засаж эхлэхдээ харсан утга (cellKey/тэмдэглэлийн түлхүүр → утга) — `expected`-ийг үүгээр илгээнэ.
    const [cellBase, setCellBase] = useState<Record<string, number | null>>({});
    const [noteBase, setNoteBase] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [meetingOpen, setMeetingOpen] = useState(false);
    const [meetingBusy, setMeetingBusy] = useState<string | null>(null);
    const [imageFormat, setImageFormat] = useState<ImageFormat | null>(null);
    // Товлосон уулзалтын цаг болмогц «Болсон»/«Ирээгүй» идэвхжинэ (хуудас хөдөлгөөнгүй байсан ч).
    const [now, setNow] = useState(() => Date.now());
    const imageRef = useRef<HTMLDivElement>(null);
    const ranged = rangeTo !== null;
    const to = rangeTo ?? date;
    const query = useDailyReport(date, to);
    const data = query.data?.date === date && (query.data.to ?? query.data.date) === to ? query.data : undefined;
    const report = data?.report ?? null;
    const viewer = data?.viewer;
    const own = viewer?.own ?? null;
    // Хугацааны нэгтгэл зөвхөн харах: тоо, тэмдэглэл, уулзалт, баталгаажуулалтыг өдөр бүрээр нь хийнэ.
    const editable = new Set(ranged ? [] : viewer?.editable ?? []);
    // Менежер өөрийн өнөөдрийн тоогоо оруулаагүй бол шууд оруулах горимоор нээгдэнэ.
    const editMode = !ranged && (editOverride ?? (!!viewer?.personal && !!own && editable.has(own) && !!report && !report.filled.includes(own)));
    const dirty = Object.keys(draft).length > 0 || Object.keys(notesDraft).length > 0;
    const canConfigure = canWrite('settings') && !!data?.config && !viewer?.personal;

    // Уулзалт: POST /meetings-ийн дүрэм — viewings бичих эрх; бүртгэлтэй менежер өөрийн төсөлд, сүүлийн 7 хоногт.
    const canMeet = !ranged && !!report && !!viewer && canWrite('viewings') && (!viewer.personal || !!own);
    const meetingWindow = !viewer?.personal || date >= shiftDate(today, -DAILY_MEETING_BACKDATE_DAYS);
    // Сервер зорилтот менежерийг төслийн идэвхтэй бүртгэлээр шалгадаг — тэр жагсаалтаар (хуучин хариунд: идэвхтэй багана).
    const registered = viewer?.meetingManagers ? new Set(viewer.meetingManagers) : null;
    const meetingManagers = report?.managers.filter(manager => (registered ? registered.has(manager.name) : manager.inRoster && manager.active)) ?? [];
    const upcomingAt = (meeting: DailyPendingMeeting) => Date.parse(meeting.time) - 5 * 60_000;
    const nextUnlock = Math.min(...(report?.meetings.pendingItems ?? []).map(upcomingAt).filter(at => at > now));
    useEffect(() => {
        if (!Number.isFinite(nextUnlock)) return;
        const timer = setTimeout(() => setNow(Date.now()), Math.min(nextUnlock - Date.now() + 1000, 2_147_000_000));
        return () => clearTimeout(timer);
    }, [nextUnlock]);

    const resetDraft = () => { setDraft({}); setNotesDraft({}); setConflicts([]); setCellBase({}); setNoteBase({}); };
    const goTo = (next: string) => {
        if (dirty) return;
        setDate(next);
        setEditOverride(null);
        resetDraft();
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
        resetDraft();
    };
    const switchMode = (next: 'day' | 'range') => {
        if (dirty || (next === 'range') === ranged) return;
        if (next === 'range') selectRange(shiftDate(date, -6), date);
        else { setDate(to); setRangeTo(null); setEditOverride(null); resetDraft(); }
    };
    const presets = rangePresets(today);
    const cancelEdit = () => { resetDraft(); setEditOverride(false); };

    async function save(extra: { complete?: boolean } = {}) {
        if (!report) return;
        const cells: Array<{ manager: string; metric: string; value: number | null; expected: number | null }> = [];
        const rows = [...report.lines.flatMap(line => line.rows), ...report.chats.rows];
        // Баталгаажуулах/цуцлах нь зөвхөн баталгаажуулалт — ноорогтой хамт явахгүй.
        const confirming = extra.complete !== undefined;
        const dropped: string[] = [];
        if (!confirming) for (const [key, raw] of Object.entries(draft)) {
            const [manager, metric] = key.split('\u0000');
            const row = rows.find(item => item.key === metric);
            // Загвараас хасагдсан үзүүлэлт, засах эрхгүй болсон менежер — дахин дахин 409/403 болохоос сэргийлж хасна.
            if (!row || !editable.has(manager)) { dropped.push(key); continue; }
            const text = raw.trim();
            const value = text === '' ? null : Number(text);
            if (value !== null && (!Number.isInteger(value) || value < 0 || value > DAILY_COUNT_MAX)) {
                toast.error(`Тоо буруу байна: ${formalManagerName(manager)} — ${text === '?' ? 'зөвхөн тоо оруулна' : text}`);
                return;
            }
            // Засаж эхлэхдээ харсан утга — энэ хооронд өөр хүн өөрчилсөн бол сервер 409 буцаана.
            const seen = key in cellBase ? cellBase[key] : row.values[manager] ?? null;
            if (seen !== value) cells.push({ manager, metric, value, expected: seen });
        }
        if (dropped.length) {
            setDraft(current => Object.fromEntries(Object.entries(current).filter(([key]) => !dropped.includes(key))));
            toast.warning(`Тайлангийн загвар эсвэл эрх өөрчлөгдсөн тул ${dropped.length} нүдийг ноорогоос хаслаа.`);
        }
        const notes = confirming ? null : changedNotes(report, notesDraft, noteBase);
        if (!cells.length && !notes && !confirming) {
            cancelEdit();
            toast('Өөрчлөлт алга');
            return;
        }
        setSaving(true);
        try {
            const response = await dashboardFetch('/api/dashboard/daily-report', {
                method: 'PUT',
                body: JSON.stringify({ date, cells, ...(notes ?? {}), ...extra }),
            });
            const body = await response.json().catch(() => null) as DailyReportConflictResponse | null;
            if (response.status === 409) {
                // Ноорог хэвээр; шинэ утгыг уншиж, өөрчлөгдсөн нүдийг жагсаана.
                const list = Array.isArray(body?.conflicts) ? body.conflicts : [];
                setConflicts(list);
                // Засах горим нээлттэй үлдэнэ (дахин уншсаны дараа автомат дүрэм хаахгүй).
                setEditOverride(true);
                // Зөрсөн утгыг хэрэглэгчид харуулсан тул дараагийн хадгалалт түүгээр шалгагдана.
                setCellBase(current => ({ ...current, ...Object.fromEntries(list.flatMap(item => (item.kind === 'count' ? [[cellKey(item.manager, item.metric), item.current ?? null]] : []))) }));
                setNoteBase(current => ({ ...current, ...Object.fromEntries(list.flatMap(item => (item.kind === 'note' ? [[item.key, item.current ?? '']] : []))) }));
                toast.error(body?.error || 'Энэ хооронд өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.');
                await query.refetch();
                return;
            }
            if (!response.ok) throw new Error(body?.error || 'Хадгалж чадсангүй. Дахин оролдоно уу.');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
                queryClient.invalidateQueries({ queryKey: ['daily-report-history'] }),
            ]);
            resetDraft();
            setEditOverride(false);
            toast.success(extra.complete === true ? 'Тайланг баталгаажууллаа' : extra.complete === false ? 'Баталгаажуулалтыг цуцаллаа' : 'Хадгалагдлаа');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй. Дахин оролдоно уу.');
        } finally {
            setSaving(false);
        }
    }

    async function meetingAction(id: string, body: DailyMeetingRequestBody, success: (result: DailyMeetingResponse) => string) {
        setMeetingBusy(id);
        try {
            const result = await dashboardMutate<DailyMeetingResponse>('/api/dashboard/daily-report/meetings', 'POST', body);
            await invalidateDailyMeetingQueries(queryClient);
            toast.success(success(result));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Уулзалтыг хадгалж чадсангүй. Дахин оролдоно уу.');
        } finally {
            setMeetingBusy(null);
        }
    }
    const completeMeeting = (meeting: DailyPendingMeeting, status: 'completed' | 'no_show') => void meetingAction(
        meeting.id, { action: 'complete', date, viewing_id: meeting.id, status },
        () => (status === 'completed' ? `${meeting.customer} — «Болсон» гэж тэмдэглэлээ` : `${meeting.customer} — «Ирээгүй» гэж тэмдэглэлээ`),
    );
    const reassignMeeting = (item: DailyMeetingItem, manager: string) => void meetingAction(
        item.id, { action: 'reassign', date, viewing_id: item.id, manager },
        result => (result.changed === false ? 'Менежер өөрчлөгдөөгүй' : `Уулзалтыг ${formalManagerName(manager)}-д шилжүүллээ`),
    );
    const meetingActions: DailyMeetingActions | null = report && !ranged ? {
        onAdd: canMeet && meetingWindow && meetingManagers.length > 0 ? () => setMeetingOpen(true) : null,
        onComplete: canMeet && meetingWindow ? completeMeeting : null,
        reassign: viewer?.canReassign ? { managers: meetingManagers, onChange: reassignMeeting } : null,
        busy: meetingBusy,
        // Сервер ирээдүйн (≤ одоо + 5 мин-аас хойш) уулзалтыг тэмдэглэхгүй.
        isUpcoming: meeting => upcomingAt(meeting) > now,
        completeUnassigned: !viewer?.personal,
    } : null;

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

    const conflictText = (conflict: DailyReportConflict) => {
        if (conflict.kind === 'note') {
            const label = data?.config ? dailyNoteLabel(data.config, conflict.key) : conflict.key;
            const current = noteText(conflict.key, conflict.current ?? '');
            return `${label}: одоо ${current ? `«${current.length > 80 ? `${current.slice(0, 79)}…` : current}»` : 'хоосон'}`;
        }
        const label = data?.config ? dailyMetricLabel(data.config, conflict.metric) : conflict.metric;
        return `${label} · ${formalManagerName(conflict.manager)}: одоо ${conflict.current ?? '—'}`;
    };
    const notices: Array<{ tone: 'info' | 'warning'; text: ReactNode }> = [];
    if (report && ranged) notices.push({ tone: 'info', text: `${report.days} өдрийн тайланг нэгтгэв: дуудлага, чатын тоо, уулзалт нийлбэрээр. Тоо засах, уулзалт бүртгэх, тэмдэглэл, баталгаажуулалтыг «Өдөр» горимд өдөр тус бүрээр хийнэ.` });
    if (report && to === today) notices.push({ tone: 'info', text: 'Өдөр дуусаагүй — одоогоор бүртгэсэн мэдээллийг харуулж байна.' });
    if (report && viewer?.personal && !ranged) notices.push({ tone: 'info', text: 'Төслийн бүх менежерийн мэдээлэл харагдана. Ээлжийн менежер бүх менежерийн дуудлага, чатын тоог оруулж болно; өөрчлөлт бүр «Түүх»-д хадгалагдана.' });
    if (report && editMode && report.completed) notices.push({ tone: 'warning', text: 'Тайлан баталгаажсан. Өөрчлөлт түүхэд бүртгэгдэнэ.' });
    if (report && editMode && conflicts.length > 0) {
        notices.push({ tone: 'warning', text: <span>Энэ хооронд өөр хүн өөрчилсөн: {conflicts.map(conflictText).join('; ')}. Таны оруулсан утга хэвээр байна — шалгаад дахин «Хадгалах» дарна уу.</span> });
    }
    if (report && report.meetings.pending > 0) {
        notices.push({ tone: 'warning', text: meetingActions?.onComplete
            ? <span>Энэ өдөр товлосон {report.meetings.pending} уулзалтын үр дүн бүртгэгдээгүй тул тайланд ороогүй. Доорх «Товлосон, үр дүн бүртгээгүй» жагсаалтаас «Болсон» эсвэл «Ирээгүй» гэж тэмдэглэнэ үү; шинэ уулзалтыг <Link href="/dashboard/viewings" className="font-medium underline">Уулзалт</Link> хуудаснаас товлоно.</span>
            : <span>{ranged ? 'Энэ хугацаанд' : 'Энэ өдөр'} товлосон {report.meetings.pending} уулзалтын үр дүн бүртгэгдээгүй тул тайланд ороогүй. <Link href="/dashboard/viewings" className="font-medium underline">Уулзалт</Link> хуудсанд «Болсон» гэж тэмдэглэнэ үү.</span> });
    }
    if (report && report.missing.length > 0) notices.push({ tone: 'warning', text: `${ranged ? 'Энэ хугацаанд тоо огт оруулаагүй' : 'Тоо оруулаагүй'}: ${report.missing.join(', ')}.` });
    if (data?.configInvalid) notices.push({ tone: 'warning', text: 'Хадгалсан загвар уншигдсангүй — анхдагч загварыг харуулж байна. «Загвар»-аас дахин хадгална уу.' });
    if (data && !data.configSaved && canConfigure) notices.push({ tone: 'info', text: 'Энэ төслийн загварыг тохируулаагүй байна. «Загвар» товчоор утасны шугам, чатын суваг, менежерийн баганаа тохируулна уу.' });

    return (
        <div className="mx-auto max-w-[1180px] space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-tight">Өдрийн тайлан</h1>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        Ээлжийн менежер багийн дуудлага, чатын тоог оруулж, хамт олныхоо уулзалтыг бүртгэнэ; уулзалт «Уулзалт» хуудаснаас мөн автоматаар орно. Өөрчлөлт бүр түүхэд хадгалагдана.
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
                        {editable.size > 0 && report && <Button variant="secondary" onClick={() => setEditOverride(true)}><PencilLine />{viewer?.personal ? 'Тоо оруулах' : 'Засах'}</Button>}
                        {canConfigure && <Button variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 />Загвар</Button>}
                        {report && !ranged && <Button variant="ghost" onClick={() => setHistoryOpen(true)}><History />Түүх</Button>}
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
                    Таны нэр энэ төслийн борлуулалтын менежерийн бүртгэлд холбогдоогүй байна. Админ бүртгэлд холбосны дараа энд тоо оруулна.
                </p>
            ) : (
                <article className="daily-report min-w-0 bg-background">
                    <DailyReportDocument report={report} meetings={meetingActions} editing={editMode ? {
                        editable,
                        own,
                        draft,
                        onCell: (manager, metric, value) => {
                            const key = cellKey(manager, metric);
                            // Засаж эхэлмэгц горимыг тогтооно; харсан утгыг `expected`-д хадгална.
                            setEditOverride(current => current ?? true);
                            if (!(key in cellBase)) {
                                const seen = [...report.lines.flatMap(line => line.rows), ...report.chats.rows].find(row => row.key === metric)?.values[manager] ?? null;
                                setCellBase(base => (key in base ? base : { ...base, [key]: seen }));
                            }
                            setDraft(current => ({ ...current, [key]: value }));
                        },
                        notes: viewer?.canEditTeam ? mergedNotes(report, notesDraft) : null,
                        onNotes: next => {
                            const current = mergedNotes(report, notesDraft);
                            const touched = notesEntries(next).filter(([key, value]) => value !== noteOf(current, key));
                            if (!touched.length) return;
                            setEditOverride(mode => mode ?? true);
                            const shown = savedNotes(report);
                            setNoteBase(base => ({ ...Object.fromEntries(touched.map(([key]) => [key, noteOf(shown, key)])), ...base }));
                            setNotesDraft(patch => ({ ...patch, ...Object.fromEntries(touched) }));
                        },
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
            {report && historyOpen && <DailyReportHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} date={date} />}
            {report && meetingOpen && (
                <DailyMeetingDialog open={meetingOpen} onOpenChange={setMeetingOpen} date={date} today={today} managers={meetingManagers} defaultManager={own} />
            )}
        </div>
    );
}
