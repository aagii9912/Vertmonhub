'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCopy, Printer, RefreshCw, ArrowUpRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { openAiPanel } from '@/lib/ai/context';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

    return (
        <div className="space-y-4">
            <PageHeader title="Үйл ажиллагааны тайлан" subtitle="Бүртгэсэн лид, гэрээ, төлбөрөөс автоматаар нэгтгэнэ. Excel давхар бөглөх шаардлагагүй."
                className="print:hidden"
                secondaryActions={<>
                    <Button variant="secondary" disabled={!usable || isFetching} onClick={() => openAiPanel(`${range.from}-ээс ${range.to} хүртэлх үйл ажиллагааны нэгдсэн тайлангаас гэрээний зорилт, орсон мөнгө, анхаарах лидийг товч тайлбарла. Хугацаанд бүртгэсэн урьдчилгааг гэрээнд өмнө хадгалсан дүнгээс тусад нь тайлбарла.`)}><Sparkles className="size-4" />AI-аар тайлбарлуулах</Button>
                    <Button variant="secondary" onClick={() => refetch()} disabled={isFetching || !validRange || !shop?.id}><RefreshCw className="size-4" />Шинэчлэх</Button>
                    <Button variant="secondary" onClick={copy} disabled={!usable || isFetching}><ClipboardCopy className="size-4" />Хуулах</Button>
                </>}
                primaryAction={<Button onClick={() => window.print()} disabled={!usable || isFetching}><Printer className="size-4" />Хэвлэх / PDF</Button>}
            />
            <div className="flex flex-wrap items-end gap-3 print:hidden">
                <label className="text-xs text-muted-foreground">Эхлэх огноо<input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} className="mt-1 block rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-ring" /></label>
                <label className="text-xs text-muted-foreground">Дуусах огноо<input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} className="mt-1 block rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-ring" /></label>
                <p className="pb-2 text-xs text-muted-foreground">Улаанбаатарын цагаар · хоёр захын өдрийг оруулна</p>
            </div>
            {!validRange && <Alert variant="danger"><AlertDescription>Эхлэх, дуусах огноог зөв сонгоно уу. 367 хүртэл өдөр сонгож болно.</AlertDescription></Alert>}
            {error && <Alert variant="danger"><AlertTitle>Тайлан гарсангүй</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
            {!shop?.id && <Alert variant="info"><AlertDescription>Идэвхтэй төслөө сонгож тайлангаа харна уу.</AlertDescription></Alert>}
            {isPending && validRange && shop?.id && <p role="status" className="py-12 text-center text-muted-foreground">Тайлан нэгтгэж байна…</p>}
            {usable && <>
                <div>
                    <h1 className="text-xl font-semibold">{data.shopName} · Үйл ажиллагааны тайлан</h1>
                    <p className="mt-1 text-sm text-muted-foreground num">{data.range.from} – {data.range.to}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Шинэчилсэн: {formatShortDate(data.generatedAt)} {formatTime(data.generatedAt)} · Сонгосон төслийн бүх бүртгэл</p>
                </div>
                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
                    <div className="bg-surface p-4"><p className="text-xs text-muted-foreground">Гэрээний бүртгэлтэй дүн</p><Money value={data.contracts.value} compact className="mt-2 block text-2xl font-semibold" /><p className="mt-1 text-xs text-muted-foreground">Хугацаанд байгуулсан {data.contracts.count} гэрээ · цуцалсныг хассан</p></div>
                    <div className="bg-surface p-4"><p className="text-xs text-muted-foreground">Гэрээний төлөвлөгөөний биелэлт</p><p className="mt-2 text-2xl font-semibold num">{data.target.attainmentPct === null ? 'Тооцоогүй' : `${data.target.attainmentPct}%`}</p><p className="mt-1 text-xs text-muted-foreground">{data.target.amount !== null ? <>Зорилт: <Money value={data.target.amount} /></> : data.target.completeMonths ? `Зорилттой сар: ${data.target.configuredMonths}/${data.target.expectedMonths}` : 'Сарын зорилттой харьцуулахдаа бүтэн сар сонгоно'}</p></div>
                    <div className="bg-surface p-4"><p className="text-xs text-muted-foreground">Мөнгөөр орсон бүртгэл</p>{data.cash && data.cash.receiptCount > 0 ? <Money value={data.cash.receipts} compact className="mt-2 block text-2xl font-semibold" /> : <p className="mt-2 text-xl font-semibold">{data.cash ? 'Бүртгэл алга' : 'Санхүүгийн эрх шаардлагатай'}</p>}<p className="mt-1 text-xs text-muted-foreground">{data.cash ? `${data.cash.receiptCount} гүйлгээ · бэлэн, банк, ипотек` : 'Гүйлгээг сервер эрхээр хязгаарлана'}</p></div>
                    <div className="bg-surface p-4"><p className="text-xs text-muted-foreground">Үүнээс урьдчилгаа мөнгө</p>{data.cash?.receiptClassificationAvailable && data.cash.advanceReceiptCount > 0 ? <Money value={data.cash.advanceReceipts} compact className="mt-2 block text-2xl font-semibold" /> : <p className="mt-2 text-lg font-semibold">{!data.cash ? 'Санхүүгийн эрх шаардлагатай' : !data.cash.receiptClassificationAvailable ? 'Ангилал нэвтрээгүй' : data.cash.unclassifiedCashReceiptCount ? 'Ангилал дутуу' : 'Урьдчилгаа бүртгэлгүй'}</p>}<p className="mt-1 text-xs text-muted-foreground">Сонгосон хугацаанд урьдчилгаа гэж бүртгэсэн мөнгөн орлого</p></div>
                </div>
                {(data.contracts.missingAmounts > 0 || data.contracts.undatedCount > 0) && <Alert variant="warning"><AlertDescription>Дүн дутуу: {data.contracts.missingAmounts} гэрээ. Огноогүй тул хугацаанд ороогүй: {data.contracts.undatedCount} гэрээ. <Link href="/dashboard/contracts" className="underline">Гэрээний бүртгэл шалгах</Link></AlertDescription></Alert>}
                <Card className="break-inside-avoid">
                    <CardHeader><CardTitle>Мөнгөн урсгал ба урьдчилгаа</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {data.cash ? <>
                            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                        <div className="border-t border-border pt-4">
                            <p className="text-sm font-medium">Гэрээнд хадгалсан урьдчилгаа мөнгө: <Money value={data.advanceSnapshot.amount} /></p>
                            <p className="mt-1 text-xs text-muted-foreground">Нийт {data.advanceSnapshot.totalContracts} гэрээний {data.advanceSnapshot.recordedContracts}-д дүн хадгалсан. Импорт/өмнөх бүртгэлийн энэ дүнг шинэ гүйлгээ автоматаар өөрчлөхгүй. Энэ нь сонгосон хугацааны орлого биш; хугацааны урьдчилгаатай нэмж нийлбэрлэхгүй. Мөнгөн урсгалын зорилт тусдаа тохируулагдаагүй.</p>
                        </div>
                    </CardContent>
                </Card>
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="break-inside-avoid"><CardHeader><CardTitle>Алдагдах эрсдэлтэй лид — одоогийн байдлаар</CardTitle></CardHeader><CardContent>
                        <p className="mb-3 text-xs text-muted-foreground">Идэвхтэй {data.leads.health.active} лид. Доорх ангиллууд давхцаж болно. Огнооны шүүлт энэ хэсэгт үйлчлэхгүй.</p>
                        <ul className="divide-y divide-border">{[
                            ['Эзэнгүй', data.leads.health.ownerless, 'unassigned'],
                            ['Анхны холбоо бүртгээгүй', data.leads.health.awaitingContact, 'uncontacted'],
                            ['Дараагийн алхамгүй', data.leads.health.noNextStep, 'no_followup'],
                            ['Холбоо / уулзалтын хугацаа хэтэрсэн', data.leads.health.overdue, 'overdue'],
                        ].map(([label, count, queue]) => <li key={queue}><Link href={`/dashboard/leads?queue=${queue}`} className="flex items-center justify-between gap-2 py-3 text-sm hover:text-brand-strong"><span>{label}</span><span className="flex items-center gap-2 num font-semibold">{count}<ArrowUpRight className="size-3.5 print:hidden" /></span></Link></li>)}</ul>
                    </CardContent></Card>
                    <Card className="break-inside-avoid"><CardHeader><CardTitle>Хугацаанд шинээр орсон лид · {data.leads.newCount}</CardTitle></CardHeader><CardContent>
                        {data.leads.bySource.length ? <ul className="divide-y divide-border">{data.leads.bySource.map(row => <li key={row.source} className="flex justify-between py-3 text-sm"><span>{sourceLabel(row.source)}</span><span className="num font-medium">{row.count}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Сонгосон хугацаанд шинэ лид бүртгэгдээгүй.</p>}
                        <Link href="/dashboard/reports/kpi" className="mt-4 inline-flex items-center gap-1 text-sm text-brand-strong print:hidden">Ажилтны сарын хийсэн ажлын тайлан<ArrowUpRight className="size-4" /></Link>
                    </CardContent></Card>
                </div>
            </>}
        </div>
    );
}

export default function OperationsReportPage() {
    return <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Тайлан ачаалж байна…</p>}><OperationsReportContent /></Suspense>;
}
