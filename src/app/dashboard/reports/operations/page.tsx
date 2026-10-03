'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCopy, MoreHorizontal, Printer, RefreshCw, ArrowUpRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { openAiPanel } from '@/lib/ai/context';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';
import { Money } from '@/components/ui/Money';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { sourceLabel } from '@/lib/leads/labels';
import { OperationsRangeSchema, formatOperationsReportText, type OperationsReport } from '@/lib/dashboard/operations-report';
import { formatShortDate, formatTime, ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';

function OperationsReportContent() {
    const { shop } = useAuth();
    const search = useSearchParams();
    const [range, setRange] = useState(() => {
        const { year, month } = ubParts();
        const current = ubMonthRange(year, month - 1);
        return { from: search.get('from') ?? ubDateStr(current.start), to: search.get('to') ?? ubDateStr(new Date(current.end.getTime() - 1)) };
    });
    const validRange = OperationsRangeSchema.safeParse(range).success;
    const { data, error, isPending, isFetching, refetch } = useQuery<OperationsReport>({
        queryKey: ['operations-report', shop?.id, range.from, range.to],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/operations?${new URLSearchParams(range)}`, { signal }),
        enabled: !!shop?.id && validRange,
        staleTime: 60_000,
        retry: 1,
    });
    const usable = !!data && !error && validRange;
    const copy = async () => {
        if (!usable) return;
        try { await navigator.clipboard.writeText(formatOperationsReportText(data)); toast.success('Тайлан хууллаа'); }
        catch { toast.error('Хуулж чадсангүй. Хэвлэх товчоор PDF болгон хадгалж болно.'); }
    };
    const askAi = () => openAiPanel(`${range.from}-ээс ${range.to} хүртэлх үйл ажиллагааны нэгдсэн тайлангаас гэрээний зорилт, орсон мөнгө, анхаарах лидийг товч тайлбарла. Хугацаанд бүртгэсэн урьдчилгааг гэрээнд өмнө хадгалсан дүнгээс тусад нь тайлбарла.`);
    const reportActionDisabled = !usable || isFetching;
    const refreshDisabled = isFetching || !validRange || !shop?.id;

    return (
        <div className="space-y-3">
            <PageHeader title="Үйл ажиллагааны тайлан" subtitle="Лид, гэрээ, төлбөр."
                className="print:hidden"
                secondaryActions={<>
                    <span className="hidden md:contents">
                        <Button variant="secondary" disabled={reportActionDisabled} onClick={askAi}><Sparkles className="size-4" />AI-аар тайлбарлуулах</Button>
                        <Button variant="secondary" onClick={() => refetch()} disabled={refreshDisabled}><RefreshCw className="size-4" />Шинэчлэх</Button>
                        <Button variant="secondary" onClick={copy} disabled={reportActionDisabled}><ClipboardCopy className="size-4" />Хуулах</Button>
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="secondary" className="md:hidden"><MoreHorizontal className="size-4" />Үйлдэл</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuItem disabled={reportActionDisabled} onSelect={askAi}><Sparkles />AI-аар тайлбарлуулах</DropdownMenuItem>
                            <DropdownMenuItem disabled={refreshDisabled} onSelect={() => void refetch()}><RefreshCw />Шинэчлэх</DropdownMenuItem>
                            <DropdownMenuItem disabled={reportActionDisabled} onSelect={() => void copy()}><ClipboardCopy />Хуулах</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>}
                primaryAction={<Button size="lg" className="min-h-14 md:min-h-[44px]" onClick={() => window.print()} disabled={!usable || isFetching}><Printer className="size-4" />Хэвлэх / PDF</Button>}
            />
            <div className="flex flex-wrap items-end gap-3 print:hidden">
                <label className="text-xs text-muted-foreground">Эхлэх огноо<input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} className="mt-1 block h-11 rounded-md border border-border bg-surface px-3 py-0 text-sm text-foreground focus-ring md:h-[34px]" /></label>
                <label className="text-xs text-muted-foreground">Дуусах огноо<input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} className="mt-1 block h-11 rounded-md border border-border bg-surface px-3 py-0 text-sm text-foreground focus-ring md:h-[34px]" /></label>
                <p className="pb-2 text-xs text-muted-foreground">Улаанбаатарын цагаар · хоёр захын өдрийг оруулна</p>
            </div>
            {!validRange && <Alert variant="danger"><AlertDescription>Эхлэх, дуусах огноог зөв сонгоно уу. 367 хүртэл өдөр сонгож болно.</AlertDescription></Alert>}
            {error && <Alert variant="danger"><AlertTitle>Тайлан гарсангүй</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
            {!shop?.id && <Alert variant="info"><AlertDescription>Идэвхтэй төслөө сонгож тайлангаа харна уу.</AlertDescription></Alert>}
            {isPending && validRange && shop?.id && <p role="status" className="py-12 text-center text-muted-foreground">Тайлан нэгтгэж байна…</p>}
            {usable && <>
                <div className="border-b border-border pb-2">
                    {/* PageHeader хэвлэхэд нуугддаг тул PDF-д тайлангийн нэрийг энд гаргана. */}
                    <h1 className="hidden text-xl font-semibold print:block">{data.shopName} · Үйл ажиллагааны тайлан</h1>
                    <p className="text-sm font-medium text-foreground print:hidden">{data.shopName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground num">{data.range.from} – {data.range.to}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Шинэчилсэн: {formatShortDate(data.generatedAt)} {formatTime(data.generatedAt)} · Сонгосон төслийн бүх бүртгэл</p>
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface sm:grid sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 p-2.5 sm:block sm:border-r sm:border-b sm:border-border xl:border-b-0"><p className="text-xs text-muted-foreground">Гэрээний бүртгэлтэй дүн</p><Money value={data.contracts.value} compact className="row-span-2 block text-right text-xl font-semibold sm:mt-1.5 sm:text-left" /><p className="col-span-2 mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none">Хугацаанд байгуулсан {data.contracts.count} гэрээ · цуцалсныг хассан</p></div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 p-2.5 sm:block sm:border-b sm:border-border xl:border-r xl:border-b-0"><p className="text-xs text-muted-foreground">Гэрээний төлөвлөгөөний биелэлт</p><p className="row-span-2 text-right text-xl font-semibold num sm:mt-1.5 sm:text-left">{data.target.attainmentPct === null ? 'Тооцоогүй' : `${data.target.attainmentPct}%`}</p><p className="col-span-2 mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none">{data.target.amount !== null ? <>Зорилт: <Money value={data.target.amount} /></> : data.target.completeMonths ? `Зорилттой сар: ${data.target.configuredMonths}/${data.target.expectedMonths}` : 'Сарын зорилттой харьцуулахдаа бүтэн сар сонгоно'}</p></div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 p-2.5 sm:block sm:border-r sm:border-border"><p className="text-xs text-muted-foreground">Мөнгөөр орсон бүртгэл</p>{data.cash && data.cash.receiptCount > 0 ? <Money value={data.cash.receipts} compact className="row-span-2 block text-right text-xl font-semibold sm:mt-1.5 sm:text-left" /> : <p className="row-span-2 max-w-[132px] text-right text-[13px] font-semibold leading-4 sm:mt-1.5 sm:max-w-none sm:text-left sm:text-base">{data.cash ? 'Бүртгэл алга' : 'Санхүүгийн эрх шаардлагатай'}</p>}<p className="col-span-2 mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none">{data.cash ? `${data.cash.receiptCount} гүйлгээ · бэлэн, банк, ипотек` : 'Гүйлгээг сервер эрхээр хязгаарлана'}</p></div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 p-2.5 sm:block"><p className="text-xs text-muted-foreground">Үүнээс урьдчилгаа мөнгө</p>{data.cash?.receiptClassificationAvailable && data.cash.advanceReceiptCount > 0 ? <Money value={data.cash.advanceReceipts} compact className="row-span-2 block text-right text-xl font-semibold sm:mt-1.5 sm:text-left" /> : <p className="row-span-2 max-w-[132px] text-right text-[13px] font-semibold leading-4 sm:mt-1.5 sm:max-w-none sm:text-left sm:text-base">{!data.cash ? 'Санхүүгийн эрх шаардлагатай' : !data.cash.receiptClassificationAvailable ? 'Ангилал нэвтрээгүй' : data.cash.unclassifiedCashReceiptCount ? 'Ангилал дутуу' : 'Урьдчилгаа бүртгэлгүй'}</p>}<p className="col-span-2 mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none">Сонгосон хугацаанд урьдчилгаа гэж бүртгэсэн мөнгөн орлого</p></div>
                </div>
                {(data.contracts.missingAmounts > 0 || data.contracts.undatedCount > 0) && <Alert variant="warning"><AlertDescription>Дүн дутуу: {data.contracts.missingAmounts} гэрээ. Огноогүй тул хугацаанд ороогүй: {data.contracts.undatedCount} гэрээ. <Link href="/dashboard/contracts" className="underline">Гэрээний бүртгэл шалгах</Link></AlertDescription></Alert>}
                <section className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                    <section className="break-inside-avoid">
                        <header className="flex h-10 items-center border-b border-border px-3.5"><h2 className="text-[12.5px] font-semibold text-foreground">Мөнгөн урсгал ба урьдчилгаа</h2></header>
                        <div className="space-y-3 p-3.5">
                            {data.cash ? <>
                                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                    {[
                                        ['Гэрээтэй холбоотой орлого', data.cash.contractReceipts],
                                        ['Мөнгөөр гарсан бүртгэл', data.cash.disbursements],
                                        ['Бүртгэсэн цэвэр урсгал', data.cash.net],
                                        ['Бартер орлого (мөнгөнд ороогүй)', data.cash.barterReceipts],
                                    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium"><Money value={Number(value)} /></dd></div>)}
                                </dl>
                                <p className="text-sm text-muted-foreground">Зөвхөн системд огноогоор бүртгэсэн гүйлгээг тооцов. Банкны хуулгатай тулгаагүй; бүртгээгүй төлбөр энэ тайланд орохгүй. Урьдчилгаа мөнгө нь нийт орсон мөнгөний нэг хэсэг бөгөөд тусад нь нэмж нийлбэрлэхгүй.</p>
                                {!data.cash.receiptClassificationAvailable ? <Alert variant="info"><AlertDescription>Гүйлгээг урьдчилгаа, ээлжит төлбөр гэж ангилах боломж энэ орчинд хараахан нэвтрээгүй. Хугацааны урьдчилгааг тооцоогүй.</AlertDescription></Alert> : data.cash.unclassifiedCashReceiptCount > 0 && <Alert variant="warning"><AlertDescription><Money value={data.cash.unclassifiedCashReceipts} /> дүнтэй {data.cash.unclassifiedCashReceiptCount} мөнгөн орлого ангилагдаагүй. Урьдчилгааны дүн зөвхөн ангилсан гүйлгээг хамарна.</AlertDescription></Alert>}
                                {data.cash.unclassifiedCount > 0 && <Alert variant="warning"><AlertDescription>Төлбөрийн хэлбэр тодорхойгүй {data.cash.unclassifiedCount} гүйлгээ байна. Үүний <Money value={data.cash.unclassifiedReceipts} /> орлогыг мөнгөн урсгалд оруулаагүй.</AlertDescription></Alert>}
                                <Link href="/dashboard/finance" className="inline-flex items-center gap-1 text-sm text-brand-strong print:hidden">Гүйлгээний дэвтэр шалгах<ArrowUpRight className="size-4" /></Link>
                            </> : <p className="text-sm text-muted-foreground">Мөнгөн урсгалын дэлгэрэнгүйг санхүүгийн эрхтэй ажилтан харна.</p>}
                            <div className="border-t border-border pt-3">
                                <p className="text-sm font-medium">Гэрээнд хадгалсан урьдчилгаа мөнгө: <Money value={data.advanceSnapshot.amount} /></p>
                                <p className="mt-1 text-xs text-muted-foreground">Нийт {data.advanceSnapshot.totalContracts} гэрээний {data.advanceSnapshot.recordedContracts}-д дүн хадгалсан. Импорт/өмнөх бүртгэлийн энэ дүнг шинэ гүйлгээ автоматаар өөрчлөхгүй. Энэ нь сонгосон хугацааны орлого биш; хугацааны урьдчилгаатай нэмж нийлбэрлэхгүй. Мөнгөн урсгалын зорилт тусдаа тохируулагдаагүй.</p>
                            </div>
                        </div>
                    </section>
                    <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-border">
                        <section className="break-inside-avoid">
                            <header className="flex h-10 items-center border-b border-border px-3.5"><h2 className="text-[12.5px] font-semibold text-foreground">Алдагдах эрсдэлтэй лид — одоогийн байдлаар</h2></header>
                            <div className="p-3.5"><p className="mb-2 text-xs text-muted-foreground">Идэвхтэй {data.leads.health.active} лид. Доорх ангиллууд давхцаж болно. Огнооны шүүлт энэ хэсэгт үйлчлэхгүй.</p>
                                <ul className="divide-y divide-border">{[
                                    ['Эзэнгүй', data.leads.health.ownerless, 'unassigned'],
                                    ['Анхны холбоо бүртгээгүй', data.leads.health.awaitingContact, 'uncontacted'],
                                    ['Дараагийн алхамгүй', data.leads.health.noNextStep, 'no_followup'],
                                    ['Холбоо / уулзалтын хугацаа хэтэрсэн', data.leads.health.overdue, 'overdue'],
                                ].map(([label, count, queue]) => <li key={queue}><Link href={`/dashboard/leads?queue=${queue}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-brand-strong"><span>{label}</span><span className="flex items-center gap-2 num font-semibold">{count}<ArrowUpRight className="size-3.5 print:hidden" /></span></Link></li>)}</ul>
                            </div>
                        </section>
                        <section className="break-inside-avoid">
                            <header className="flex h-10 items-center border-b border-border px-3.5"><h2 className="text-[12.5px] font-semibold text-foreground">Хугацаанд шинээр орсон лид · {data.leads.newCount}</h2></header>
                            <div className="p-3.5">
                                {data.leads.bySource.length ? <ul className="divide-y divide-border">{data.leads.bySource.map(row => <li key={row.source} className="flex justify-between py-2.5 text-sm"><span>{sourceLabel(row.source)}</span><span className="num font-medium">{row.count}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Сонгосон хугацаанд шинэ лид бүртгэгдээгүй.</p>}
                                <Link href="/dashboard/reports/kpi" className="mt-3 inline-flex items-center gap-1 text-sm text-brand-strong print:hidden">Ажилтны сарын хийсэн ажлын тайлан<ArrowUpRight className="size-4" /></Link>
                            </div>
                        </section>
                    </div>
                </section>
            </>}
        </div>
    );
}

export default function OperationsReportPage() {
    return <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Тайлан ачаалж байна…</p>}><OperationsReportContent /></Suspense>;
}
