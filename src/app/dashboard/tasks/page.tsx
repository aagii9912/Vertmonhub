'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
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
import { formatShortDate, formatTime } from '@/lib/utils/date';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import {
    Bell,
    BellRing,
    CalendarClock,
    CheckCircle2,
    FileBarChart,
    ListTodo,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';

/**
 * «Миний ажлууд» — хувийн хийх ажлын бүртгэл (чөлөөт формат) + сануулга.
 * Дууссан ажлууд сарын KPI тайланд (/dashboard/reports/kpi) автоматаар
 * «Хийсэн ажлууд» болж нэгтгэгдэнэ — сар бүр гараар санаж бичих шаардлагагүй.
 */

const REMIND_OPTIONS = [
    { value: 'none', label: 'Сануулгагүй' },
    { value: '0', label: 'Яг цагт нь' },
    { value: '15', label: '15 минутын өмнө' },
    { value: '60', label: '1 цагийн өмнө' },
    { value: '1440', label: '1 өдрийн өмнө' },
] as const;

/** due (datetime-local утга) + офсет минутаас remind_at ISO гаргана. */
function computeRemindAt(dueLocal: string, offset: string): string | null {
    if (!dueLocal || offset === 'none' || offset === 'keep') return null;
    const due = new Date(dueLocal);
    if (Number.isNaN(due.getTime())) return null;
    return new Date(due.getTime() - Number(offset) * 60000).toISOString();
}

/** ISO огноог datetime-local input-ийн локал форматад хөрвүүлнэ. */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** remind_at/due_at хосоос тохирох офсет сонголтыг олно (таарахгүй бол 'keep'). */
function matchRemindOffset(task: UserTask): string {
    if (!task.remind_at) return 'none';
    if (!task.due_at) return 'keep';
    const diff = Math.round((new Date(task.due_at).getTime() - new Date(task.remind_at).getTime()) / 60000);
    return ['0', '15', '60', '1440'].includes(String(diff)) ? String(diff) : 'keep';
}

function DueBadge({ dueAt }: { dueAt: string | null }) {
    if (!dueAt) return null;
    const due = new Date(dueAt);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    if (due < dayStart) return <StatusPill variant="danger">Хоцорсон · {formatShortDate(dueAt)}</StatusPill>;
    if (due < dayEnd) return <StatusPill variant="info">Өнөөдөр {formatTime(dueAt)}</StatusPill>;
    return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <CalendarClock className="w-3.5 h-3.5" />
            {formatShortDate(dueAt)} {formatTime(dueAt)}
        </span>
    );
}

export default function TasksPage() {
    const { data, isLoading, createTask, updateTask, deleteTask } = useMyTasks();
    const { isSupported, permission, subscribe } = usePushNotifications();

    const [tab, setTab] = useState<'pending' | 'done'>('pending');

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
    const pending = useMemo(() => {
        const withDue = tasks
            .filter((t) => t.status === 'pending' && t.due_at)
            .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
        const withoutDue = tasks.filter((t) => t.status === 'pending' && !t.due_at);
        return [...withDue, ...withoutDue];
    }, [tasks]);
    const done = useMemo(
        () =>
            tasks
                .filter((t) => t.status === 'done')
                .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime()),
        [tasks],
    );

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
                    toast.success('Ажил нэмэгдлээ');
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
        // 'keep' = сануулгын тохиргоог хөндөхгүй
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

    const renderRow = (task: UserTask) => (
        <div
            key={task.id}
            className="px-4 md:px-6 py-3 flex items-start gap-3 hover:bg-surface-2/60 transition-colors group"
        >
            <Checkbox
                checked={task.status === 'done'}
                onCheckedChange={() => toggleDone(task)}
                aria-label={task.status === 'done' ? 'Буцаах' : 'Дуусгах'}
                className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
                <p
                    className={`text-sm font-medium ${
                        task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                >
                    {task.title}
                </p>
                {task.note && (
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-2">
                        {task.note}
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {task.status === 'done' ? (
                        task.completed_at && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                                Дууссан: {formatShortDate(task.completed_at)}
                            </span>
                        )
                    ) : (
                        <DueBadge dueAt={task.due_at} />
                    )}
                    {task.status === 'pending' && task.remind_at && new Date(task.remind_at) > new Date() && (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-strong">
                            <Bell className="w-3.5 h-3.5" />
                            {formatShortDate(task.remind_at)} {formatTime(task.remind_at)}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="iconSm" onClick={() => openEdit(task)} title="Засах">
                    <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => removeTask(task)} title="Устгах">
                    <Trash2 className="w-4 h-4 text-status-danger" />
                </Button>
            </div>
        </div>
    );

    const list = tab === 'pending' ? pending : done;

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader
                eyebrow="Борлуулалт"
                title="Миний ажлууд"
                subtitle="Хийх ажлаа чөлөөт форматаар бүртгэж, сануулга аваарай — дууссан ажлууд сарын KPI тайланд автоматаар орно"
                secondaryActions={
                    <Button variant="secondary" size="sm" href="/dashboard/reports/kpi">
                        <FileBarChart className="w-4 h-4 mr-1.5" />
                        Сарын KPI тайлан
                    </Button>
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

            {/* Шинэ ажил нэмэх */}
            <Card className="mb-6">
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNew();
                            }}
                            placeholder="Хийх ажлаа бичээд Enter дарна уу…"
                            aria-label="Шинэ ажлын гарчиг"
                        />
                        <Button onClick={submitNew} isLoading={createTask.isPending} disabled={!title.trim()}>
                            <Plus className="w-4 h-4 md:mr-1.5" />
                            <span className="hidden md:inline">Нэмэх</span>
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            type="datetime-local"
                            value={dueLocal}
                            onChange={(e) => setDueLocal(e.target.value)}
                            className="w-auto"
                            aria-label="Дуусах хугацаа"
                        />
                        <Select
                            value={remindOffset}
                            onValueChange={setRemindOffset}
                            disabled={!dueLocal}
                        >
                            <SelectTrigger className="h-10 w-44" aria-label="Сануулга">
                                <span className="flex items-center gap-2">
                                    <Bell className="size-4 text-muted-foreground/70" />
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
                        <Button variant="ghost" size="sm" onClick={() => setShowNote((v) => !v)}>
                            {showNote ? 'Тэмдэглэл хаах' : '+ Тэмдэглэл'}
                        </Button>
                    </div>
                    {showNote && (
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Дэлгэрэнгүй тэмдэглэл — ямар ч форматаар…"
                            rows={3}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Жагсаалт */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'done')}>
                <TabsList>
                    <TabsTrigger value="pending">
                        Идэвхтэй {pending.length > 0 && <span className="ml-1 tabular-nums">({pending.length})</span>}
                    </TabsTrigger>
                    <TabsTrigger value="done">
                        Дууссан {done.length > 0 && <span className="ml-1 tabular-nums">({done.length})</span>}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <Card className="mt-4">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4">
                            <KpiGridSkeleton />
                        </div>
                    ) : list.length > 0 ? (
                        <div className="divide-y divide-border/60">{list.map(renderRow)}</div>
                    ) : tab === 'pending' ? (
                        <EmptyState
                            icon={<ListTodo className="w-7 h-7" />}
                            title="Идэвхтэй ажил алга"
                            description="Дээрх талбарт хийх ажлаа нэмээрэй — сануулга тавьбал цагт нь push ирнэ"
                        />
                    ) : (
                        <EmptyState
                            icon={<CheckCircle2 className="w-7 h-7" />}
                            title="Дууссан ажил алга"
                            description="Дуусгасан ажлууд энд хадгалагдаж, сарын KPI тайланд автоматаар орно"
                        />
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
                        <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            aria-label="Гарчиг"
                        />
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
                                        <SelectItem key={o.value} value={o.value} disabled={o.value !== 'none' && !editDueLocal}>
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
