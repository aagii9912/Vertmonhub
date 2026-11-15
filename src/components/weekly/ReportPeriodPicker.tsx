'use client';

import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { reportRangeDays, resolveReportRange, type ReportRange } from '@/lib/dashboard/report-range';

/**
 * Лхагвын тайлангийн тайлант хугацаа (борлуулалтын алба, 2026-11-15): анхдагч нь хурлын өмнөх Лхагва–Мягмар,
 * календараас эхлэх, дуусах өдрийг сонгоно (`resolveReportRange` — API-тай нэг дүрэм). Зөв хугацаа шууд хэрэгжинэ;
 * буруу үед (эхлэх > дуусах, 92 хоногоос урт, хурлын өдрөөс хойш) тайлан өмнөх хугацаагаараа үлдэж, шалтгаан нь доор
 * бичигдэнэ — хоёр өдрийг ээлжлэн өөрчлөх завсрын төлөвийг алдаагаар тасалдуулахгүй. `onChange(null)` = анхдагч 7 хоног.
 */
export function ReportPeriodPicker({ meetingDate, range, custom, disabled, note, onChange }: {
    meetingDate: string;
    /** Одоо хэрэгжиж буй хугацаа (анхдагч эсвэл сонгосон). */
    range: ReportRange;
    custom: boolean;
    disabled?: boolean;
    /** Хугацааны доорх нэмэлт тайлбар (жишээ нь маркетингийн хэсэг хурлын 7 хоногоор). */
    note?: string | null;
    onChange: (range: ReportRange | null) => void;
}) {
    const statusId = useId();
    const [draft, setDraft] = useState(range);
    const [applied, setApplied] = useState(range);
    // Хурал солих, «Лхагва–Мягмар» товч зэргээр гаднаас өөрчлөгдвөл ноорог дагана (render үеийн тохируулга).
    if (applied.from !== range.from || applied.to !== range.to) {
        setApplied(range);
        setDraft(range);
    }
    const checked = resolveReportRange(meetingDate, draft.from, draft.to);
    const error = checked.ok ? null : checked.error;

    function change(next: ReportRange) {
        setDraft(next);
        const result = resolveReportRange(meetingDate, next.from, next.to);
        if (result.ok && (result.range.from !== range.from || result.range.to !== range.to)) onChange(result.custom ? result.range : null);
    }

    const input = 'mt-1 block rounded-md border border-control bg-surface px-3 py-2 text-sm text-foreground tabular-nums focus-ring disabled:opacity-60';
    const status = error
        ? `${error} Тайлан ${range.from} — ${range.to} хугацаагаар хэвээр.`
        : custom ? `Сонгосон хугацаа · ${reportRangeDays(range)} хоног` : 'Анхдагч: хурлын өмнөх Лхагва–Мягмар';
    return <div className="min-w-0">
        <div role="group" aria-label="Тайлант хугацаа" aria-describedby={statusId} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">Тайлант хугацаа: эхлэх
                <input type="date" value={draft.from} max={meetingDate} disabled={disabled} aria-invalid={!!error || undefined}
                    onChange={event => change({ ...draft, from: event.target.value })} className={input} />
            </label>
            <label className="text-xs text-muted-foreground">дуусах
                <input type="date" value={draft.to} max={meetingDate} disabled={disabled} aria-invalid={!!error || undefined}
                    onChange={event => change({ ...draft, to: event.target.value })} className={input} />
            </label>
            {custom && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}><RotateCcw />Лхагва–Мягмар болгох</Button>}
        </div>
        <p id={statusId} aria-live="polite" className={cn('mt-1 text-xs', error ? 'text-status-danger' : 'text-muted-foreground')}>
            {status}{note && !error ? ` ${note}` : ''}
        </p>
    </div>;
}
