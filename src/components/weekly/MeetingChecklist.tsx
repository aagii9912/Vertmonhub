'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checklistProgress, type ChecklistStatus, type ChecklistStep } from '@/lib/dashboard/meeting-checklist';

const ICON: Record<ChecklistStatus, { icon: typeof Circle; className: string; label: string }> = {
    done: { icon: CheckCircle2, className: 'text-status-success', label: 'Бэлэн' },
    warn: { icon: AlertTriangle, className: 'text-status-pending', label: 'Дутуу' },
    todo: { icon: Circle, className: 'text-status-danger', label: 'Хийгээгүй' },
    check: { icon: CircleDashed, className: 'text-muted-foreground', label: 'Шалгах' },
};

/** Лхагвагийн хурлын бэлтгэл: борлуулалт, маркетинг тус бүрийн алхам, өгөгдлөөс автоматаар шалгасан. */
export function MeetingChecklist({ tracks }: { tracks: { id: string; title: string; who: string; steps: ChecklistStep[]; action: ReactNode }[] }) {
    if (!tracks.length) return null;
    return (
        <details open className="group rounded-2xl border border-border p-5 print:hidden">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 rounded-md focus-ring">
                <span>
                    <span className="text-base font-semibold tracking-tight">Хурлын бэлтгэл — алхам алхмаар</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Хурлын өмнө алхмуудыг дарааллаар нь хийвэл слайд бүрэн гарна. Төлвийг Hub өөрөө шалгана.</span>
                </span>
                <span className="text-xs text-brand-strong group-open:hidden">Харах</span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">Нуух</span>
            </summary>
            <div className={cn('mt-5 grid gap-8', tracks.length > 1 && 'lg:grid-cols-2')}>
                {tracks.map(track => <Track key={track.id} {...track} />)}
            </div>
        </details>
    );
}

function Track({ id, title, who, steps, action }: { id: string; title: string; who: string; steps: ChecklistStep[]; action: ReactNode }) {
    const { done, total } = checklistProgress(steps);
    return (
        <section aria-labelledby={`checklist-${id}`} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
                <h3 id={`checklist-${id}`} className="text-sm font-semibold">{title}<span className="ml-2 text-xs font-normal text-muted-foreground">{who}</span></h3>
                <span className="num text-xs text-muted-foreground">{done}/{total} бэлэн</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${title} бэлтгэл`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <div className="h-full rounded-full bg-status-success transition-[width]" style={{ width: `${total ? done / total * 100 : 0}%` }} />
            </div>
            <ol className="mt-4 space-y-3">
                {steps.map((step, index) => {
                    const { icon: Icon, className, label } = ICON[step.status];
                    const name = step.href
                        ? <Link href={step.href} className="font-medium hover:underline focus-ring">{step.title}</Link>
                        : <span className="font-medium">{step.title}</span>;
                    return (
                        <li key={step.id} className="flex gap-3 text-sm">
                            <span className="num w-4 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">{index + 1}</span>
                            <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-label={label} />
                            <div className="min-w-0">
                                <p>{name}{step.optional && <span className="ml-2 text-xs text-muted-foreground">заавал биш</span>}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                            </div>
                        </li>
                    );
                })}
                <li className="flex items-center gap-3 pl-7">{action}</li>
            </ol>
        </section>
    );
}
