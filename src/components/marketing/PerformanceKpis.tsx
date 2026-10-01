import { type MarketingPerformance } from '@/lib/marketing/performance';
import { formatMNTShort } from '@/lib/utils/currency';

const percent = (value: number | null) => value === null ? '—' : `${value}%`;
const cost = (value: number | null) => value === null ? '—' : formatMNTShort(value);

export function PerformanceKpis({ report }: { report: MarketingPerformance }) {
    const current = report.totals;
    const previous = report.previous;
    const costNote = !current.spendComplete ? 'Ханш дутуу · өртөг тооцоогүй' : !current.hasSpend ? 'Зардал бүртгээгүй' : 'Тухайн лидийн тоо 0 · өртөг тооцоогүй';
    const metrics = [
        { label: 'Менежерт шилжсэн хувь', value: percent(current.salesPct), helper: `Шилжсэн / шинэ лид · өмнөх ${percent(previous.salesPct)}` },
        { label: 'Гэрээтэй болсон хувь', value: percent(current.dealPct), helper: `Гэрээтэй / шинэ лид · өмнөх ${percent(previous.dealPct)}` },
        { label: 'Бүртгэсэн зардал', value: current.hasSpend || !current.spendComplete ? formatMNTShort(current.spend) : '—', helper: current.spendComplete ? 'Сонгосон хугацааны бүртгэл' : 'Ханшгүй зардал нийтэд ороогүй' },
        { label: 'Нэг лидийн өртөг', value: cost(current.costPerLead), helper: current.costPerLead === null ? costNote : `Өмнөх ${cost(previous.costPerLead)}` },
        { label: 'Нэг шилжсэн лидийн өртөг', value: cost(current.costPerSale), helper: current.costPerSale === null ? costNote : `Өмнөх ${cost(previous.costPerSale)}` },
        { label: 'Нэг гэрээтэй лидийн өртөг', value: cost(current.costPerDeal), helper: current.costPerDeal === null ? costNote : `Өмнөх ${cost(previous.costPerDeal)}` },
    ];
    return <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-6 rounded-2xl border border-border p-5 sm:grid-cols-3">
            {metrics.map(metric => <div key={metric.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className="mt-2 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{metric.value}</dd>
                <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.helper}</dd>
            </div>)}
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">Хөрвөлт нь хугацаанд үүссэн лидийн бүлгээр. Өртөг нь тухайн хугацааны бүртгэсэн зардлыг хуваасан дүн; бүх зардал бүртгэгдсэн эсэхийг тулгана. — = зардал эсвэл тооцох суурь алга.</p>
        <details className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium focus-ring">Хэмжүүрийн хамрах хүрээ</summary>
            <dl className="mt-3 space-y-2 leading-relaxed">
                <div><dt className="font-medium text-foreground">Шинэ лид</dt><dd>Сонгосон хугацаанд үүссэн CRM лид. Дуудлага, form response, мессежийн тоо тусдаа хэмжүүр.</dd></div>
                <div><dt className="font-medium text-foreground">Менежерт шилжсэн лид</dt><dd>Шилжүүлсэн огноо бүртгэлтэй лид. Qualified Lead-ийн шалгуур хангасан эсэхийг энэ тоо батлахгүй.</dd></div>
                <div><dt className="font-medium text-foreground">Гэрээтэй лид</dt><dd>Хугацаанд үүссэн лидээс хугацааны эцэс хүртэл хүчинтэй гэрээтэй болсон давхардалгүй лид.</dd></div>
                <div><dt className="font-medium text-foreground">Сошиал ба хүргэлтийн үзүүлэлт</dt><dd>Views, Viewers, Reach, SMS хүргэлт, CallPro, ManyChat-ийн дүн энэ тайлангийн нийтэд ороогүй. Эх сурвалжийн хугацаа, нэгж, давхардлыг тусад нь тулгана.</dd></div>
            </dl>
        </details>
    </div>;
}

export function PerformanceChannelTable({ report, showEmpty = false }: { report: MarketingPerformance; showEmpty?: boolean }) {
    const channels = report.channels.filter(channel => showEmpty || channel.leads > 0 || channel.hasSpend || !channel.spendComplete);
    return <div className="space-y-3">
        <div className="max-w-full overflow-x-auto focus-ring print:overflow-visible" tabIndex={0} role="region" aria-label="Маркетингийн сувгийн KPI">
            <table className="w-full min-w-[680px] text-left text-sm print:min-w-0 print:text-xs">
                <caption className="sr-only">Сувгаар лид, шилжилт, гэрээлэлт, зардал, нэг лидийн өртөг</caption>
                <thead className="border-b border-border text-xs text-muted-foreground"><tr>
                    {['Суваг', 'Лид', 'Шилжсэн', 'Гэрээтэй', 'Гэрээ %', 'Зардал (₮)', 'Нэг лид (₮)'].map((label, index) => <th key={label} scope="col" className={`px-2 py-3 font-medium ${index ? 'text-right' : ''}`}>{label}</th>)}
                </tr></thead>
                <tbody>{channels.map(channel => <tr key={channel.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-2 py-3 font-medium">{channel.name}</th>
                    <td className="px-2 text-right tabular-nums">{channel.leads}</td>
                    <td className="px-2 text-right tabular-nums">{channel.sales}</td>
                    <td className="px-2 text-right tabular-nums">{channel.deals}</td>
                    <td className="px-2 text-right tabular-nums">{percent(channel.dealPct)}</td>
                    <td className="px-2 text-right tabular-nums">{channel.hasSpend || !channel.spendComplete ? formatMNTShort(channel.spend) : '—'}{!channel.spendComplete && <span className="block text-xs text-muted-foreground">Ханш дутуу</span>}</td>
                    <td className="px-2 text-right tabular-nums">{cost(channel.costPerLead)}</td>
                </tr>)}</tbody>
            </table>
        </div>
        {!channels.length && <p className="py-3 text-sm text-muted-foreground">Энэ хугацаанд лид, зардлын бүртгэл алга.</p>}
    </div>;
}
