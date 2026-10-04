'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import { KPI_ITEMS, type KpiItemKey } from '@/lib/sales/kpi';
import { DAILY_TARGET_LIMITS } from '@/lib/sales/activity';
import type { SalesKpiReport } from '@/lib/sales/kpi-load';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';

type KpiResponse = SalesKpiReport & { canEdit: boolean };
type ManagerCard = KpiResponse['managers'][number];

const TONE: Record<string, string> = {
    success: 'bg-status-success-soft text-status-success', info: 'bg-status-info-soft text-status-info',
    pending: 'bg-status-pending-soft text-status-pending', danger: 'bg-status-danger-soft text-status-danger', neutral: 'bg-surface-2 text-fg-2',
};
const value = (unit: string, amount: number | null) => amount === null ? '—'
    : unit === 'mnt' ? formatMNTShort(amount) : unit === 'pct' ? `${amount}%` : unit === 'score' ? `${amount}/5` : amount.toLocaleString('en-US');

/** Менежерийн сарын KPI карт (v2): үр дүн 60% · идэвх 25% · чанар, үнэлгээ 15%. */
export function SalesKpiCard({ year, month, manager }: { year: number; month: number; manager: string | null }) {
    const { shop, user } = useAuth();
    const query = useQuery<KpiResponse>({
        queryKey: ['sales-kpi', shop?.id, user?.id, year, month],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/sales-kpi?year=${year}&month=${month}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id, staleTime: 60_000, retry: 1,
    });
    const [picked, setPicked] = useState<string | null>(null);
    const data = query.data;
    if (query.isPending) return <Skeleton className="h-48" />;
    if (!data) return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">KPI картыг ачаалж чадсангүй. {query.error?.message}</p>;
    const selected = data.managers.find(row => row.manager === (picked ?? manager)) ?? data.managers[0];

    return (
        <section className="mb-6 space-y-4 rounded-2xl border border-border bg-surface p-5 print:border-0 print:p-0">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">KPI карт · {year} оны {month}-р сар</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Үр дүн 60% · Идэвх, сахилга 25% · Чанар, үнэлгээ 15% (санал хүсэлтийн шийдвэрлэлт 5 + удирдлага 10). Оноо = жин × гүйцэтгэл/төлөвлөгөө (дээд хязгаартай).
                        Төлөвлөгөөгүй эсвэл мэдээлэлгүй үзүүлэлтийг 0 гэж тооцохгүй — тооцогдсон жинг харуулна.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Гэрээ: {data.sources?.contracts ? `ERP «${data.sources.contracts.source}» ${data.sources.contracts.date}` : 'ERP гэрээний экспорт алга'}
                        {' · '}Мөнгө: {data.sources?.cashFrom ? `${data.sources.cashFrom.date} → ${data.sources.contracts?.date}` : 'сарын эхний ERP snapshot алга'}
                    </p>
                </div>
            </header>

            {data.managers.length === 0 ? <p className="text-sm text-muted-foreground">Энэ төсөлд бүртгэлтэй идэвхтэй менежер алга.</p> : <>
                {data.managers.length > 1 && <div className="max-w-full overflow-x-auto rounded-xl border border-border" role="region" aria-label="Багийн KPI" tabIndex={0}>
                    <table className="w-full text-left text-[12.5px]">
                        <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>
                            <th scope="col" className="px-3 py-2 font-medium">Менежер</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Үр дүн</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Идэвх</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Үнэлгээ</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Нийт</th>
                            <th scope="col" className="px-3 py-2 font-medium">Зэрэглэл</th>
                        </tr></thead>
                        <tbody>{data.managers.map(row => <tr key={row.manager} className={cn('cursor-pointer border-t border-border hover:bg-surface-2', row.manager === selected?.manager && 'bg-brand-soft/40')} onClick={() => setPicked(row.manager)}>
                            <th scope="row" className="px-3 py-2 font-medium"><button type="button" className="text-left focus-ring" onClick={() => setPicked(row.manager)}>{row.manager}</button>{!row.active && <span className="ml-1 text-xs text-muted-foreground">(идэвхгүй)</span>}</th>
                            {row.groups.map(group => <td key={group.group} className="num px-3 text-right">{group.score ?? '—'}<span className="text-muted-foreground">/{group.weight}</span></td>)}
                            <td className="num px-3 text-right font-semibold">{row.total ?? '—'}{row.total !== null && row.coveredWeight < 100 && <span className="block text-[10.5px] font-normal text-muted-foreground">{row.coveredWeight}% жингээр</span>}</td>
                            <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[row.grade.tone])}>{row.grade.label}</span></td>
                        </tr>)}</tbody>
                    </table>
                </div>}
                {selected && <ManagerDetail key={`${selected.manager}-${year}-${month}`} card={selected} year={year} month={month} canEdit={data.canEdit} />}
            </>}
        </section>
    );
}

function ManagerDetail({ card, year, month, canEdit }: { card: ManagerCard; year: number; month: number; canEdit: boolean }) {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(KPI_ITEMS.map(item => [item.key, card.plans[item.key] !== undefined ? String(card.plans[item.key]) : ''])));
    const [calls, setCalls] = useState(card.manual.calls_chats === null ? '' : String(card.manual.calls_chats));
    const [dailyCalls, setDailyCalls] = useState(card.daily?.calls ? String(card.daily.calls) : '');
    const [dailyMeetings, setDailyMeetings] = useState(card.daily?.meetings ? String(card.daily.meetings) : '');
    const [management, setManagement] = useState(card.review.management ? String(card.review.management) : '');
    const [note, setNote] = useState(card.review.note ?? '');
    const save = useMutation({
        mutationFn: () => {
            if (Number(dailyCalls) > DAILY_TARGET_LIMITS.calls || Number(dailyMeetings) > DAILY_TARGET_LIMITS.meetings) {
                return Promise.reject(new Error(`Өдрийн зорилт ${DAILY_TARGET_LIMITS.calls} дуудлага, ${DAILY_TARGET_LIMITS.meetings} уулзалтаас ихгүй байна`));
            }
            return dashboardMutate('/api/dashboard/reports/sales-kpi', 'PUT', {
                year, month, manager: card.manager,
                plans: Object.fromEntries(Object.entries(plans).filter(([key, text]) => key !== 'management' && text.trim() !== '').map(([key, text]) => [key, Number(text)])),
                // Хоосолбол гар тоо цэвэрлэгдэж, CRM-ийн дуудлагын тоо руу буцна.
                ...(calls.trim() !== '' ? { manual: { calls_chats: Number(calls) } } : card.manual.calls_chats !== null ? { manual: { calls_chats: null } } : {}),
                // 0 эсвэл хоосон = зорилтгүй.
                daily: { calls: Number(dailyCalls) || null, meetings: Number(dailyMeetings) || null },
                review: { management: management ? Number(management) : null, note },
            }, { shopId: shop?.id });
        },
        onSuccess: async () => {
            setEditing(false);
            toast.success('KPI хадгалагдлаа');
            await Promise.all([queryClient.invalidateQueries({ queryKey: ['sales-kpi', shop?.id] }), queryClient.invalidateQueries({ queryKey: ['manager-activity'] })]);
        },
        onError: (error: Error) => toast.error(error.message || 'KPI хадгалж чадсангүй'),
    });

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold">{card.manager}</h3>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[card.grade.tone])}>{card.grade.label}</span>
                    <span className="num text-sm font-semibold">{card.total ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">тооцогдсон жин {card.coveredWeight}%</span>
                </div>
                {canEdit && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" />Төлөвлөгөө, үнэлгээ</Button>}
            </div>
            <div className="max-w-full overflow-x-auto rounded-xl border border-border" role="region" aria-label={`${card.manager} KPI`} tabIndex={0}>
                <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>
                        {['Үзүүлэлт', 'Жин', 'Төлөвлөгөө', 'Гүйцэтгэл', 'Хувь', 'Оноо'].map(head => <th key={head} scope="col" className={cn('px-3 py-2 font-medium', head !== 'Үзүүлэлт' && 'text-right')}>{head}</th>)}
                    </tr></thead>
                    <tbody>{card.items.map(item => <tr key={item.key} className="border-t border-border align-top">
                        <th scope="row" className="px-3 py-2 font-medium">{item.label}<span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted-foreground">{item.basis}</span></th>
                        <td className="num px-3 py-2 text-right">{item.weight}%</td>
                        <td className="num px-3 py-2 text-right">{editing && item.key !== 'management'
                            ? <input aria-label={`${item.label} төлөвлөгөө`} inputMode="decimal" value={plans[item.key]} onChange={event => setPlans({ ...plans, [item.key]: event.target.value.replace(/[^\d.]/g, '') })} className="h-8 w-32 rounded-md border border-border bg-background px-2 text-right focus-ring" />
                            : value(item.unit, item.plan)}</td>
                        <td className="num px-3 py-2 text-right">{editing && item.key === 'calls_chats'
                            ? <input aria-label="Дуудлага, чатын гүйцэтгэл" inputMode="numeric" value={calls} onChange={event => setCalls(event.target.value.replace(/\D/g, ''))} className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right focus-ring" />
                            : editing && item.key === 'management'
                                ? <select aria-label="Удирдлагын үнэлгээ" value={management} onChange={event => setManagement(event.target.value)} className="h-8 rounded-md border border-border bg-background px-2 focus-ring"><option value="">—</option>{[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}</option>)}</select>
                                : <>{value(item.unit, item.actual)}{item.key === 'calls_chats' && <span className="block text-[10.5px] text-muted-foreground">
                                    {card.manual.calls_chats !== null ? `гараар · CRM: ${card.crm?.calls ?? '—'}` : 'CRM-ээс'}</span>}</>}</td>
                        <td className="num px-3 py-2 text-right">{item.attainmentPct === null ? '—' : `${item.attainmentPct}%`}</td>
                        <td className="num px-3 py-2 text-right">{item.score ?? <span className="text-[11px] text-muted-foreground">{item.missing === 'plan' ? 'төлөвлөгөөгүй' : 'мэдээлэлгүй'}</span>}</td>
                    </tr>)}</tbody>
                </table>
            </div>
            {editing ? <div className="space-y-2">
                <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
                    <legend className="px-1 text-xs text-muted-foreground">Өдрийн зорилт (ажлын өдөр бүр, Даваа–Баасан)</legend>
                    <label className="text-xs text-muted-foreground">Дуудлага
                        <input aria-label="Өдөрт дуудлагын зорилт" inputMode="numeric" value={dailyCalls} onChange={event => setDailyCalls(event.target.value.replace(/\D/g, '').slice(0, 4))}
                            className="mt-1 block h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm text-foreground focus-ring" />
                    </label>
                    <label className="text-xs text-muted-foreground">Болсон уулзалт
                        <input aria-label="Өдөрт уулзалтын зорилт" inputMode="numeric" value={dailyMeetings} onChange={event => setDailyMeetings(event.target.value.replace(/\D/g, '').slice(0, 3))}
                            className="mt-1 block h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm text-foreground focus-ring" />
                    </label>
                    <span className="text-[11px] text-muted-foreground">Хоосон = зорилтгүй. Дээд тал нь {DAILY_TARGET_LIMITS.calls} дуудлага, {DAILY_TARGET_LIMITS.meetings} уулзалт.</span>
                </fieldset>
                <label className="block text-xs text-muted-foreground">Удирдлагын тэмдэглэл
                    <textarea value={note} maxLength={2000} rows={2} onChange={event => setNote(event.target.value)} className="mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus-ring" />
                </label>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => save.mutate()} isLoading={save.isPending}><Save className="size-4" />Хадгалах</Button>
                    <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => setEditing(false)}>Болих</Button>
                </div>
                <p className="text-xs text-muted-foreground">Мөнгөн дүнг төгрөгөөр (жишээ нь 900000000), хувийг 0–100-аар оруулна. {formatMNT(900000000)} = 900000000. Дуудлагын гүйцэтгэлийг хоосолбол CRM-ийн тоо ашиглагдана.</p>
            </div> : <>
                <p className="text-xs text-muted-foreground">
                    Өдрийн зорилт: {card.daily?.calls || card.daily?.meetings
                        ? `${card.daily.calls ?? 'зорилтгүй'} дуудлага · ${card.daily.meetings ?? 'зорилтгүй'} уулзалт (ажлын өдөр бүр)`
                        : 'тавиагүй'}
                </p>
                {card.review.note ? <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-fg-2">Удирдлагын тэмдэглэл: {card.review.note}</p> : null}
            </>}
        </div>
    );
}
