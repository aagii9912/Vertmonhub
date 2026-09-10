'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Plus, Check, Loader2, X, FileText, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { formatShortDate, formatTime } from '@/lib/utils/date';
import { usePageTitle } from '@/lib/navigation/pageTitle';
import { useContract, usePayments, useAddPayment, useUpdatePayment, CONTRACT_STATUS_META, PAYMENT_STATUS_META, PAYMENT_METHOD_LABEL, type PaymentRow } from '@/hooks/useContracts';
import { useLeadDetail } from '@/hooks/useLeads';
import { parseLocalDate } from '@/lib/dashboard/director';
import { Panel, Pill, Progress, Skeleton, Avatar, GhostButton } from '@/components/dashboard/v2/primitives';
import { EntityAttachments } from '@/components/dashboard/EntityAttachments';

/**
 * Гэрээний дэлгэрэнгүй — бүтэн хуудас (мокап 5).
 * Зүүн: ерөнхий мэдээлэл, төлбөрийн график (+ бүртгэх). Баруун: явц, хавсралт, түүх.
 */
export function ContractDetail({ id }: { id: string }) {
    const { data, isLoading } = useContract(id);
    const c = data?.contract;
    usePageTitle(c?.contract_number ? c.contract_number : 'Гэрээ');
    const { data: pay } = usePayments(id);
    const payments = useMemo(() => (pay?.payments ?? []).slice().sort((a, b) => a.installment_number - b.installment_number), [pay]);
    const { data: leadDetail } = useLeadDetail(c?.lead_id ?? null);
    const [adding, setAdding] = useState(false);

    if (isLoading || !c) {
        return <div className="grid gap-4 xl:grid-cols-3"><div className="flex flex-col gap-4 xl:col-span-2"><Skeleton className="h-40" /><Skeleton className="h-64" /></div><Skeleton className="h-80" /></div>;
    }

    const st = CONTRACT_STATUS_META[c.contract_status] ?? { label: c.contract_status, tone: 'neutral' as const };
    const total = c.total_price || 0;
    const paid = c.paid_amount || 0;
    const balance = c.balance ?? Math.max(0, total - paid);
    const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
    const now = new Date();
    const nextDue = payments.find((p) => p.status !== 'paid' && p.status !== 'cancelled');
    const schedTotal = payments.reduce((t, p) => t + Number(p.amount || 0), 0);
    const schedPaid = payments.reduce((t, p) => t + Number(p.paid_amount || 0), 0);
    const customer = c.customer_name || [c.customer_last_name, c.customer_first_name].filter(Boolean).join(' ') || '—';
    const phone = c.customer_phone || c.customer_mobile || null;
    const genLink = `/dashboard/contracts/generate?${new URLSearchParams({ buyerName: customer, buyerPhone: phone || '', buyerRegister: c.customer_registration || '', propertyName: [c.block_name ? `${c.block_name} блок` : '', c.unit_number || ''].filter(Boolean).join(' '), propertyFloor: c.floor || '', propertyRooms: c.rooms ? String(c.rooms) : '', propertySizeSqm: c.contracted_area ? String(c.contracted_area) : '', price: total ? String(total) : '', pricePerSqm: c.price_per_sqm ? String(c.price_per_sqm) : '', downPayment: c.prepayment_due ? String(c.prepayment_due) : '' }).toString()}`;

    return (
        <div className="flex flex-col gap-4">
            {/* Гарчгийн мөр */}
            <div className="flex flex-wrap items-center gap-2">
                <Link href="/dashboard/contracts" className="inline-flex h-[30px] items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Гэрээ</Link>
                <span className="mono-label text-[16px] font-semibold text-foreground">{c.contract_number || c.unit_label || '—'}</span>
                <Pill tone={st.tone}>{st.label}</Pill>
                {c.contract_date && <span className="mono-label text-[12px] text-muted-foreground">{formatShortDate(c.contract_date)}</span>}
                <div className="ml-auto flex items-center gap-2">
                    <Link href={genLink} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2 focus-ring"><Download className="h-4 w-4" /> PDF татах</Link>
                    <button type="button" onClick={() => setAdding(true)} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring"><Plus className="h-4 w-4" /> Төлбөр бүртгэх</button>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                    <Panel title="Ерөнхий" bodyClassName="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-3">
                        <F label="Харилцагч">{c.lead_id ? <Link href={`/dashboard/leads?lead=${c.lead_id}`} className="text-brand hover:underline">{customer}</Link> : customer}</F>
                        <F label="Утас"><span className="mono-label">{phone || '—'}</span>{phone && <a href={`tel:${phone.replace(/\D/g, '')}`} className="ml-1 inline-flex text-brand" aria-label="Залгах"><Phone className="h-3.5 w-3.5" /></a>}</F>
                        <F label="Регистр"><span className="mono-label">{c.customer_registration || '—'}</span></F>
                        <F label="Блок / Тоот"><span className="mono-label">{[c.block_name, c.unit_number || c.legacy_unit_number].filter(Boolean).join(' / ') || '—'}</span></F>
                        <F label="Байр">{[c.unit_type || (c.rooms ? `${c.rooms} өрөө` : null), c.contracted_area ? `${c.contracted_area} м²` : null, c.floor ? `${c.floor}-р давхар` : null].filter(Boolean).join(' · ') || '—'}</F>
                        <F label="Менежер">{c.sales_manager ? <span className="inline-flex items-center gap-1.5"><Avatar name={c.sales_manager} />{c.sales_manager}</span> : '—'}</F>
                        <F label="Нийт үнэ"><span className="num font-medium">{formatMNT(total)}</span></F>
                        <F label="Урьдчилгаа"><span className="num">{c.prepayment_percent ? `${c.prepayment_percent}%` : '—'}{c.prepayment_due ? ` · ${formatMNT(c.prepayment_due)}` : ''}</span></F>
                        <F label="Урьдчилгаа төлсөн"><span className="num">{formatMNT(c.prepayment_paid || 0)}</span></F>
                        {(c.payment_condition || c.sales_channel) && <F label="Нөхцөл / суваг">{[c.payment_condition, c.sales_channel].filter(Boolean).join(' · ')}</F>}
                    </Panel>

                    <Panel title="Төлбөрийн график" sub={payments.length ? `${payments.length} төлөлт` : undefined}>
                        {payments.length === 0 && !adding ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                                <div className="text-[13px] font-medium text-foreground">Төлбөрийн график оруулаагүй</div>
                                <p className="max-w-sm text-[12.5px] text-muted-foreground">Урьдчилгаа болон сар бүрийн төлөлтийг энд бүртгэвэл захирлын самбар авлага, хоцролтыг автоматаар харуулна.</p>
                                <button type="button" onClick={() => setAdding(true)} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong"><Plus className="h-4 w-4" /> Төлбөр бүртгэх</button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead>
                                        <tr className="h-8 bg-surface-2 text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
                                            <th className="w-12 px-3 text-left font-medium">#</th>
                                            <th className="px-2 text-left font-medium">Огноо</th>
                                            <th className="px-2 text-right font-medium">Дүн</th>
                                            <th className="px-2 text-right font-medium">Төлсөн</th>
                                            <th className="px-2 text-left font-medium">Төлөв</th>
                                            <th className="px-2 text-left font-medium">Төлсөн огноо</th>
                                            <th className="w-24" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map((p) => <PaymentTr key={p.id} p={p} contractId={id} now={now} />)}
                                        {adding && <AddPaymentRow contractId={id} next={(payments.at(-1)?.installment_number ?? 0) + 1} defaultAmount={nextDue ? 0 : Math.round(balance / 6)} onDone={() => setAdding(false)} />}
                                    </tbody>
                                    {payments.length > 0 && (
                                        <tfoot>
                                            <tr className="h-9 border-t border-border text-[12.5px]">
                                                <td className="px-3 font-medium text-foreground" colSpan={2}>Нийт</td>
                                                <td className="num px-2 text-right font-medium text-foreground">{formatMNT(schedTotal)}</td>
                                                <td className="num px-2 text-right font-medium text-foreground">{formatMNT(schedPaid)}</td>
                                                <td className="px-2 text-muted-foreground" colSpan={3}>Үлдэгдэл <span className="num font-medium text-foreground">{formatMNT(Math.max(0, schedTotal - schedPaid))}</span></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}
                    </Panel>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <Panel title="Төлбөрийн явц" bodyClassName="flex flex-col gap-3 p-4">
                        <div className="flex items-baseline gap-2">
                            <span className="num text-[22px] font-semibold tracking-[-0.02em] text-foreground">{paidPct}%</span>
                            <span className="text-[12.5px] text-muted-foreground">{formatMNTShort(paid)} төлсөн</span>
                        </div>
                        <Progress value={paidPct} overColor={false} />
                        <div className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[12.5px]">
                            <span className="text-muted-foreground">Үлдэгдэл</span><span className="num text-right font-medium text-foreground">{formatMNTShort(balance)}</span>
                            {nextDue && (<><span className="text-muted-foreground">Дараагийн төлөлт</span><span className="num text-right text-foreground"><span className="mono-label">{nextDue.due_date}</span> · {formatMNTShort(Number(nextDue.amount) - Number(nextDue.paid_amount || 0))}</span></>)}
                            {(c.overdue_days || 0) > 0 && (<><span className="text-status-danger">Хоцролт</span><span className="num text-right font-medium text-status-danger">{c.overdue_days} хоног{c.penalty_amount ? ` · ${formatMNTShort(c.penalty_amount)}` : ''}</span></>)}
                        </div>
                    </Panel>

                    <Panel title="Хавсралт" bodyClassName="p-3"><EntityAttachments entityType="contract" entityId={id} /></Panel>

                    <Panel title="Түүх" bodyClassName="p-4">
                        <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                            {[
                                ...(leadDetail?.activities ?? []).map((a) => ({ at: a.created_at, title: a.content || a.type, by: a.created_by_name })),
                                ...payments.filter((p) => p.paid_date).map((p) => ({ at: p.paid_date as string, title: `${p.label || `${p.installment_number}-р төлөлт`} · ${formatMNTShort(Number(p.paid_amount || 0))} төлсөн`, by: null })),
                                ...(c.contract_date ? [{ at: c.contract_date, title: 'Гэрээ байгуулав', by: c.sales_manager }] : []),
                            ]
                                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                                .slice(0, 12)
                                .map((t, i) => (
                                    <li key={i} className="relative">
                                        <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', i === 0 ? 'bg-brand' : 'bg-border-strong')} />
                                        <div className="mono-label text-[11px] text-muted-foreground">{formatShortDate(t.at)}{/T\d/.test(t.at) ? ` ${formatTime(t.at)}` : ''}{t.by ? ` · ${t.by}` : ''}</div>
                                        <div className="text-[13px] text-foreground">{t.title}</div>
                                    </li>
                                ))}
                        </ol>
                        {c.lead_id && <Link href={`/dashboard/leads?lead=${c.lead_id}`} className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><FileText className="h-3.5 w-3.5" /> Холбоотой лид</Link>}
                    </Panel>
                </div>
            </div>
        </div>
    );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11.5px] text-muted-foreground">{label}</span>
            <span className="truncate text-[13px] text-foreground">{children}</span>
        </div>
    );
}

function PaymentTr({ p, contractId, now }: { p: PaymentRow; contractId: string; now: Date }) {
    const update = useUpdatePayment(contractId);
    const remaining = Number(p.amount) - Number(p.paid_amount || 0);
    const overdue = p.status !== 'paid' && p.status !== 'cancelled' && parseLocalDate(p.due_date) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const effective = overdue ? 'overdue' : p.status;
    const meta = PAYMENT_STATUS_META[effective] ?? PAYMENT_STATUS_META.pending;
    const daysTo = Math.round((parseLocalDate(p.due_date).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);

    const markPaid = () => {
        const today = new Date().toISOString().slice(0, 10);
        update.mutate({ payment_id: p.id, paid_amount: Number(p.amount), amount: Number(p.amount), paid_date: today }, {
            onSuccess: () => toast.success('Төлсөн гэж тэмдэглэв'),
            onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа'),
        });
    };

    return (
        <tr className="group h-9 border-b border-border last:border-b-0 hover:bg-surface-2/60">
            <td className="px-3 text-fg-2">{p.label || p.installment_number}</td>
            <td className="mono-label px-2 text-foreground">{p.due_date}{p.status !== 'paid' && !overdue && daysTo >= 0 && daysTo <= 14 && <span className="ml-1.5 text-[11px] text-muted-foreground">{daysTo === 0 ? 'өнөөдөр' : `${daysTo} хоногийн дараа`}</span>}</td>
            <td className="num px-2 text-right text-foreground">{formatMNT(Number(p.amount))}</td>
            <td className="num px-2 text-right text-fg-2">{Number(p.paid_amount) > 0 ? formatMNT(Number(p.paid_amount)) : '—'}</td>
            <td className="px-2"><Pill tone={meta.tone}>{meta.label}</Pill></td>
            <td className="mono-label px-2 text-fg-2">{p.paid_date || '—'}{p.payment_method && <span className="ml-1 text-[11px] text-muted-foreground">· {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>}</td>
            <td className="px-2 text-right">
                {remaining > 0 && p.status !== 'cancelled' && (
                    <GhostButton onClick={markPaid} disabled={update.isPending} className="invisible text-brand hover:bg-brand-soft group-hover:visible"><Check className="h-3.5 w-3.5" /> Төлсөн</GhostButton>
                )}
            </td>
        </tr>
    );
}

function AddPaymentRow({ contractId, next, defaultAmount, onDone }: { contractId: string; next: number; defaultAmount: number; onDone: () => void }) {
    const add = useAddPayment(contractId);
    const [label, setLabel] = useState(next === 1 ? 'Урьдчилгаа' : `${next}-р төлөлт`);
    const [due, setDue] = useState(() => new Date().toISOString().slice(0, 10));
    const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '');
    const [paid, setPaid] = useState('');
    const [method, setMethod] = useState('bank_transfer');

    const submit = async () => {
        const a = Number(amount.replace(/\D/g, ''));
        if (!a) { toast.error('Дүн оруулна уу'); return; }
        const pa = Number(paid.replace(/\D/g, '')) || 0;
        try {
            await add.mutateAsync({ installment_number: next, label: label.trim() || null, due_date: due, amount: a, paid_amount: pa, paid_date: pa > 0 ? new Date().toISOString().slice(0, 10) : null, payment_method: pa > 0 ? method : null });
            toast.success('Төлбөр бүртгэгдлээ');
            onDone();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };
    const cls = 'h-7 w-full rounded-md border border-border-strong bg-surface px-2 text-[12.5px] outline-none focus:border-brand';
    return (
        <tr className="h-10 border-b border-brand/40 bg-brand-soft/30">
            <td className="px-2"><input value={label} onChange={(e) => setLabel(e.target.value)} className={cls} aria-label="Нэр" /></td>
            <td className="px-2"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(cls, 'mono-label')} aria-label="Огноо" /></td>
            <td className="px-2"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="33 100 000" className={cn(cls, 'num text-right')} aria-label="Дүн" /></td>
            <td className="px-2"><input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="numeric" placeholder="0" className={cn(cls, 'num text-right')} aria-label="Төлсөн" /></td>
            <td className="px-2" colSpan={2}>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={cls} aria-label="Хэлбэр">
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
            </td>
            <td className="px-2 text-right">
                <span className="inline-flex gap-1">
                    <button type="button" onClick={() => void submit()} disabled={add.isPending} className="inline-flex h-7 items-center gap-1 rounded-md bg-brand px-2 text-[12px] font-medium text-brand-fg hover:bg-brand-strong disabled:opacity-60">{add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={onDone} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2" aria-label="Болих"><X className="h-3.5 w-3.5" /></button>
                </span>
            </td>
        </tr>
    );
}
