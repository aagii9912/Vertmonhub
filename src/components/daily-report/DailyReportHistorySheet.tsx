'use client';

import { useState } from 'react';
import { ArrowRight, History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { useDailyReportHistory } from '@/hooks/useDailyReport';
import { changeTime } from '@/components/daily-report/DailyReportDocument';
import { reportDateLabel, type DailyReportChange } from '@/lib/dashboard/daily-report';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/Sheet';

/** Уулзалтын үйлдлийн нэр (`meta.action`). */
export const DAILY_MEETING_ACTION_LABEL: Record<string, string> = {
    record: 'Уулзалт бүртгэв',
    complete: 'Болсон гэж тэмдэглэв',
    no_show: 'Ирээгүй гэж тэмдэглэв',
    reassign: 'Менежер солив',
};

const empty = '—';
const clip = (text: string | null, max = 120) => {
    const value = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return empty;
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

/** Мөрийн «хуучин → шинэ» хэсэг; баталгаажуулалт, уулзалтад өөрийн тайлбартай. */
function changeValues(change: DailyReportChange): { old: string | null; next: string; action: string | null } {
    if (change.kind === 'count') return { old: change.old === null ? empty : String(change.old), next: change.new === null ? empty : String(change.new), action: null };
    if (change.kind === 'note') return { old: clip(change.oldText), next: clip(change.newText), action: null };
    if (change.kind === 'complete') {
        return change.newText
            ? { old: null, next: change.newText, action: 'Баталгаажуулав' }
            : { old: null, next: change.oldText || empty, action: 'Баталгаажуулалт цуцлав' };
    }
    const action = (change.action && DAILY_MEETING_ACTION_LABEL[change.action]) || 'Уулзалт';
    if (change.action === 'reassign') return { old: change.oldText || empty, next: change.newText || empty, action };
    return { old: null, next: clip(change.newText), action };
}

/**
 * «Түүх» — тухайн өдрийн «Өдрийн тайлан»-гийн өөрчлөлт (хэн, хэзээ, хуучин → шинэ), шинэ нь эхэнд.
 * Тоо, тэмдэглэлийн сүүлийн өөрчлөлтийг «Сэргээх»-ээр буцааж болно (сервер эрх, зөрчлийг дахин шалгана).
 */
export function DailyReportHistorySheet({ open, onOpenChange, date }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    date: string;
}) {
    const queryClient = useQueryClient();
    const history = useDailyReportHistory(date, open);
    const [restoring, setRestoring] = useState<number | null>(null);
    const changes = history.data?.date === date ? history.data.changes : [];

    async function restore(change: DailyReportChange) {
        setRestoring(change.id);
        try {
            await dashboardMutate('/api/dashboard/daily-report/history', 'POST', { changeId: change.id });
            toast.success('Өмнөх утгыг сэргээлээ');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Өөрчлөлтийг сэргээж чадсангүй. Дахин оролдоно уу.');
        } finally {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
                queryClient.invalidateQueries({ queryKey: ['daily-report-history'] }),
            ]);
            setRestoring(null);
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Өөрчлөлтийн түүх</SheetTitle>
                    <SheetDescription>
                        <span className="num">{reportDateLabel(date)}</span> — тоо, тэмдэглэл, баталгаажуулалт, уулзалтын өөрчлөлт (шинэ нь эхэнд). Буруу оруулсан тоог «Сэргээх»-ээр буцаана.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {history.isPending ? (
                        <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
                    ) : history.isError && !history.data ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">
                            Түүхийг ачаалж чадсангүй. {history.error?.message}
                            <Button size="sm" variant="secondary" disabled={history.isFetching} onClick={() => void history.refetch()}>Дахин оролдох</Button>
                        </div>
                    ) : changes.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground">
                            <History className="size-5" aria-hidden />
                            Энэ өдөр өөрчлөлт бүртгэгдээгүй байна.
                        </div>
                    ) : (
                        <ol className="divide-y divide-border rounded-xl border border-border" aria-label="Өөрчлөлтүүд">
                            {changes.map(change => {
                                const values = changeValues(change);
                                return (
                                    <li key={change.id} className="grid gap-1 px-4 py-3 text-sm">
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <span className="num text-xs text-muted-foreground">{changeTime(change.at, date)}</span>
                                            <span className="font-medium">{change.by || empty}</span>
                                            {change.restoredFrom !== null && <Badge variant="info">Сэргээсэн</Badge>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-fg-2">{change.label}{change.managerTitle ? ` · ${change.managerTitle}` : ''}</span>
                                            {values.action && <span className="text-fg-2">— {values.action}</span>}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                {values.old !== null && <>
                                                    <span className="num text-muted-foreground line-through decoration-muted-foreground/60">{values.old}</span>
                                                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="sr-only">→</span>
                                                </>}
                                                <span className="num font-medium">{values.next}</span>
                                            </span>
                                            {change.restorable && (
                                                <Button variant="secondary" size="sm" disabled={restoring !== null}
                                                    aria-label={`Сэргээх: ${change.label}${change.managerTitle ? ` · ${change.managerTitle}` : ''}`}
                                                    onClick={() => void restore(change)}>
                                                    <RotateCcw />{restoring === change.id ? 'Сэргээж байна…' : 'Сэргээх'}
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
