'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatTime, formatShortDate } from '@/lib/utils/date';
import type { MyStatsTask } from '@/hooks/useMyStats';
import { CheckCircle2, ListTodo, Phone, Eye } from 'lucide-react';

/**
 * «Хийх ажлууд» — өнөөдөр/хоцорсон follow-up + өнөөдрийн уулзалтууд
 * (dueAt-аар эрэмбэлэгдсэн, my-stats API бэлтгэнэ).
 */
export function MyTasksWidget({ tasks }: { tasks: MyStatsTask[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <ListTodo className="w-4 h-4 md:w-5 md:h-5 text-brand" />
                    Хийх ажлууд
                </CardTitle>
                {tasks.length > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">{tasks.length} ажил</span>
                )}
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                    {tasks.length > 0 ? (
                        tasks.map((task) => {
                            const Icon = task.type === 'viewing' ? Eye : Phone;
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
                                    </div>
                                </Link>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={<CheckCircle2 className="w-7 h-7" />}
                            title="Өнөөдөр хийх ажил алга"
                            description="Follow-up болон өнөөдрийн уулзалтууд энд харагдана"
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
