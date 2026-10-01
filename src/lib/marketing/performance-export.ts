import { buildWorkbookBuffer, type WorkbookSheetSpec } from '@/lib/utils/xlsx';
import { MARKETING_CHANNELS, marketingChannel, performanceChange, type MarketingPerformance } from './performance';
import { buildDepartmentKpis } from './department-kpi';

/** Snapshot export: every sheet uses the exact same report as the UI and AI. */
export function exportMarketingPerformance(r: MarketingPerformance) {
    const department = buildDepartmentKpis(r);
    const spendChange = r.totals.hasSpend && r.previous.hasSpend && r.totals.spendComplete && r.previous.spendComplete ? performanceChange(r.totals.spend, r.previous.spend) : null;
    const recordedSpend = (row: Pick<MarketingPerformance['totals'], 'spend' | 'hasSpend' | 'spendComplete'>) => row.hasSpend || !row.spendComplete ? row.spend : null;
    const costHeaders = ['Нэг лидийн зардал (₮)', 'Нэг шилжүүлэлтийн зардал (₮)', 'Нэг гэрээтэй лидийн зардал (₮)', 'Зардлын төлөв'];
    const spendStatus = (row: Pick<MarketingPerformance['totals'], 'spendComplete' | 'hasSpend'>) => !row.spendComplete
        ? 'Ханш дутуу · зардал бүрэн биш' : row.hasSpend ? 'Бүртгэсэн зардал' : 'Зардлын бүртгэлгүй';
    const costs = (row: Pick<MarketingPerformance['totals'], 'costPerLead' | 'costPerSale' | 'costPerDeal' | 'spendComplete' | 'hasSpend'>) =>
        [row.costPerLead, row.costPerSale, row.costPerDeal, spendStatus(row)];
    const sheets: WorkbookSheetSpec[] = [
        { name: 'Хураангуй', colWidths: [36, 24, 24, 24], aoa: [
            ['Хугацаа', r.range.from, r.range.to], ['Өмнөх хугацаа', r.previousRange.from, r.previousRange.to],
            ['Үзүүлэлт', 'Бодит', 'Өмнөх', 'Өөрчлөлт %'],
            ...(['activities', 'campaigns', 'content', 'leads', 'sales', 'deals'] as const).map((key, i) => [['Дууссан ажил (нийт)', 'Дууссан кампанит ажил', 'Дууссан контент', 'Lead', 'Sales', 'Deal'][i], r.totals[key], r.previous[key], performanceChange(r.totals[key], r.previous[key])]),
            ['Зарцуулалт (₮)', recordedSpend(r.totals), recordedSpend(r.previous), spendChange],
            ['Lead → Sales %', r.totals.salesPct, r.previous.salesPct], ['Lead → Deal %', r.totals.dealPct, r.previous.dealPct],
            ...(['costPerLead', 'costPerSale', 'costPerDeal'] as const).map((key, i) => [costHeaders[i], r.totals[key], r.previous[key],
                r.totals[key] !== null && r.previous[key] !== null ? performanceChange(r.totals[key], r.previous[key]) : null]),
            ['Зардлын төлөв', spendStatus(r.totals), spendStatus(r.previous)],
            ['Тайлбар', 'Хоосон нүд = тооцох суурь эсвэл зорилт байхгүй, зардлын бүртгэлгүй эсвэл ханш дутуу. Хувийн баганууд 0–100 хэмжээсээр.'],
        ] },
        { name: 'Төсөл бүрийн гүйцэтгэл', colWidths: [28, ...Array(13 + Object.keys(MARKETING_CHANNELS).length).fill(20)], aoa: [
            ['Төсөл', 'Дууссан ажил (нийт)', 'Дууссан кампанит ажил', 'Дууссан контент', 'Lead', 'Sales', 'Deal', 'Lead → Sales %', 'Lead → Deal %', ...Object.values(MARKETING_CHANNELS), 'Зарцуулалт (₮)', ...costHeaders],
            ...r.projects.map(p => [p.name, p.activities, p.campaigns, p.content, p.leads, p.sales, p.deals, p.salesPct, p.dealPct, ...p.channels.map(c => c.count), recordedSpend(p), ...costs(p)]),
        ] },
        { name: 'Сувгаар харьцаа', colWidths: [30, ...Array(10).fill(23)], aoa: [
            ['Суваг', 'Lead', 'Sales', 'Deal', 'Deal %', 'Lead → Sales %', 'Зарцуулалт (₮)', ...costHeaders],
            ...r.channels.map(c => [c.name, c.leads, c.sales, c.deals, c.dealPct, c.salesPct, recordedSpend(c), ...costs(c)]),
        ] },
        { name: 'Сүүлийн акцууд', colWidths: [16, 28, 36, 24, 28, ...Array(8).fill(23)], aoa: [
            ['Огноо', 'Төсөл', 'Ажил', 'Ажлын төрөл', 'Суваг', 'Lead', 'Sales', 'Deal', 'Зарцуулалт (₮)', ...costHeaders],
            ...r.recent.map(a => [a.completed_on, a.projectName, a.name, { campaign: 'Кампанит ажил', content: 'Контент' }[a.activity_kind] || 'Төрөл тодорхойгүй', MARKETING_CHANNELS[marketingChannel(a.channel)], a.leads, a.sales, a.deals, recordedSpend(a), ...costs(a)]),
        ] },
        { name: 'Багийн гүйцэтгэл', colWidths: [26, 28, ...Array(24).fill(23)], aoa: [
            ['Менежер', 'Төсөл', 'Дууссан ажил (нийт)', 'Дууссан кампанит ажил', 'Дууссан контент', 'Төлөвлөгөө %', 'Lead зорилт', 'Бодит Lead', 'Lead биелэлт %', 'Deal зорилт', 'Бодит Deal', 'Deal биелэлт %', 'Төсөв (₮)', 'Зарцуулсан (₮)', 'Зөрүү (₮)', 'Зөрүү %', 'Өмнөх Lead', 'Lead өөрчлөлт %', 'Өмнөх Deal', 'Deal өөрчлөлт %', 'Өмнөх зардал (₮)', 'Зардлын өөрчлөлт %', ...costHeaders],
            ...r.team.map(t => [t.name, t.projectName, t.activities, t.campaigns, t.content, t.planPct, t.target?.lead_target, t.leads, t.leadAttainment, t.target?.deal_target, t.deals, t.dealAttainment, t.budget, recordedSpend(t), t.variance, t.variancePct, t.previousLeads, t.leadChange, t.previousDeals, t.dealChange, t.previousSpend, t.spendChange, ...costs(t)]),
            ['Нийт', '', r.totals.activities, r.totals.campaigns, r.totals.content, r.teamTotal.planPct, r.teamTotal.leadTarget, r.teamTotal.leads, r.teamTotal.leadAttainment, r.teamTotal.dealTarget, r.teamTotal.deals, r.teamTotal.dealAttainment, r.teamTotal.budget, recordedSpend(r.totals), r.teamTotal.variance, r.teamTotal.variancePct, r.teamTotal.previousLeads, r.teamTotal.leadChange, r.previous.deals, performanceChange(r.totals.deals, r.previous.deals), recordedSpend(r.previous), spendChange, ...costs(r.totals)],
        ] },
        { name: 'Албаны KPI', colWidths: [30, 14, 38, 22, 16, 85, 85], aoa: [
            ['Шалгуур', 'Жин %', 'Үзүүлэлт', 'Бодит', 'Нэгж', 'Хамрах хүрээ', 'Тохируулах шалгуур'],
            ...department.categories.flatMap(category => category.evidence.map((evidence, index) => [
                category.title, category.weight, evidence.label, evidence.value,
                { number: 'Тоо / үнэлгээ', percent: '%', mnt: '₮' }[evidence.unit], evidence.note,
                index === 0 ? category.gaps.join('\n') : null,
            ])),
            ['Эх сурвалж', null, department.source.name, null, null, department.source.version, department.source.file],
            ['Үнэлгээний тайлбар', null, null, null, null, department.basis],
        ] },
        { name: 'Тооцооны тайлбар', colWidths: [48, 100], aoa: [
            ['Ханшгүй Meta мөр', r.spendQuality.current.missingFx], ['Өмнөх хугацаанд ханшгүй Meta', r.spendQuality.previous.missingFx],
            ['Нийтээс хассан гар Meta мөр', r.spendQuality.current.excludedManual], ['Акцтай холбоогүй Meta мөр', r.spendQuality.current.unmappedMeta],
            ['Тооцох дүрэм', r.basis], ['Сарын зорилт', r.fullMonth ? 'Бүтэн сарын сонголт' : 'Бүтэн сар сонгоогүй тул зорилтын биелэлтийг тооцоогүй'],
            ['Зардлын төлөв', spendStatus(r.totals)], ['Өмнөх зардлын төлөв', spendStatus(r.previous)],
            ['Нийт зорилтын бүрэн байдал', r.teamTotal.targetsComplete ? 'Одоогийн бүх мөрийн зорилт бүрэн' : 'Одоогийн мөрийн зорилт дутуу эсвэл бүтэн сар сонгоогүй'],
            ['Нийт зорилтын хамрах хүрээ', 'Одоогийн лид, төлөвлөсөн / дууссан ажил, зардал эсвэл сарын зорилттой мөрүүдийг хамруулна. Зөвхөн өмнөх хугацаанд үр дүнтэй мөр харьцуулалтад үлдэх боловч одоогийн нийт зорилтын бүрэн байдлыг бууруулахгүй.'],
            ['Төсөлгүй Lead', r.quality.noProject], ['Акцгүй Lead', r.quality.noCampaign], ['Хариуцагчгүй Lead', r.quality.noOwner],
            ['Sales огноо тодорхойгүй', r.quality.unknownHandoff], ['Лидгүй гэрээ (байгууллагын хугацааны нийт)', r.quality.unlinkedContracts],
            ['Дууссан огноогүй ажил (бүх хугацааны)', r.quality.undatedCompletedActivities],
        ] },
    ];
    return buildWorkbookBuffer(sheets);
}
