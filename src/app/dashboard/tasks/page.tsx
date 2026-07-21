'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { useMyTasks, type UserTask } from '@/hooks/useMyTasks';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatShortDate, formatTime } from '@/lib/utils/date';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import { cn } from '@/lib/utils';
import {
    Bell,
    BellRing,
    Check,
    CheckCircle2,
    ChevronDown,
    FileBarChart,
    ListTodo,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';

/**
 * «Миний ажлууд» — Todoist маягийн секцлэсэн жагсаалт (Хоцорсон / Өнөөдөр /
 * Удахгүй / Хугацаагүй + эвхэгддэг Дууссан), дугуй checkbox, огнооны chip.
 * Дизайны лавлагаа: Mobbin — Todoist Today, Asana My Tasks.
 * Дууссан ажлууд сарын KPI тайланд автоматаар нэгтгэгдэнэ.
 */

const REMIND_OPTIONS = [
    { value: 'none', label: 'Сануулгагүй' },
    { value: '0', label: 'Яг цагт нь' },
    { value: '15', label: '15 минутын өмнө' },
    { value: '60', label: '1 цагийн өмнө' },
    { value: '1440', label: '1 өдрийн өмнө' },
] as const;

function computeRemindAt(dueLocal: string, offset: string): string | null {
    if (!dueLocal || offset === 'none' || offset === 'keep') return null;
    const due = new Date(dueLocal);
    if (Number.isNaN(due.getTime())) return null;
    return new Date(due.getTime() - Number(offset) * 60000).toISOString();
}

function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function matchRemindOffset(task: UserTask): string {
    if (!task.remind_at) return 'none';
    if (!task.due_at) return 'keep';
    const diff = Math.round((new Date(task.due_at).getTime() - new Date(task.remind_at).getTime()) / 60000);
    return ['0', '15', '60', '1440'].includes(String(diff)) ? String(diff) : 'keep';
}

type SectionKey = 'overdue' | 'today' | 'upcoming' | 'noDue';

const SECTION_META: Record<SectionKey, { label: string; tone: string }> = {
    overdue: { label: 'Хоцорсон', tone: 'text-status-danger' },
    today: { label: 'Өнөөдөр', tone: 'text-foreground' },
    upcoming: { label: 'Удахгүй', tone: 'text-foreground' },
    noDue: { label: 'Хугацаагүй', tone: 'text-foreground' },
};

/** Огнооны chip — Todoist маягаар хоцорсон нь улаан, өнөөдрийнх нь brand. */
function DueChip({ task, section }: { task: UserTask; section: SectionKey }) {
    if (!task.due_at) return null;
    const cls =
        section === 'overdue'
            ? 'text-status-danger'
            : section === 'today'
              ? 'text-brand-strong'
              : 'text-muted-foreground';
    return (
        <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', cls)}>
            {section === 'today'
                ? formatTime(task.due_at)
                : `${formatShortDate(task.due_at)} ${formatTime(task.due_at)}`}
        </span>
    );
}

export default function TasksPage() {
    const { data, isLoading, createTask, updateTask, deleteTask } = useMyTasks();
    const { isSupported, permission, subscribe } = usePushNotifications();
    const reduced = useReducedMotion();

    const [showDone, setShowDone] = useState(false);

    // Шинэ ажлын форм
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [showNote, setShowNote] = useState(false);
    const [dueLocal, setDueLocal] = useState('');
    const [remindOffset, setRemindOffset] = useState('none');

    // Засварын dialog
    const [editing, setEditing] = useState<UserTask | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editDueLocal, setEditDueLocal] = useState('');
    const [editRemindOffset, setEditRemindOffset] = useState('none');

    const tasks = useMemo(() => data?.tasks || [], [data]);

    const sections = useMemo(() => {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const pending = tasks.filter((t) => t.status === 'pending');
        const byDue = (t: UserTask) => new Date(t.due_at!).getTime();
        const out: Record<SectionKey, UserTask[]> = {
            overdue: pending.filter((t) => t.due_at && new Date(t.due_at) < dayStart).sort((a, b) => byDue(a) - byDue(b)),
            today: pending
                .filter((t) => t.due_at && new Date(t.due_at) >= dayStart && new Date(t.due_at) < dayEnd)
                .sort((a, b) => byDue(a) - byDue(b)),
            upcoming: pending.filter((t) => t.due_at && new Date(t.due_at) >= dayEnd).sort((a, b) => byDue(a) - byDue(b)),
            noDue: pending.filter((t) => !t.due_at),
        };
        return out;
    }, [tasks]);

    const done = useMemo(
        () =>
            tasks
                .filter((t) => t.status === 'done')
                .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime()),
        [tasks],
    );

    const doneToday = useMemo(() => {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        return done.filter((t) => t.completed_at && new Date(t.completed_at) >= dayStart).length;
    }, [done]);

    const pendingCount = sections.overdue.length + sections.today.length + sections.upcoming.length + sections.noDue.length;
    const todayScope = sections.overdue.length + sections.today.length + doneToday;
    const todayPct = todayScope > 0 ? Math.round((doneToday / todayScope) * 100) : null;

    const submitNew = () => {
        const trimmed = title.trim();
        if (!trimmed) return;
        createTask.mutate(
            {
                title: trimmed,
                note: note.trim() || null,
                dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
                remindAt: computeRemindAt(dueLocal, remindOffset),
            },
            {
                onSuccess: () => {
                    setTitle('');
                    setNote('');
                    setShowNote(false);
                    setDueLocal('');
                    setRemindOffset('none');
                },
                onError: (e) => toast.error(e.message),
            },
        );
    };

    const toggleDone = (task: UserTask) => {
        updateTask.mutate(
            { id: task.id, status: task.status === 'done' ? 'pending' : 'done' },
            {
                onSuccess: () =>
                    task.status === 'pending'
                        ? toast.success('Ажил дууслаа — сарын тайланд орно 🎉')
                        : undefined,
                onError: (e) => toast.error(e.message),
            },
        );
    };

    const removeTask = (task: UserTask) => {
        if (!window.confirm(`«${task.title}» ажлыг устгах уу?`)) return;
        deleteTask.mutate(task.id, {
            onSuccess: () => toast.success('Ажил устгагдлаа'),
            onError: (e) => toast.error(e.message),
        });
    };

    const openEdit = (task: UserTask) => {
        setEditing(task);
        setEditTitle(task.title);
        setEditNote(task.note || '');
        setEditDueLocal(toLocalInput(task.due_at));
        setEditRemindOffset(matchRemindOffset(task));
    };

    const submitEdit = () => {
        if (!editing) return;
        const trimmed = editTitle.trim();
        if (!trimmed) return;
        const patch: Parameters<typeof updateTask.mutate>[0] = {
            id: editing.id,
            title: trimmed,
            note: editNote.trim() || null,
            dueAt: editDueLocal ? new Date(editDueLocal).toISOString() : null,
        };
        if (editRemindOffset !== 'keep') {
            patch.remindAt = computeRemindAt(editDueLocal, editRemindOffset);
        }
        updateTask.mutate(patch, {
            onSuccess: () => {
                setEditing(null);
                toast.success('Ажил шинэчлэгдлээ');
            },
            onError: (e) => toast.error(e.message),
        });
    };

    /** Дугуй checkbox — Todoist маягийн мөр. */
    const renderRow = (task: UserTask, section: SectionKey | 'done', index: number) => {
        const isDone = task.status === 'done';
        const hasReminder = !isDone && task.remind_at && new Date(task.remind_at) > new Date();
        return (
            <motion.div
                key={task.id}
                initial={reduced || index > 11 ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index, 11) * 0.03, ease: 'easeOut' }}
                className="group flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-surface-2/60 transition-colors"
            >
                <button
                    onClick={() => toggleDone(task)}
                    aria-label={isDone ? `«${task.title}» буцаах` : `«${task.title}» дуусгах`}
                    className={cn(
                        'mt-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                        isDone
                            ? 'border-status-success bg-status-success text-white'
                            : section === 'overdue'
                              ? 'border-status-danger/60 hover:bg-status-danger/10'
                              : 'border-border-strong hover:border-brand hover:bg-brand-soft',
                    )}
                >
                    <Check
                        className={cn(
                            'w-3 h-3 transition-opacity',
                            isDone ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
                        )}
                        strokeWidth={3}
                    />
                </button>

                <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {task.title}
                    </p>
                    {task.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-2">
                            {task.note}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {isDone ? (
                            task.completed_at && (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {formatShortDate(task.completed_at)}
                                </span>
                            )
                        ) : (
                            <DueChip task={task} section={section as SectionKey} />
                        )}
                        {hasReminder && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Bell className="w-3 h-3" />
                                {formatShortDate(task.remind_at!)} {formatTime(task.remind_at!)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="iconSm" onClick={() => openEdit(task)} title="Засах">
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="iconSm" onClick={() => removeTask(task)} title="Устгах">
                        <Trash2 className="w-3.5 h-3.5 text-status-danger" />
                    </Button>
                </div>
            </motion.div>
        );
    };

    const renderSection = (key: SectionKey) => {
        const list = sections[key];
        if (list.length === 0) return null;
        const meta = SECTION_META[key];
        return (
            <div key={key}>
                <div className="flex items-center gap-2 px-4 md:px-5 pt-4 pb-1.5">
                    <span className={cn('text-2xs font-mono uppercase tracking-[0.16em]', meta.tone)}>
                        {meta.label}
                    </span>
                    <span className="text-2xs text-muted-foreground tabular-nums">{list.length}</span>
                </div>
                <div className="divide-y divide-border/40">{list.map((t, i) => renderRow(t, key, i))}</div>
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader
                eyebrow="Борлуулалт"
                title="Миний ажлууд"
                subtitle={
                    pendingCount > 0
                        ? `${pendingCount} идэвхтэй ажил · өнөөдөр ${doneToday} дуусгасан`
                        : 'Хийх ажлаа бүртгэж, сануулга аваарай — дууссан ажлууд сарын KPI тайланд автоматаар орно'
                }
                secondaryActions={
                    <div className="flex items-center gap-3">
                        {todayPct !== null && (
                            <ProgressRing
                                value={todayPct}
                                size={44}
                                strokeWidth={5}
                                tone={todayPct >= 100 ? 'success' : 'brand'}
                                aria-label={`Өнөөдрийн гүйцэтгэл ${todayPct}%`}
                            >
                                <span className="text-2xs font-medium tabular-nums">{todayPct}%</span>
                            </ProgressRing>
                        )}
                        <Button variant="secondary" size="sm" href="/dashboard/reports/kpi">
                            <FileBarChart className="w-4 h-4 mr-1.5" />
                            Сарын KPI тайлан
                        </Button>
                    </div>
                }
            />

            {data && !data.available && (
                <Alert variant="warning" className="mb-4">
                    <AlertTitle>Хүснэгт үүсээгүй байна</AlertTitle>
                    <AlertDescription>
                        user_tasks миграци (supabase/migrations/20260721120000_user_tasks.sql) хийгдээгүй тул
                        ажлын жагсаалт түр ажиллахгүй. Админд хандана уу.
                    </AlertDescription>
                </Alert>
            )}

            {isSupported && permission !== 'granted' && (
                <Alert variant="info" className="mb-4">
                    <AlertDescription className="flex flex-wrap items-center gap-2 justify-between">
                        <span>Сануулгыг утсан дээрээ push мэдэгдлээр авахын тулд идэвхжүүлнэ үү.</span>
                        <Button variant="secondary" size="sm" onClick={() => subscribe()}>
                            <BellRing className="w-4 h-4 mr-1.5" />
                            Мэдэгдэл идэвхжүүлэх
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Шинэ ажил нэмэх — Todoist маягийн хөнгөн мөр */}
            <Card className="mb-5">
                <CardContent className="py-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-brand flex-shrink-0" />
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNew();
                            }}
                            placeholder="Хийх ажлаа бичээд Enter дарна уу…"
                            aria-label="Шинэ ажлын гарчиг"
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none min-w-0"
                        />
                        <Button size="sm" onClick={submitNew} isLoading={createTask.isPending} disabled={!title.trim()}>
                            Нэмэх
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                        <Input
                            type="datetime-local"
                            value={dueLocal}
                            onChange={(e) => setDueLocal(e.target.value)}
                            className="h-8 w-auto text-xs"
                            aria-label="Дуусах хугацаа"
                        />
                        <Select value={remindOffset} onValueChange={setRemindOffset} disabled={!dueLocal}>
                            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Сануулга">
                                <span className="flex items-center gap-1.5">
                                    <Bell className="size-3.5 text-muted-foreground/70" />
                                    <SelectValue />
                                </span>
                            </SelectTrigger>
                            <SelectContent>
                                {REMIND_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowNote((v) => !v)}>
                            {showNote ? 'Тэмдэглэл хаах' : '+ Тэмдэглэл'}
                        </Button>
                    </div>
                    {showNote && (
                        <div className="pl-6">
                            <Textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Дэлгэрэнгүй тэмдэглэл — ямар ч форматаар…"
                                rows={3}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Секцлэсэн жагсаалт */}
            <Card>
                <CardContent className="p-0 pb-2">
                    {isLoading ? (
                        <div className="p-4">
                            <KpiGridSkeleton />
                        </div>
                    ) : pendingCount > 0 ? (
                        <>
                            {renderSection('overdue')}
                            {renderSection('today')}
                            {renderSection('upcoming')}
                            {renderSection('noDue')}
                        </>
                    ) : (
                        <EmptyState
                            icon={<ListTodo className="w-7 h-7" />}
                            title="Идэвхтэй ажил алга"
                            description="Дээрх талбарт хийх ажлаа нэмээрэй — сануулга тавьбал цагт нь push ирнэ"
                        />
                    )}

                    {/* Дууссан — эвхэгддэг секц */}
                    {done.length > 0 && (
                        <div className="border-t border-border/60 mt-2">
                            <button
                                onClick={() => setShowDone((v) => !v)}
                                className="w-full flex items-center gap-2 px-4 md:px-5 py-3 text-left hover:bg-surface-2/60 transition-colors"
                                aria-expanded={showDone}
                            >
                                <ChevronDown
                                    className={cn(
                                        'w-4 h-4 text-muted-foreground transition-transform',
                                        !showDone && '-rotate-90',
                                    )}
                                />
                                <span className="text-2xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
                                    Дууссан
                                </span>
                                <span className="text-2xs text-muted-foreground tabular-nums">{done.length}</span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-status-success ml-auto" />
                            </button>
                            {showDone && (
                                <div className="divide-y divide-border/40">
                                    {done.slice(0, 50).map((t, i) => renderRow(t, 'done', i))}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Засварын dialog */}
            <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ажил засах</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} aria-label="Гарчиг" />
                        <Textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Тэмдэглэл"
                            rows={3}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                type="datetime-local"
                                value={editDueLocal}
                                onChange={(e) => setEditDueLocal(e.target.value)}
                                className="w-auto"
                                aria-label="Дуусах хугацаа"
                            />
                            <Select value={editRemindOffset} onValueChange={setEditRemindOffset}>
                                <SelectTrigger className="h-10 w-44" aria-label="Сануулга">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {editing && matchRemindOffset(editing) === 'keep' && (
                                        <SelectItem value="keep">Сануулга хэвээр</SelectItem>
                                    )}
                                    {REMIND_OPTIONS.map((o) => (
                                        <SelectItem
                                            key={o.value}
                                            value={o.value}
                                            disabled={o.value !== 'none' && !editDueLocal}
                                        >
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setEditing(null)}>
                            Болих
                        </Button>
                        <Button onClick={submitEdit} isLoading={updateTask.isPending}>
                            Хадгалах
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
