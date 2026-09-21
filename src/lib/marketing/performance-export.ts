import { buildWorkbookBuffer, type WorkbookSheetSpec } from '@/lib/utils/xlsx';
import { MARKETING_CHANNELS, marketingChannel, performanceChange, type MarketingPerformance } from './performance';

/** Snapshot export: every sheet uses the exact same report as the UI and AI. */
export function exportMarketingPerformance(r: MarketingPerformance) {
    const sheets: WorkbookSheetSpec[] = [
        { name: 'Хураангуй', colWidths: [36, 24, 24, 24], aoa: [
            ['Хугацаа', r.range.from, r.range.to], ['Өмнөх хугацаа', r.previousRange.from, r.previousRange.to],
            ['Үзүүлэлт', 'Бодит', 'Өмнөх', 'Өөрчлөлт %'],
            ...(['activities', 'leads', 'sales', 'deals'] as const).map((key, i) => [['Акц / контент', 'Lead', 'Sales', 'Deal'][i], r.totals[key], r.previous[key], performanceChange(r.totals[key], r.previous[key])]),
            ['Зарцуулалт (₮)', r.totals.spend, r.previous.spend],
            ['Тайлбар', 'Хоосон нүд = тооцох суурь эсвэл зорилт байхгүй. Хувийн баганууд 0–100 хэмжээсээр.'],
        ] },
        { name: 'Төсөл бүрийн гүйцэтгэл', colWidths: [28, ...Array(13).fill(20)], aoa: [
            ['Төсөл', 'Акц / контент', 'Контент', 'Lead', 'Sales', 'Deal', 'Lead → Sales %', 'Lead → Deal %', ...Object.values(MARKETING_CHANNELS)],
            ...r.projects.map(p => [p.name, p.activities, p.content, p.leads, p.sales, p.deals, p.salesPct, p.dealPct, ...p.channels.map(c => c.count)]),
        ] },
        { name: 'Сувгаар харьцаа', colWidths: [30, 20, 20, 20, 20], aoa: [
            ['Суваг', 'Lead', 'Sales', 'Deal', 'Deal %'], ...r.channels.map(c => [c.name, c.leads, c.sales, c.deals, c.dealPct]),
        ] },
        { name: 'Сүүлийн акцууд', colWidths: [16, 28, 36, 28, 18, 18, 18], aoa: [
            ['Огноо', 'Төсөл', 'Ажил', 'Суваг', 'Lead', 'Sales', 'Deal'],
            ...r.recent.map(a => [a.completed_on, a.projectName, a.name, MARKETING_CHANNELS[marketingChannel(a.channel)], a.leads, a.sales, a.deals]),
        ] },
        { name: 'Багийн гүйцэтгэл', colWidths: [26, 28, ...Array(17).fill(23)], aoa: [
            ['Менежер', 'Төсөл', 'Төлөвлөгөө %', 'Lead зорилт', 'Бодит Lead', 'Lead биелэлт %', 'Deal зорилт', 'Бодит Deal', 'Deal биелэлт %', 'Төсөв (₮)', 'Зарцуулсан (₮)', 'Зөрүү (₮)', 'Зөрүү %', 'Өмнөх Lead', 'Lead өөрчлөлт %', 'Өмнөх Deal', 'Deal өөрчлөлт %', 'Өмнөх зардал (₮)', 'Зардлын өөрчлөлт %'],
            ...r.team.map(t => [t.name, t.projectName, t.planPct, t.target?.lead_target, t.leads, t.leadAttainment, t.target?.deal_target, t.deals, t.dealAttainment, t.budget, t.spend, t.variance, t.variancePct, t.previousLeads, t.leadChange, t.previousDeals, t.dealChange, t.previousSpend, t.spendChange]),
            ['Нийт', '', r.teamTotal.planPct, r.teamTotal.leadTarget, r.teamTotal.leads, r.teamTotal.leadAttainment, r.teamTotal.dealTarget, r.teamTotal.deals, r.teamTotal.dealAttainment, r.teamTotal.budget, r.teamTotal.spend, r.teamTotal.variance, r.teamTotal.variancePct, r.teamTotal.previousLeads, r.teamTotal.leadChange, r.previous.deals, performanceChange(r.totals.deals, r.previous.deals), r.previous.spend, performanceChange(r.totals.spend, r.previous.spend)],
        ] },
        { name: 'Тооцооны тайлбар', colWidths: [48, 100], aoa: [
            ['Ханшгүй Meta мөр', r.spendQuality.current.missingFx], ['Өмнөх хугацаанд ханшгүй Meta', r.spendQuality.previous.missingFx],
            ['Нийтээс хассан гар Meta мөр', r.spendQuality.current.excludedManual], ['Акцтай холбоогүй Meta мөр', r.spendQuality.current.unmappedMeta],
            ['Тооцох дүрэм', r.basis], ['Сарын зорилт', r.fullMonth ? 'Бүтэн сарын сонголт' : 'Бүтэн сар сонгоогүй тул зорилтын биелэлтийг тооцоогүй'],
            ['Төсөлгүй Lead', r.quality.noProject], ['Акцгүй Lead', r.quality.noCampaign], ['Хариуцагчгүй Lead', r.quality.noOwner],
            ['Sales огноо тодорхойгүй', r.quality.unknownHandoff], ['Лидгүй гэрээ (байгууллагын хугацааны нийт)', r.quality.unlinkedContracts],
            ['Дууссан огноогүй ажил (бүх хугацааны)', r.quality.undatedCompletedActivities],
        ] },
    ];
    return buildWorkbookBuffer(sheets);
}
