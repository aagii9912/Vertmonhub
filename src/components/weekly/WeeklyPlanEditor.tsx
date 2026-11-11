'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatMNT } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import {
    MONTHLY_SALES_BLOCKS, MONTHLY_SALES_BLOCK_LABELS, MONTHLY_SALES_COUNT_MAX, MONTHLY_SALES_FIELDS, MONTHLY_SALES_LABELS, MONTHLY_SALES_METRICS,
    MonthlySalesMonthSchema, hasMonthlySalesBreakdown, isMonthlySalesCount, monthlySalesPatches, monthlySalesWithBlockTotals, parseMonthlySalesValue,
    type MonthlySalesBlock, type MonthlySalesField, type MonthlySalesMonth,
} from '@/lib/sales/monthly';

type Inputs = Record<MonthlySalesBlock, Record<MonthlySalesField, string>>;
/** Төлөвлөгөө, гүйцэтгэл өөрчлөгдөхөд дахин унших уншигчид (Удирдлага → «Борлуулалтын төлөвлөгөө» хуудастай ижил). */
const PLAN_READERS = ['admin-sales-targets', 'director', 'kpi-report', 'my-stats', 'operations-report', 'weekly-sales', 'weekly-manual', 'plan-performance'];
const ACTUAL_FIELDS = MONTHLY_SALES_METRICS.map(metric => metric.actual as MonthlySalesField);
const text = (value: number | null | undefined) => value?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '';
const display = (field: MonthlySalesField, value: number | null) => value === null ? '—' : isMonthlySalesCount(field) ? value.toLocaleString('en-US') : formatMNT(value);
const inputsOf = (row: MonthlySalesMonth) => Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => [block,
    Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, text(row.block_amounts?.[block]?.[field])]))])) as Inputs;

/**
 * Тайлант сарын төлөвлөгөө, гүйцэтгэлийг «Гараар нөхөх» алхам дотроос оруулна — Удирдлага → «Борлуулалтын төлөвлөгөө»
 * хуудасны нэг сарын хэсэг: ижил нүд (блок × үзүүлэлт), ижил API (хувилбар шалгалт, аудит), зөвхөн өөрчилсөн нүд илгээнэ.
 */
export function WeeklyPlanEditor({ shopId, month, onClose, onDirty }: {
    shopId: string;
    /** YYYY-MM */
    month: string;
    onClose: () => void;
    /** Хадгалаагүй өөрчлөлттэй бол алхам солихыг хуудас хаана. */
    onDirty: (dirty: boolean) => void;
}) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const query = useQuery({
        queryKey: ['admin-sales-targets', shopId, year, 'months-only', user?.id],
        queryFn: async ({ signal }): Promise<MonthlySalesMonth[]> => {
            const response = await fetch(`/api/admin/sales-targets?shopId=${shopId}&year=${year}&only=months`, { signal });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'Төлөвлөгөө ачаалагдсангүй');
            const months = MonthlySalesMonthSchema.array().length(12).safeParse(body.months);
            if (!months.success) throw new Error('Сарын төлөвлөгөөний мэдээлэл дутуу байна. Дахин ачаална уу.');
            return months.data;
        },
        staleTime: 0, retry: false, refetchOnWindowFocus: false,
    });
    // Хадгалаагүй засвар: засаж эхлэх үеийн мөр (`before`) дээр давхарлана — дэвсгэрт дахин уншихад алдагдахгүй.
    const [draft, setDraft] = useState<{ before: MonthlySalesMonth; inputs: Inputs } | null>(null);
    const [actualsOpen, setActualsOpen] = useState<boolean | null>(null);

    const stored = query.data?.[monthNumber - 1];
    const before = draft?.before ?? stored;
    const inputs = draft?.inputs ?? (before ? inputsOf(before) : null);
    const invalidCell = (block: MonthlySalesBlock, field: MonthlySalesField) => !!inputs && parseMonthlySalesValue(field, inputs[block][field]) === undefined;
    const after = before && inputs ? (() => {
        const block_amounts = { ...before.block_amounts };
        for (const block of MONTHLY_SALES_BLOCKS) for (const field of MONTHLY_SALES_FIELDS) {
            const amount = parseMonthlySalesValue(field, inputs[block][field]) ?? null;
            if (amount !== (before.block_amounts?.[block]?.[field] ?? null)) block_amounts[block] = { ...block_amounts[block], [field]: amount };
        }
        return monthlySalesWithBlockTotals({ ...before, block_amounts });
    })() : null;
    const invalid = !!inputs && (MONTHLY_SALES_BLOCKS.some(block => MONTHLY_SALES_FIELDS.some(field => invalidCell(block, field)))
        || MONTHLY_SALES_FIELDS.some(field => (after?.[field] ?? 0) > (isMonthlySalesCount(field) ? MONTHLY_SALES_COUNT_MAX : 1e13)));
    const patches = draft && before && after && !invalid ? monthlySalesPatches([before], [after]) : [];
    const dirty = !!draft && (invalid || patches.length > 0);
    useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
    useEffect(() => () => onDirty(false), [onDirty]);

    const save = useMutation({
        mutationFn: async () => {
            const response = await fetch('/api/admin/sales-targets', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId, year, months: patches }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(body.error || 'Төлөвлөгөө, гүйцэтгэл хадгалагдсангүй'), { conflict: response.status === 409 });
        },
        onSuccess: async () => {
            setDraft(null);
            toast.success('Төлөвлөгөө, гүйцэтгэл хадгалагдлаа');
            await Promise.all(PLAN_READERS.map(key => queryClient.invalidateQueries({ queryKey: [key, shopId] })));
            onClose();
        },
    });
    const conflict = !!(save.error as { conflict?: boolean } | null)?.conflict;

    if (query.isPending) return <Skeleton className="h-48" />;
    if (!before || !inputs || !after) return <Alert variant="danger">{query.error?.message ?? 'Төлөвлөгөө ачаалагдсангүй'} <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>Дахин оролдох</Button></Alert>;

    const showActuals = actualsOpen ?? ACTUAL_FIELDS.some(field => before[field] !== null || hasMonthlySalesBreakdown(before, field));
    const columns = MONTHLY_SALES_METRICS.flatMap(metric => [
        { field: metric.plan as MonthlySalesField, kind: 'plan' as const, metric },
        ...(showActuals ? [{ field: metric.actual as MonthlySalesField, kind: 'actual' as const, metric }] : []),
    ]);
    // Блокоор задлаагүй хадгалсан хуучин нийт дүн: блокийн нүдэнд оруулах хүртэл хэвээр үлдэнэ.
    const unallocated = columns.filter(({ field }) => before[field] !== null && !hasMonthlySalesBreakdown(before, field));
    const setCell = (block: MonthlySalesBlock, field: MonthlySalesField, value: string) => setDraft(previous => {
        const base = previous ?? { before, inputs: inputsOf(before) };
        return { ...base, inputs: { ...base.inputs, [block]: { ...base.inputs[block], [field]: value } } };
    });
    /** Зөв тоог мянгатын таслалтай болгоно (уншихад хялбар); буруу бичвэрийг хөндөхгүй. */
    const tidyCell = (block: MonthlySalesBlock, field: MonthlySalesField) => {
        const value = parseMonthlySalesValue(field, inputs[block][field]);
        if (typeof value === 'number' && text(value) !== inputs[block][field]) setCell(block, field, text(value));
    };
    const cancel = () => { setDraft(null); save.reset(); onClose(); };
    const reload = () => { setDraft(null); save.reset(); void query.refetch(); };
    const label = `${monthNumber}-р сарын төлөвлөгөө, гүйцэтгэл`;

    return (
        <form className="space-y-3 rounded-xl border border-border p-4" aria-label={label} onSubmit={event => { event.preventDefault(); if (patches.length && !conflict) save.mutate(); }}>
            <div className="max-w-full overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                        <tr>
                            <th rowSpan={2} scope="col" className="border-b border-border px-2 py-2 font-medium">Блок / төрөл</th>
                            {MONTHLY_SALES_METRICS.map(metric => <th key={metric.key} colSpan={showActuals ? 2 : 1} scope="colgroup" className="border-b border-border px-2 py-2 text-center font-medium text-foreground">{metric.label}</th>)}
                        </tr>
                        <tr>
                            {columns.map(({ field, kind }) => <th key={field} scope="col" className={cn('border-b border-border px-2 py-1.5 text-center font-medium', kind === 'plan' ? 'text-status-success' : 'text-status-pending')}>{kind === 'plan' ? 'Төлөвлөгөө' : 'Гүйцэтгэл'}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {MONTHLY_SALES_BLOCKS.map(block => <tr key={block}>
                            <th scope="row" className="whitespace-nowrap border-b border-border px-2 py-2 font-medium">{MONTHLY_SALES_BLOCK_LABELS[block]}</th>
                            {columns.map(({ field }) => {
                                const count = isMonthlySalesCount(field);
                                const bad = invalidCell(block, field);
                                return <td key={field} className="border-b border-border p-1.5">
                                    <input type="text" inputMode={count ? 'numeric' : 'decimal'} placeholder="—" disabled={save.isPending}
                                        aria-label={`${MONTHLY_SALES_BLOCK_LABELS[block]} ${MONTHLY_SALES_LABELS[field]}`} aria-invalid={bad}
                                        value={inputs[block][field]} onChange={event => setCell(block, field, event.target.value)} onBlur={() => tidyCell(block, field)}
                                        className={cn('num h-9 w-full rounded-md border bg-surface px-2 text-right text-sm text-foreground', count ? 'min-w-20' : 'min-w-36', bad ? 'border-status-danger' : 'border-control')} />
                                </td>;
                            })}
                        </tr>)}
                        <tr>
                            <th scope="row" className="px-2 py-2 font-semibold">Нийт</th>
                            {columns.map(({ field }) => <td key={field} aria-label={`Нийт ${MONTHLY_SALES_LABELS[field]}`} className="num whitespace-nowrap px-3.5 py-2 text-right font-medium">{display(field, after[field])}</td>)}
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Дүнг төгрөгөөр бүтнээр нь бичнэ (жишээ: 900,000,000). Хоосон нүд = оруулаагүй, 0 = оруулсан утга.</p>
            {unallocated.length > 0 && <p className="text-xs leading-relaxed text-muted-foreground">Блокоор задлаагүй хадгалсан нийт дүн: {unallocated.map(({ field }) => `${MONTHLY_SALES_LABELS[field]} ${display(field, before[field])}`).join(', ')}. Блокийн нүдэнд оруулбал нийт нь блокийн нийлбэр болно.</p>}
            <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5" checked={showActuals} onChange={event => setActualsOpen(event.target.checked)} />
                <span>Гүйцэтгэлийг гараар оруулах <span className="text-muted-foreground">— заавал биш; хоосон бол системийн бүртгэлээр тооцно</span></span>
            </label>
            {invalid && <p role="alert" className="text-xs text-status-danger">Улаан хүрээтэй нүдний тоог засна уу (зөвхөн тоо; гэрээний тоо бүхэл).</p>}
            {save.error && <Alert variant="danger">{save.error.message} {conflict && <Button size="sm" variant="secondary" onClick={reload}>Шинэ мэдээллийг авах</Button>}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={!patches.length || conflict} isLoading={save.isPending}>Хадгалах</Button>
                <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={cancel}>Болих</Button>
                <Button href="/admin/sales-targets" size="sm" variant="link" className="ml-auto">Бүх сар, нэмэлт төлөвлөгөө<ArrowUpRight /></Button>
            </div>
        </form>
    );
}
