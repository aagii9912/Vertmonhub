'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ubDateStr } from '@/lib/utils/date';
import { useManagerActivity } from '@/hooks/useManagerActivity';
import {
    ACTIVITY_GROUP_LABEL, ACTIVITY_GROUPS, attainmentTone, periodBounds, periodLabel, shiftPeriod,
    type ActivityGroup, type ActivityRow, type ManagerActivity,
} from '@/lib/sales/activity';
import { Button } from '@/components/ui/Button';
import { Pill, Skeleton } from '@/components/dashboard/v2/primitives';

/** Сонгосон хугацааг ямар нарийвчлалаар задлах (өдөр → өдөр, 7 хоног → өдөр, сар → 7 хоног). */
const BREAKDOWN: Record<ActivityGroup, ActivityGroup> = { day: 'day', week: 'day', month: 'week' };
const pad = (value: number) => String(value).padStart(2, '0');

function initialAnchor(year: number, month: number, today: string): string {
    const prefix = `${year}-${pad(month)}`;
    if (today.startsWith(prefix)) return today;
    const last = periodBounds(`${prefix}-01`, 'month').to;
    return last < today ? last : `${prefix}-01`;
}

/**
 * «Өдөр тутмын идэвх» — менежерийн дуудлага (CRM), болсон уулзалт, санал хүсэлтийн шийдвэрлэлтийг
 * өдрийн зорилттой харьцуулна (KPI v2-ийн өдрийн давхарга). Удирдлага багаар, менежер зөвхөн өөрийгөө.
 */
export function ManagerActivityCard({ year, month, manager }: { year: number; month: number; manager: string | null }) {
    const today = ubDateStr();
    const [group, setGroup] = useState<ActivityGroup>(() => today.startsWith(`${year}-${pad(month)}`) ? 'week' : 'month');
    const [anchor, setAnchor] = useState(() => initialAnchor(year, month, today));
    const [picked, setPicked] = useState<string | null>(null);
    const bounds = periodBounds(anchor, group);
    const to = bounds.to < today ? bounds.to : today < bounds.from ? bounds.from : today;
    const query = useManagerActivity({ from: bounds.from, to, group: BREAKDOWN[group] });
    const data = query.data;

    const selectedName = data?.personal ? data.managers[0]?.manager : picked ?? manager;
    const selected = data?.managers.find(row => row.manager === selectedName) ?? null;
    const unattributed = data?.unattributed;

    return (
        <section className="mb-6 space-y-4 rounded-2xl border border-border bg-surface p-5 print:border-0 print:p-0" role="region" aria-label="Өдөр тутмын идэвх">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">Өдөр тутмын идэвх · {periodLabel(bounds.from, bounds.to, group)}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        CRM-д бүртгэсэн дуудлага, болсон уулзалт, санал хүсэлтийн шийдвэрлэлт. Зорилт = өдрийн зорилт × ажлын өдөр (Даваа–Баасан, өнөөдрийг хүртэл);
                        зорилтгүйг 0 гэж тооцохгүй. 7 хоног нь Лхагва гарагийн хурлын долоо хоног (Лхагва–Мягмар).
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Хугацааны бүлэглэл">
                        {ACTIVITY_GROUPS.map(option => (
                            <button key={option} type="button" aria-pressed={group === option} onClick={() => setGroup(option)}
                                className={cn('min-h-8 rounded-md px-2.5 text-[12px] focus-ring', group === option ? 'bg-surface-2 font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-2')}>
                                {ACTIVITY_GROUP_LABEL[option]}
                            </button>
                        ))}
                    </div>
                    <Button variant="secondary" size="iconSm" aria-label="Өмнөх хугацаа" title="Өмнөх хугацаа" onClick={() => setAnchor(shiftPeriod(anchor, group, -1))}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="secondary" size="iconSm" aria-label="Дараах хугацаа" title="Дараах хугацаа" disabled={bounds.to >= today} onClick={() => setAnchor(shiftPeriod(anchor, group, 1))}>
                        <ChevronRight />
                    </Button>
                </div>
            </header>

            {query.isPending ? <Skeleton className="h-40" /> : !data ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">
                    Өдөр тутмын идэвхийг ачаалж чадсангүй. {query.error?.message}
                    <Button size="sm" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Дахин оролдох</Button>
                </div>
            ) : data.onboarding ? (
                <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">Таны нэр борлуулалтын менежерийн бүртгэлд алга. Админ бүртгэсний дараа таны идэвх энд гарна.</p>
            ) : data.managers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Энэ төсөлд бүртгэлтэй идэвхтэй менежер алга.</p>
            ) : <>
                {!data.personal && <TeamTable managers={data.managers} targetDays={data.targetDays} selected={selected?.manager ?? null} onPick={setPicked} />}
                {selected && (data.personal || data.periods.length > 1) && <Breakdown manager={selected} periods={data.periods} targetDays={data.targetDays} personal={data.personal} />}
                {!data.personal && !selected && data.periods.length > 1 && <p className="text-xs text-muted-foreground">Менежерийн нэр дээр дарж хугацаагаар задална.</p>}
                {unattributed && (unattributed.calls > 0 || unattributed.meetings > 0 || unattributed.requests > 0 || unattributed.openOverdue > 0) && (
                    <p className="text-xs text-muted-foreground">
                        Менежерт оноогдоогүй: {unattributed.calls} дуудлага (бүртгэлд холбогдоогүй хэрэглэгч бүртгэсэн) · {unattributed.meetings} уулзалт ·
                        {' '}{unattributed.requests} санал хүсэлт{unattributed.openOverdue > 0 ? ` (${unattributed.openOverdue} нь хэтэрсэн нээлттэй)` : ''}.
                    </p>
                )}
            </>}
        </section>
    );
}

const HEADERS = ['Дуудлага', 'Болсон уулзалт', 'Ирээгүй', 'Санал хүсэлт'];

function TeamTable({ managers, targetDays, selected, onPick }: { managers: ManagerActivity[]; targetDays: number; selected: string | null; onPick: (name: string) => void }) {
    return (
        <div className="max-w-full overflow-x-auto rounded-xl border border-border" role="region" aria-label="Менежерүүдийн идэвх" tabIndex={0}>
            <table className="w-full text-left text-[12.5px]">
                <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>
                    <th scope="col" className="px-3 py-2 font-medium">Менежер</th>
                    {[...HEADERS, 'Хэтэрсэн нээлттэй'].map(head => <th key={head} scope="col" className="px-3 py-2 text-right font-medium">{head}</th>)}
                </tr></thead>
                <tbody>{managers.map(row => (
                    <tr key={row.manager} className={cn('border-t border-border align-top hover:bg-surface-2', row.manager === selected && 'bg-brand-soft/40')}>
                        <th scope="row" className="px-3 py-2 font-medium">
                            <button type="button" className="text-left focus-ring" onClick={() => onPick(row.manager)}>{row.manager}</button>
                            {!row.active && <span className="ml-1 text-xs font-normal text-muted-foreground">({row.inRoster ? 'идэвхгүй' : 'бүртгэлгүй нэр'})</span>}
                        </th>
                        <ActivityCells row={row.totals} targetDays={targetDays} />
                        <td className="num px-3 py-2 text-right">{row.openOverdue > 0 ? <Pill tone="danger">{row.openOverdue}</Pill> : 0}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}

function Breakdown({ manager, periods, targetDays, personal }: { manager: ManagerActivity; periods: Array<{ key: string; label: string; targetDays: number }>; targetDays: number; personal: boolean }) {
    const labels = new Map(periods.map(period => [period.key, period]));
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">{manager.manager}</h3>
                <span className="text-xs text-muted-foreground">
                    Өдрийн зорилт: {manager.daily.calls ?? 'зорилтгүй'} дуудлага · {manager.daily.meetings ?? 'зорилтгүй'} уулзалт
                </span>
                {manager.openOverdue > 0 && <Pill tone="danger">{manager.openOverdue} хэтэрсэн нээлттэй санал хүсэлт</Pill>}
            </div>
            <div className="max-w-full overflow-x-auto rounded-xl border border-border" role="region" aria-label={`${manager.manager} идэвх`} tabIndex={0}>
                <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>
                        <th scope="col" className="px-3 py-2 font-medium">Хугацаа</th>
                        {HEADERS.map(head => <th key={head} scope="col" className="px-3 py-2 text-right font-medium">{head}</th>)}
                    </tr></thead>
                    <tbody>{manager.rows.map(row => (
                        <tr key={row.period} className="border-t border-border align-top">
                            <th scope="row" className="num px-3 py-2 font-medium">{labels.get(row.period)?.label ?? row.period}</th>
                            <ActivityCells row={row} targetDays={labels.get(row.period)?.targetDays ?? 0} />
                        </tr>
                    ))}</tbody>
                    {(personal || manager.rows.length > 1) && <tfoot><tr className="border-t border-border-strong bg-surface-2/60 align-top">
                        <th scope="row" className="px-3 py-2 font-semibold">Нийт</th>
                        <ActivityCells row={manager.totals} targetDays={targetDays} />
                    </tr></tfoot>}
                </table>
            </div>
        </div>
    );
}

function Attainment({ pct, target, targetDays }: { pct: number | null; target: number | null; targetDays: number }) {
    if (target === null) return <span className="block text-[10.5px] text-muted-foreground">{targetDays === 0 ? 'ажлын бус өдөр' : 'зорилтгүй'}</span>;
    return <Pill tone={attainmentTone(pct)} className="mt-0.5">{pct}%</Pill>;
}

function ActivityCells({ row, targetDays }: { row: ActivityRow; targetDays: number }) {
    const { requests } = row;
    return <>
        <td className="num px-3 py-2 text-right">
            <span className="font-medium">{row.calls}</span>{row.target.calls !== null && <span className="text-muted-foreground"> / {row.target.calls}</span>}
            <Attainment pct={row.attainment.calls} target={row.target.calls} targetDays={targetDays} />
        </td>
        <td className="num px-3 py-2 text-right">
            <span className="font-medium">{row.meetingsHeld}</span>{row.target.meetings !== null && <span className="text-muted-foreground"> / {row.target.meetings}</span>}
            <span className="block text-[10.5px] text-muted-foreground">шинэ {row.meetingsNew}</span>
            <Attainment pct={row.attainment.meetings} target={row.target.meetings} targetDays={targetDays} />
        </td>
        <td className="num px-3 py-2 text-right">{row.noShows}</td>
        <td className="num px-3 py-2 text-right" title={`Ирсэн ${requests.received} · хугацаандаа ${requests.slaMet}/${requests.slaTotal}${requests.avgResolutionHours !== null ? ` · дундаж ${requests.avgResolutionHours} цаг` : ''}`}>
            <span className="font-medium">{requests.resolved}</span> <span className="text-muted-foreground">шийдсэн</span>
            <span className="block text-[10.5px] text-muted-foreground">
                {requests.onTimePct === null ? 'SLA тооцоогүй' : `хугацаандаа ${requests.onTimePct}%`}
            </span>
        </td>
    </>;
}
