'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useContractManagerOptions, useSetContractManager, type ContractManagerOption } from '@/hooks/useContracts';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { formatMNTShort } from '@/lib/utils/currency';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { weeklyManualMetricNames, weeklyManualStatus, type WeeklyManual, type WeeklyManualContract, type WeeklyManualItem } from '@/lib/dashboard/weekly-manual';

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
 * төлөвлөгөө, өдөр тутмын тоо) нэг дор жагсааж, тус бүр хаана засахыг заана. Менежерийг мөр дээр нь шууд сонгоно.
 */
export function WeeklyManualFixes({ query, contractsFromErp, canSetManager, canOpenContracts, canEditPlan, canOpenDaily }: {
    query: ReturnType<typeof useWeeklyManual>;
    /** Гэрээг ERP-ийн гэрээний экспортоос уншдаг төсөл — менежер, огноо тэндээс ирнэ. */
    contractsFromErp: boolean;
    /** Гэрээний менежер солих: гэрээний бичих эрхтэй, хязгааргүй (удирдлагын) хэрэглэгч — сервер дахин шалгана. */
    canSetManager: boolean;
    canOpenContracts: boolean;
    /** «Борлуулалтын төлөвлөгөө» хуудас (супер админ). */
    canEditPlan: boolean;
    canOpenDaily: boolean;
}) {
    const manual = query.data;
    const options = useContractManagerOptions(canSetManager && !contractsFromErp && !!manual?.managerless.count);
    if (query.isPending) return <Skeleton className="h-64" />;
    if (!manual) return <p className="rounded-xl bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">Гараар нөхөх зүйлсийг ачаалж чадсангүй. {query.error?.message ?? 'Шинэчлэх товчоор дахин оролдоно уу.'}</p>;

    const status = weeklyManualStatus(manual, { contractsFromErp });
    const month = Number(manual.month.slice(5));
    const { managerless, undated } = manual;
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
                        : managerless.count ? `Гэрээний жагсаалтын файл менежергүй ирдэг. Менежергүй гэрээ тайланд «—» гэж гарч, менежерээр задалсан хүснэгт, давхрын зураглалд хэний ч нэр дээр орохгүй. ${canSetManager ? 'Доорх мөр бүрт менежерээ сонгоод «Хадгалах» дарна.' : 'Менежерийг удирдлага (гэрээ засах эрхтэй хүн) сонгоно.'}`
                        : 'Амьд гэрээ бүр менежертэй.'}>
                    {!contractsFromErp && managerless.count > 0 && <>
                        {options.isError && <p className="text-xs text-status-danger">Менежерийн нэрсийг уншиж чадсангүй. Шинэчлэх товчоор дахин оролдоно уу.</p>}
                        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Менежергүй гэрээ">
                            {managerless.contracts.map(contract => <ManagerRow key={contract.id} contract={contract} options={options.data} loading={options.isLoading}
                                canEdit={canSetManager} canOpen={canOpenContracts} />)}
                        </ul>
                        {managerless.count > managerless.contracts.length && <p className="text-xs text-muted-foreground">Эхний {managerless.contracts.length}-ийг харуулав — хадгалах тусам дараагийнх нь гарна.</p>}
                    </>}
                </Item>

                <Item title="Гэрээний огноо"
                    badge={contractsFromErp ? <Badge variant="neutral">Хамаарахгүй</Badge> : undated ? <Badge variant="warning">{undated} гэрээ</Badge> : <Badge variant="success">Бүрэн</Badge>}
                    note={contractsFromErp ? 'Энэ төсөлд гэрээний огноо ERP-ийн гэрээний экспортоос ирдэг.'
                        : undated ? 'Огноогүй гэрээ долоо хоног, сарын тоонд орохгүй (тоо «N+» гэж гарна). Гэрээг нээгээд «Огноо оруулах» дарна — огноог нэг удаа л оруулдаг.'
                        : 'Огноогүй амьд гэрээ алга.'}
                    action={!contractsFromErp && undated > 0 && canOpenContracts && <Button href="/dashboard/contracts?filter=undated" size="sm" variant="secondary">Огноогүй гэрээ<ArrowUpRight /></Button>} />

                <Item title={`Сарын төлөвлөгөө, гүйцэтгэл (${month}-р сар)`}
                    badge={!manual.plan.contractAmount ? <Badge variant="warning">Оруулаагүй</Badge> : planMissing.length ? <Badge variant="neutral">Зарим нь хоосон</Badge> : <Badge variant="success">Оруулсан</Badge>}
                    note={<>
                        {planEntered.length > 0 && `Төлөвлөгөө орсон: ${planEntered.join(', ')}. `}
                        {planMissing.length > 0 && `Төлөвлөгөө хоосон: ${planMissing.join(', ')} — эдгээрийн биелэлтийн хувь «—» гарна. `}
                        {actualsEntered.length
                            ? `Гүйцэтгэлийг гараар оруулсан: ${actualsEntered.join(', ')} — төлөвлөгөөний биелэлтэд системийн тооны оронд энэ дүн гарна.`
                            : 'Гүйцэтгэлийг гараар оруулаагүй — системийн бүртгэлээр тооцно (заавал биш).'}
                    </>}
                    action={canEditPlan
                        ? <Button href="/admin/sales-targets" size="sm" variant={manual.plan.contractAmount ? 'secondary' : 'primary'}>Төлөвлөгөө оруулах<ArrowUpRight /></Button>
                        : <p className="max-w-[180px] text-xs leading-relaxed text-muted-foreground">Төлөвлөгөө, гүйцэтгэлийг удирдлага (супер админ) оруулна.</p>} />

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

/** Менежергүй нэг гэрээ: нэрсээс сонгоод хадгална (гэрээний хуудасны «Менежер оруулах»-тай ижил PATCH, аудиттай). */
function ManagerRow({ contract, options, loading, canEdit, canOpen }: { contract: WeeklyManualContract; options?: ContractManagerOption[]; loading: boolean; canEdit: boolean; canOpen: boolean }) {
    const [value, setValue] = useState('');
    const setManager = useSetContractManager(contract.id);
    const label = contract.unit ?? contract.number ?? 'Гэрээ';
    const details = [contract.kindLabel, contract.block && `${contract.block} блок`, contract.date ?? 'огноогүй', contract.customer, contract.total !== null && formatMNTShort(contract.total)].filter(Boolean).join(' · ');
    const save = () => setManager.mutate(value, {
        onSuccess: () => toast.success(`${label}: менежер ${value}`),
        onError: error => toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй'),
    });
    return <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-[220px] flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {canOpen ? <Link href={`/dashboard/contracts/${contract.id}`} className="hover:underline focus-ring">{label}</Link> : label}
                {contract.inWeek && <Badge variant="brand">Энэ долоо хоног</Badge>}
            </p>
            <p className="num mt-0.5 text-xs text-muted-foreground">{details}</p>
        </div>
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
