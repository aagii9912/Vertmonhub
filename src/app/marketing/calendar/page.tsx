'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CalendarDays, Check, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { ContentItemDialog } from '@/components/marketing/ContentItemDialog';
import { CONTENT_STATUS_LABEL, summarizeContentPlan, type ContentItem } from '@/lib/marketing/content-plan';
import { ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';

/** Локал календарийн `YYYY-MM-DD` (toISOString нь UTC руу шилжиж УБ-д нэг өдөр хасдаг). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Маркетингийн албаны өөрийн төлөвлөгөө: контент бүрийн огноо, төлөв, хариуцагч, постер. */
export default function CalendarPage() {
    const { user } = useAuth();
    const { canWrite } = useModuleAccess();
    const queryClient = useQueryClient();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [editing, setEditing] = useState<ContentItem | { date: string } | null>(null);
    const writable = canWrite('marketing-roi');
    const deletable = user?.role === 'super_admin' || (!!user?.permissions?.canDelete && writable);

    const startOfMonth = ymd(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const endOfMonth = ymd(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    // Сар солиход өмнөх сарын мөрүүд түр үлдэнэ (шинэ сарын өдрүүдтэй таарахгүй тул нүдэнд гарахгүй) — хуудас бүхэлдээ spinner болж анивчихгүй.
    const { data, isLoading, isPlaceholderData, error, isFetching, refetch } = useDashboardQuery<{ items: ContentItem[] }>(
        ['marketing-calendar', startOfMonth, endOfMonth],
        `/api/marketing/content-plan?from=${startOfMonth}&to=${endOfMonth}`,
        { keepPreviousData: true },
    );
    const items = data?.items ?? [];
    const month = summarizeContentPlan(items, { from: startOfMonth, to: endOfMonth }, ubDateStr());

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const monthName = currentDate.toLocaleDateString('mn-MN', { year: 'numeric', month: 'long' });

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const getItemsForDay = (day: number) => {
        const dateStr = ymd(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
        return items.filter(item => item.scheduled_date === dateStr);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <span className="text-muted-foreground">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Контент календарь"
                subtitle="Маркетингийн албаны контент төлөвлөгөө ба гүйцэтгэл"
                primaryAction={writable ? (
                    <Button onClick={() => setEditing({ date: ymd(new Date()) })}>
                        <Plus className="w-4 h-4" />
                        Шинэ контент
                    </Button>
                ) : undefined}
            />

            <Card>
                <CardContent className="p-4">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-6">
                        <Button variant="ghost" size="iconSm" aria-label="Өмнөх сар" onClick={prevMonth}>
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <h2 className="heading-section flex items-center gap-2 text-lg text-foreground capitalize">
                            {monthName}
                            {isPlaceholderData && <Spinner size="sm" label="Сарын контент ачаалж байна" />}
                        </h2>
                        <Button variant="ghost" size="iconSm" aria-label="Дараах сар" onClick={nextMonth}>
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    {error && !data ? (
                        <Alert variant="danger">
                            <AlertTitle>Контент календарь татахад алдаа гарлаа</AlertTitle>
                            <AlertDescription>{error.message}</AlertDescription>
                            <Button variant="secondary" size="sm" className="mt-1 self-start" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                        </Alert>
                    ) : (
                        <>
                            {!isPlaceholderData && month.planned > 0 && <p className="mb-4 text-sm text-fg-2" aria-label="Сарын гүйцэтгэл">
                                Төлөвлөсөн <strong className="num">{month.planned}</strong> · Нийтэлсэн <strong className="num">{month.published}</strong>{month.pct !== null ? ` (${month.pct}%)` : ''}
                                {month.overdue > 0 && <> · <span className="text-status-danger">Хоцорсон <strong className="num">{month.overdue}</strong></span></>}
                            </p>}
                            {/* Calendar grid */}
                            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                                {['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map(d => (
                                    <div key={d} className="bg-surface-2 p-2 text-center text-2xs font-semibold uppercase tracking-wide text-muted-2">{d}</div>
                                ))}
                                {Array.from({ length: firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 }).map((_, i) => (
                                    <div key={`empty-${i}`} className="bg-surface p-2 min-h-[80px]" />
                                ))}
                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const dayItems = getItemsForDay(day);
                                    const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                                    return (
                                        <div key={day} className={cn('bg-surface p-2 min-h-[80px]', isToday && 'ring-2 ring-brand ring-inset')}>
                                            <span className={cn('text-sm tabular-nums', isToday ? 'font-bold text-brand-strong' : 'text-foreground')}>{day}</span>
                                            <div className="mt-1 space-y-1">
                                                {dayItems.slice(0, 3).map(item => (
                                                    <button key={item.id} type="button" onClick={() => setEditing(item)}
                                                        title={`${item.title} · ${CONTENT_STATUS_LABEL[item.status]}`}
                                                        className={cn('flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs focus-ring', item.status === 'cancelled' && 'line-through opacity-60')}
                                                        style={{ backgroundColor: (item.color || '#3B82F6') + '20', color: item.color || '#3B82F6' }}>
                                                        {item.status === 'published' && <Check className="size-3 shrink-0" aria-label="Нийтэлсэн" />}
                                                        <span className="truncate">{item.title}</span>
                                                    </button>
                                                ))}
                                                {dayItems.length > 3 && <p className="text-xs text-muted-foreground">+{dayItems.length - 3}</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {!isPlaceholderData && items.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 mt-4">
                                    <CalendarDays className="w-12 h-12 text-muted-foreground/60 mb-3" />
                                    <p className="text-muted-foreground">Энэ сард контент төлөвлөгдөөгүй байна</p>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {editing && <ContentItemDialog key={'id' in editing ? editing.id : 'new'} item={'id' in editing ? editing : undefined} defaultDate={'date' in editing ? editing.date : ymd(new Date())}
                canWrite={writable} canDelete={deletable} onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); void queryClient.invalidateQueries({ queryKey: ['marketing-calendar'] }); void queryClient.invalidateQueries({ queryKey: ['content-plan'] }); }} />}
        </div>
    );
}
