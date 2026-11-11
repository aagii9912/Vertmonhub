'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useContractManagerOptions, useSetContractManager, useSetContractOrderDate, type ContractManagerOption } from '@/hooks/useContracts';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { formatMNTShort } from '@/lib/utils/currency';
import { ubDateStr } from '@/lib/utils/date';
import { ORDER_DATE_ERRORS, ORDER_DATE_MIN, orderDateIssue } from '@/lib/contracts/order-date';
import { confirmToast } from '@/components/ui/Toast';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { weeklyManualMetricNames, weeklyManualStatus, type WeeklyManual, type WeeklyManualContract, type WeeklyManualItem, type WeeklyManualUndatedContract } from '@/lib/dashboard/weekly-manual';
import { WeeklyPlanEditor } from './WeeklyPlanEditor';

export function useWeeklyManual(meetingDate: string, enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<WeeklyManual>({
        queryKey: ['weekly-manual', shop?.id, user?.id, meetingDate],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/weekly-manual?meetingDate=${meetingDate}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && enabled, staleTime: 60_000, retry: 1,
    });
}

const PENDING_LABEL: Record<WeeklyManualItem, (manual: WeeklyManual) => string> = {
    manager: manual => `менежергүй ${manual.managerless.count} гэрээ`,
    date: manual => `огноогүй ${manual.undated} гэрээ`,
    plan: manual => `${Number(manual.month.slice(5))}-р сарын гэрээний төлөвлөгөө`,
};

/**
 * Лхагвын тайлангийн «Гараар нөхөх» алхам: ERP-ийн файлд байдаггүй зүйлсийг (гэрээний менежер, огноо, сарын
 * төлөвлөгөө, өдөр тутмын тоо) нэг дор жагсаана. Менежер, огноо, сарын төлөвлөгөөг өөр хуудас руу явалгүй эндээс
 * шууд оруулна (эзэмшигчийн хүсэлт 2026-11-11); өдөр тутмын тоо «Өдрийн тайлан»-даа үлдэнэ.
 */
export function WeeklyManualFixes({ query, contractsFromErp, canEditContracts, canOpenContracts, canEditPlan, canOpenDaily, onDirty }: {
    query: ReturnType<typeof useWeeklyManual>;
    /** Гэрээг ERP-ийн гэрээний экспортоос уншдаг төсөл — менежер, огноо тэндээс ирнэ. */
    contractsFromErp: boolean;
    /** Гэрээний менежер, огноо оруулах: гэрээний бичих эрхтэй, хязгааргүй (удирдлагын) хэрэглэгч — сервер дахин шалгана. */
    canEditContracts: boolean;
    canOpenContracts: boolean;
    /** «Борлуулалтын төлөвлөгөө» хуудас (супер админ). */
    canEditPlan: boolean;
    canOpenDaily: boolean;
    /** Төлөвлөгөөний хадгалаагүй өөрчлөлттэй эсэх (хуудас алхам солихыг хаана). */
    onDirty: (dirty: boolean) => void;
}) {
    const { shop } = useAuth();
    const manual = query.data;
    const options = useContractManagerOptions(canEditContracts && !contractsFromErp && !!manual?.managerless.count);
    const [editingPlan, setEditingPlan] = useState(false);
    if (query.isPending) return <Skeleton className="h-64" />;
    if (!manual) return <p className="rounded-xl bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">Гараар нөхөх зүйлсийг ачаалж чадсангүй. {query.error?.message ?? 'Шинэчлэх товчоор дахин оролдоно уу.'}</p>;

    const status = weeklyManualStatus(manual, { contractsFromErp });
    const month = Number(manual.month.slice(5));
    const { managerless, undated } = manual;
    const undatedContracts = manual.undatedContracts ?? [];
    const planEntered = weeklyManualMetricNames(manual.plan, true);
    const planMissing = weeklyManualMetricNames(manual.plan, false);
    const actualsEntered = weeklyManualMetricNames(manual.manualActuals, true);

    return (
        <div className="space-y-5">
            {/* Бэлтгэлийн төлөв тул `role="status"` (дэлгэц уншигчийг тасалдуулахгүй). */}
            {status.ready
                ? <Alert variant="success" role="status">Гараар нөхөх зүйл алга. Дараагийн алхамд тоогоо шалгана.</Alert>
                : <Alert variant="warning" role="status">Нөхөх зүйл: {status.pending.map(item => PENDING_LABEL[item](manual)).join(', ')}.</Alert>}

            <ul className="divide-y divide-border rounded-2xl border border-border">
                <Item title="Гэрээний менежер"
                    badge={contractsFromErp ? <Badge variant="neutral">Хамаарахгүй</Badge> : managerless.count ? <Badge variant="warning">{managerless.count} гэрээ</Badge> : <Badge variant="success">Бүрэн</Badge>}
                    note={contractsFromErp ? 'Энэ төсөлд гэрээний менежер ERP-ийн гэрээний экспортоос ирдэг.'
                        : managerless.count ? `Гэрээний жагсаалтын файл менежергүй ирдэг. Менежергүй гэрээ тайланд «—» гэж гарч, менежерээр задалсан хүснэгт, давхрын зураглалд хэний ч нэр дээр орохгүй. ${canEditContracts ? 'Доорх мөр бүрт менежерээ сонгоод «Хадгалах» дарна.' : 'Менежерийг удирдлага (гэрээ засах эрхтэй хүн) сонгоно.'}`
                        : 'Амьд гэрээ бүр менежертэй.'}>
                    {!contractsFromErp && managerless.count > 0 && <>
                        {options.isError && <p className="text-xs text-status-danger">Менежерийн нэрсийг уншиж чадсангүй. Шинэчлэх товчоор дахин оролдоно уу.</p>}
                        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Менежергүй гэрээ">
                            {managerless.contracts.map(contract => <ManagerRow key={contract.id} contract={contract} options={options.data} loading={options.isLoading}
                                canEdit={canEditContracts} canOpen={canOpenContracts} />)}
                        </ul>
                        {managerless.count > managerless.contracts.length && <p className="text-xs text-muted-foreground">Эхний {managerless.contracts.length}-ийг харуулав — хадгалах тусам дараагийнх нь гарна.</p>}
                    </>}
                </Item>

                <Item title="Гэрээний огноо"
                    badge={contractsFromErp ? <Badge variant="neutral">Хамаарахгүй</Badge> : undated ? <Badge variant="warning">{undated} гэрээ</Badge> : <Badge variant="success">Бүрэн</Badge>}
                    note={contractsFromErp ? 'Энэ төсөлд гэрээний огноо ERP-ийн гэрээний экспортоос ирдэг.'
                        : undated ? `Огноогүй гэрээ долоо хоног, сарын тоонд орохгүй (тоо «N+» гэж гарна). ${canEditContracts ? 'Доорх мөр бүрт захиалга өгсөн огноог сонгоод «Хадгалах» дарна — огноог нэг удаа л оруулдаг, дараа нь солихгүй.' : 'Огноог удирдлага (гэрээ засах эрхтэй хүн) оруулна.'}`
                        : 'Огноогүй амьд гэрээ алга.'}
                    action={!contractsFromErp && undated > 0 && canOpenContracts && <Button href="/dashboard/contracts?filter=undated" size="sm" variant="secondary">Огноогүй гэрээ<ArrowUpRight /></Button>}>
                    {!contractsFromErp && undatedContracts.length > 0 && <>
                        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Огноогүй гэрээ">
                            {undatedContracts.map(contract => <DateRow key={contract.id} contract={contract} canEdit={canEditContracts} canOpen={canOpenContracts} />)}
                        </ul>
                        {undated > undatedContracts.length && <p className="text-xs text-muted-foreground">Эхний {undatedContracts.length}-ийг харуулав — хадгалах тусам дараагийнх нь гарна.</p>}
                    </>}
                </Item>

                <Item title={`Сарын төлөвлөгөө, гүйцэтгэл (${month}-р сар)`}
                    badge={!manual.plan.contractAmount ? <Badge variant="warning">Оруулаагүй</Badge> : planMissing.length ? <Badge variant="neutral">Зарим нь хоосон</Badge> : <Badge variant="success">Оруулсан</Badge>}
                    note={<>
                        {planEntered.length > 0 && `Төлөвлөгөө орсон: ${planEntered.join(', ')}. `}
                        {planMissing.length > 0 && `Төлөвлөгөө хоосон: ${planMissing.join(', ')} — эдгээрийн биелэлтийн хувь «—» гарна. `}
                        {actualsEntered.length
                            ? `Гүйцэтгэлийг гараар оруулсан: ${actualsEntered.join(', ')} — төлөвлөгөөний биелэлтэд системийн тооны оронд энэ дүн гарна.`
                            : 'Гүйцэтгэлийг гараар оруулаагүй — системийн бүртгэлээр тооцно (заавал биш).'}
                    </>}
                    action={!canEditPlan || !shop?.id
                        ? <p className="max-w-[180px] text-xs leading-relaxed text-muted-foreground">Төлөвлөгөө, гүйцэтгэлийг удирдлага (супер админ) оруулна.</p>
                        : !editingPlan && <Button size="sm" variant={manual.plan.contractAmount ? 'secondary' : 'primary'} onClick={() => setEditingPlan(true)}>{manual.plan.contractAmount ? 'Төлөвлөгөө засах' : 'Төлөвлөгөө оруулах'}</Button>}>
                    {editingPlan && canEditPlan && shop?.id && <WeeklyPlanEditor shopId={shop.id} month={manual.month} onClose={() => setEditingPlan(false)} onDirty={onDirty} />}
                </Item>

                <Item title="Дуудлага, чат, уулзалт" badge={<Badge variant="neutral">Өдөр бүр</Badge>}
                    note="Эдгээр тоог өдөр бүр «Өдрийн тайлан»-д оруулдаг. Албаны загварын слайдын идэвхжлийн хэсэг эндээс гарна; оруулаагүй өдөр «—» хэвээр үлдэнэ."
                    action={canOpenDaily && <Button href="/dashboard/daily-report" size="sm" variant="secondary">Өдрийн тайлан<ArrowUpRight /></Button>} />
            </ul>

            <p className="text-xs leading-relaxed text-muted-foreground">Засвар хийсний дараа энэ хуудас өөрөө шинэчлэгдэнэ. Лид, уулзалтын тоо буруу бол дараагийн алхмаас харж, тухайн лид, уулзалтын бүртгэл дээр нь засна.</p>
        </div>
    );
}

function Item({ title, badge, note, action, children }: { title: string; badge: ReactNode; note: ReactNode; action?: ReactNode; children?: ReactNode }) {
    return <li className="space-y-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[240px] flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3>{badge}</div>
                <p className="max-w-[80ch] text-sm leading-relaxed text-fg-2">{note}</p>
            </div>
            {action}
        </div>
        {children}
    </li>;
}

/** Гэрээний мөрийн зүүн тал: тоот (гэрээ рүү холбоос) ба товч мэдээлэл. */
function ContractLine({ contract, label, details, canOpen }: { contract: WeeklyManualContract; label: string; details: Array<string | null | false>; canOpen: boolean }) {
    return <div className="min-w-[220px] flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {canOpen ? <Link href={`/dashboard/contracts/${contract.id}`} className="hover:underline focus-ring">{label}</Link> : label}
            {contract.inWeek && <Badge variant="brand">Энэ долоо хоног</Badge>}
        </p>
        <p className="num mt-0.5 text-xs text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
    </div>;
}
const contractLabel = (contract: WeeklyManualContract) => contract.unit ?? contract.number ?? 'Гэрээ';

/**
 * Огноогүй нэг гэрээ: захиалга өгсөн огноог нэг удаа оруулна (гэрээний хуудасны «Огноо оруулах»-тай ижил PATCH, аудиттай;
 * гэрээний огноо мөн тэр өдөр болно). Дараа нь солигдохгүй тул хадгалахын өмнө баталгаажуулна.
 */
function DateRow({ contract, canEdit, canOpen }: { contract: WeeklyManualUndatedContract; canEdit: boolean; canOpen: boolean }) {
    const [value, setValue] = useState('');
    const setDate = useSetContractOrderDate(contract.id);
    const label = contractLabel(contract);
    const today = ubDateStr();
    const save = async () => {
        const issue = orderDateIssue(value, today);
        if (issue) { toast.error(issue === 'future' || issue === 'too_early' ? ORDER_DATE_ERRORS[issue] : 'Огноо буруу байна'); return; }
        const ok = await confirmToast({
            title: `${label}: огноог ${value} гэж хадгалах уу?`,
            description: 'Гэрээний огноо энэ өдөр болж, долоо хоног, сарын тоо, төлөвлөгөөний биелэлтэд орно. Хадгалсны дараа солихгүй.',
            confirmLabel: 'Хадгалах', cancelLabel: 'Болих',
        });
        if (!ok) return;
        setDate.mutate(value, {
            onSuccess: () => toast.success(`${label}: огноо ${value}`),
            onError: error => toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй'),
        });
    };
    return <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <ContractLine contract={contract} label={label} canOpen={canOpen}
            details={[contract.kindLabel, contract.block && `${contract.block} блок`, contract.manager ?? 'менежергүй', contract.customer, contract.total !== null && formatMNTShort(contract.total)]} />
        {setDate.isSuccess
            ? <p className="num inline-flex items-center gap-1.5 text-sm text-status-success"><Check className="size-4" aria-hidden />{setDate.variables}</p>
            : !contract.dateEntry ? <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">Захиалга өгсөн огноо бүртгэлтэй — гэрээг нээж шалгана.</p>
            : canEdit && <>
                <input type="date" value={value} min={ORDER_DATE_MIN} max={today} onChange={event => setValue(event.target.value)} aria-label={`${label}: захиалга өгсөн огноо`}
                    disabled={setDate.isPending} className="num h-9 rounded-md border border-control bg-surface px-2 text-sm text-foreground" />
                <Button size="sm" disabled={!value} isLoading={setDate.isPending} onClick={() => void save()} aria-label={`${label}: огноо хадгалах`}>Хадгалах</Button>
            </>}
    </li>;
}

/** Менежергүй нэг гэрээ: нэрсээс сонгоод хадгална (гэрээний хуудасны «Менежер оруулах»-тай ижил PATCH, аудиттай). */
function ManagerRow({ contract, options, loading, canEdit, canOpen }: { contract: WeeklyManualContract; options?: ContractManagerOption[]; loading: boolean; canEdit: boolean; canOpen: boolean }) {
    const [value, setValue] = useState('');
    const setManager = useSetContractManager(contract.id);
    const label = contractLabel(contract);
    const save = () => setManager.mutate(value, {
        onSuccess: () => toast.success(`${label}: менежер ${value}`),
        onError: error => toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй'),
    });
    return <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <ContractLine contract={contract} label={label} canOpen={canOpen}
            details={[contract.kindLabel, contract.block && `${contract.block} блок`, contract.date ?? 'огноогүй', contract.customer, contract.total !== null && formatMNTShort(contract.total)]} />
        {setManager.isSuccess
            ? <p className="inline-flex items-center gap-1.5 text-sm text-status-success"><Check className="size-4" aria-hidden />{setManager.variables}</p>
            : canEdit && <>
                <select value={value} onChange={event => setValue(event.target.value)} aria-label={`${label}: менежер`} disabled={loading || !options || setManager.isPending}
                    className="h-9 max-w-[16rem] rounded-md border border-control bg-surface px-2 text-sm text-foreground">
                    <option value="">{loading ? 'Уншиж байна…' : 'Менежер сонгох…'}</option>
                    {(options ?? []).map(option => <option key={option.name} value={option.name}>{option.name}{option.roster ? '' : ` · гэрээнд ${option.contracts}`}</option>)}
                </select>
                <Button size="sm" disabled={!value} isLoading={setManager.isPending} onClick={save} aria-label={`${label}: менежер хадгалах`}>Хадгалах</Button>
            </>}
    </li>;
}
