'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatTime, formatShortDate } from '@/lib/utils/date';
import type { MyStatsTask } from '@/hooks/useMyStats';
import { ArrowUpRight, Check, CheckCircle2, ListChecks, ListTodo, Phone, Eye } from 'lucide-react';

/**
 * «Хийх ажлууд» — өнөөдөр/хоцорсон follow-up + өнөөдрийн уулзалт + хувийн
 * ажлууд (user_tasks), dueAt-аар эрэмбэлэгдсэн (my-stats API бэлтгэнэ).
 * Хувийн ажлыг виджетээс шууд ✓ дарж дуусгаж болно.
 */
export function MyTasksWidget({ tasks }: { tasks: MyStatsTask[] }) {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    const [completingId, setCompletingId] = useState<string | null>(null);

    const completePersonal = async (e: React.MouseEvent, task: MyStatsTask) => {
        e.preventDefault();
        e.stopPropagation();
        if (completingId) return;
        setCompletingId(task.id);
        try {
            const res = await fetch(`/api/dashboard/tasks/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-shop-id': shop?.id || '' },
                body: JSON.stringify({ status: 'done' }),
            });
            if (!res.ok) throw new Error();
            toast.success('Ажил дууслаа — сарын тайланд орно 🎉');
            queryClient.invalidateQueries({ queryKey: ['my-stats'] });
            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        } catch {
            toast.error('Дуусгаж чадсангүй');
        } finally {
            setCompletingId(null);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <ListTodo className="w-4 h-4 md:w-5 md:h-5 text-brand" />
                    Хийх ажлууд
                </CardTitle>
                <div className="flex items-center gap-3">
                    {tasks.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length} ажил</span>
                    )}
                    <Link
                        href="/dashboard/tasks"
                        className="text-xs text-brand hover:text-brand-strong inline-flex items-center gap-0.5"
                    >
                        Бүгд
                        <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                    {tasks.length > 0 ? (
                        tasks.map((task) => {
                            const Icon =
                                task.type === 'viewing' ? Eye : task.type === 'personal' ? ListChecks : Phone;
                            const isToday = !task.overdue || task.type === 'viewing';
                            return (
                                <Link
                                    key={`${task.type}-${task.id}`}
                                    href={task.href}
                                    className="px-4 md:px-6 py-3 flex items-center justify-between gap-3 hover:bg-surface-2/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div
                                            className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                                task.overdue
                                                    ? 'bg-status-danger-soft text-status-danger'
                                                    : task.type === 'viewing'
                                                      ? 'bg-status-info-soft text-status-info'
                                                      : task.type === 'personal'
                                                        ? 'bg-status-success-soft text-status-success'
                                                        : 'bg-brand-soft text-brand-strong'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm text-foreground truncate">{task.title}</p>
                                            <p className="text-xs text-muted-foreground truncate">{task.subtitle}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {isToday ? formatTime(task.dueAt) : formatShortDate(task.dueAt)}
                                        </span>
                                        {task.overdue && <StatusPill variant="danger">Хоцорсон</StatusPill>}
                                        {task.type === 'personal' && (
                                            <button
                                                onClick={(e) => completePersonal(e, task)}
                                                disabled={completingId === task.id}
                                                title="Дуусгах"
                                                aria-label={`«${task.title}» ажлыг дуусгах`}
                                                className="w-7 h-7 rounded-md border border-border-strong flex items-center justify-center text-muted-foreground hover:border-brand hover:text-brand hover:bg-brand-soft transition-colors disabled:opacity-50"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </Link>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={<CheckCircle2 className="w-7 h-7" />}
                            title="Өнөөдөр хийх ажил алга"
                            description="Follow-up, уулзалт болон хувийн ажлууд энд харагдана"
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
