import type { MarketingPerformance } from './performance';
import { formatMNT } from '@/lib/utils/currency';

export const DEPARTMENT_KPI_SOURCE = {
    name: 'Маркетингийн албаны бүтэц ба KPI', version: '2026-07-20', file: 'marketing org structure 20260720.pptx',
} as const;
export const DEPARTMENT_KPI_BASIS = 'Албаны KPI нь 6 шалгууртай. Жин нь үнэлгээний бодлогод өгсөн хувь; гүйцэтгэлийн оноо биш. Бодит бүртгэлээс гарсан үзүүлэлтийг доор харуулна. Зорилт, үнэлгээний томьёо болон дутуу шалгуурыг тохируулсны дараа нэгдсэн оноо бодно. Business Result-ийн дэд жин эх материалд жишээ тул энд оноо тооцоогүй.';
export const DEPARTMENT_KPI_CATEGORIES = [
    { id: 'business', title: 'Бизнесийн үр дүн', weight: 40 },
    { id: 'campaign', title: 'Кампанит ажлын үр дүн', weight: 25 },
    { id: 'content', title: 'Контентын чанар', weight: 15 },
    { id: 'project', title: 'Төслийн удирдлага', weight: 10 },
    { id: 'budget', title: 'Төсвийн хяналт', weight: 5 },
    { id: 'teamwork', title: 'Багийн ажиллагаа ба шинэ санаа', weight: 5 },
] as const;

export interface DepartmentKpiEvidence {
    key: string; label: string; value: number | null; unit: 'number' | 'percent' | 'mnt'; note: string;
}

export const formatDepartmentKpiEvidence = (evidence: DepartmentKpiEvidence) => evidence.value === null ? '—'
    : evidence.unit === 'mnt' ? formatMNT(evidence.value)
        : evidence.unit === 'percent' ? `${evidence.value}%` : evidence.value.toLocaleString('en-US');

/** One evidence snapshot for the department view, weekly meeting, Excel and AI. */
export function buildDepartmentKpis(report: MarketingPerformance) {
    const metric = (key: string, label: string, value: number | null, unit: DepartmentKpiEvidence['unit'], note: string): DepartmentKpiEvidence =>
        ({ key, label, value, unit, note });
    const completedCampaigns = report.recent.filter(a => a.activity_kind === 'campaign');
    const budgetKnown = report.fullMonth && report.teamTotal.targetsComplete;
    const budgetReady = budgetKnown && report.totals.hasSpend && report.totals.spendComplete;
    const budgetGaps = [
        ...(!report.fullMonth ? ['Сарын төсөвтэй харьцуулахын тулд бүтэн календарь сар сонгоно.'] : []),
        ...(report.fullMonth && !report.teamTotal.targetsComplete ? ['Одоогийн менежер–төслийн мөрүүдийн сарын зорилт, төсөв дутуу.'] : []),
        ...(!report.totals.hasSpend ? ['Зардлын бүртгэлгүй тул хэмнэлт, хэтрэлт тодорхойгүй.'] : []),
        ...(!report.totals.spendComplete ? ['Ханшгүй зардал байгаа тул төсвийн харьцуулалт бүрэн биш.'] : []),
        'Төсвийн гүйцэтгэлийг оноонд хөрвүүлэх дүрэм тохируулагдаагүй.',
    ];
    const evidence: Record<typeof DEPARTMENT_KPI_CATEGORIES[number]['id'], { evidence: DepartmentKpiEvidence[]; gaps: string[] }> = {
        business: {
            evidence: [
                metric('leads', 'Шинэ CRM лид', report.totals.leads, 'number', 'Сонгосон хугацаанд үүссэн лид. Marketing Lead-ийн хамрах эх үүсвэрийг тусад нь тогтооно.'),
                metric('handoffs', 'Менежерт шилжсэн лид', report.totals.sales, 'number', 'Анх шилжүүлсэн огноо бүртгэлтэй лид. Qualified Lead-ийн шалгуур хангасан эсэхийг батлахгүй.'),
                metric('deals', 'Гэрээтэй лид', report.totals.deals, 'number', 'Хугацаанд үүссэн лидээс эцэс хүртэл хүчинтэй гэрээтэй болсон давхардалгүй лид.'),
                metric('costPerLead', 'Нэг лидийн зардал', report.totals.costPerLead, 'mnt', 'Хугацааны бүртгэсэн зардал / шинэ CRM лид. Зардлын бүртгэлгүй, ханш дутуу эсвэл лидгүй үед тодорхойгүй.'),
            ],
            gaps: ['Qualified Lead-ийн шалгуур ба баталгаажуулах бүртгэл тодорхойгүй.',
                'Site Visit-ийн тодорхойлолт, CRM уулзалттай холбох дүрэм тохируулагдаагүй.',
                'Marketing Source Sales-ийн хамрах хугацаа, Marketing ROI-ийн орлого ба зардлын дүрэм тохируулагдаагүй.'],
        },
        campaign: {
            evidence: [
                metric('campaigns', 'Дууссан кампанит ажил', report.totals.campaigns, 'number', 'Дууссан огноо хугацаанд багтсан, кампанит ажил төрөлтэй бүртгэл.'),
                metric('leads', 'Дууссан кампанит ажилтай холбоотой лид', completedCampaigns.reduce((sum, a) => sum + a.leads, 0), 'number', 'Энэ хугацаанд дууссан кампанит ажилтай холбоотой, хугацаанд үүссэн лид.'),
                metric('deals', 'Дууссан кампанит ажилтай холбоотой гэрээтэй лид', completedCampaigns.reduce((sum, a) => sum + a.deals, 0), 'number', 'Дээрх лидийн бүлгээс хугацааны эцэс хүртэл хүчинтэй гэрээтэй болсон лид.'),
            ],
            gaps: ['Кампанит ажил бүрийн зорилт, амжилтын шалгуур, үнэлгээний дүрэм тохируулагдаагүй.'],
        },
        content: {
            evidence: [
                metric('content', 'Дууссан контент', report.totals.content, 'number', 'Дууссан огноо хугацаанд багтсан, контент төрөлтэй бүртгэл.'),
                metric('quality', 'Контентын чанарын үнэлгээ', null, 'number', 'Чанарын шалгуур, батлах хүн, үнэлгээний хэмжээ шаардлагатай.'),
            ],
            gaps: ['Контентын чанарын үнэлгээ бүртгээгүй.', 'Сошиал Views / Reach-ийн дүн энэ KPI тайланд холбогдоогүй.'],
        },
        project: {
            evidence: [
                metric('planPct', 'Төлөвлөсөн ажлын гүйцэтгэл', report.teamTotal.planPct, 'percent', 'Хугацаанд эхлэх, цуцлагдаагүй ажлаас тайлангийн эцэст дууссан хувь.'),
                metric('activities', 'Дууссан ажил', report.totals.activities, 'number', 'Кампанит ажил болон контентын нийт.'),
                metric('onTimePct', 'Хугацаандаа дууссан хувь', null, 'percent', 'Төлөвлөсөн дуусах огноо ба хугацаандаа дууссан эсэхийг үнэлэх дүрэм шаардлагатай.'),
            ],
            gaps: ['Төлөвлөгөөний гүйцэтгэл нь хугацаандаа дууссаны баталгаа биш.', 'Төслийн удирдлагын үнэлгээний дүрэм тохируулагдаагүй.'],
        },
        budget: {
            evidence: [
                metric('budget', 'Сарын төсөв', budgetKnown ? report.teamTotal.budget : null, 'mnt', 'Менежер–төслийн бүрэн тохируулсан сарын төсвийн нийлбэр. Зардлын бүртгэл дутуу үед ч бүртгэлтэй төсөв харагдана.'),
                metric('spend', 'Бүртгэсэн зардал', report.totals.hasSpend && report.totals.spendComplete ? report.totals.spend : null, 'mnt', 'Гар болон Meta өдрийн зардлын давхардалгүй, ханштай нийлбэр.'),
                metric('variance', 'Төсвийн зөрүү', budgetReady ? report.teamTotal.variance : null, 'mnt', 'Зардал − сарын төсөв. Эерэг нь хэтрэлт, сөрөг нь хэмнэлт.'),
            ],
            gaps: budgetGaps,
        },
        teamwork: {
            evidence: [metric('assessment', 'Багийн үнэлгээ', null, 'number', 'Хамтын ажиллагаа, шинэ санааны нотолгоо болон үнэлгээний дүрэм шаардлагатай.')],
            gaps: ['Багийн ажиллагаа, шинэ санааны үнэлгээ бүртгээгүй.', 'Хурлын тайланд хамтарсан ажил, шийдэл, дараагийн алхмаа бичиж нотолгоо болгон ашиглана.'],
        },
    };
    return { source: DEPARTMENT_KPI_SOURCE, basis: DEPARTMENT_KPI_BASIS,
        categories: DEPARTMENT_KPI_CATEGORIES.map(category => ({ ...category, ...evidence[category.id] })),
    };
}

export function formatDepartmentKpisText(report: MarketingPerformance) {
    const department = buildDepartmentKpis(report);
    return [
        'МАРКЕТИНГИЙН АЛБАНЫ KPI',
        `Эх сурвалж: ${department.source.name} · ${department.source.version} · ${department.source.file}`,
        ...department.categories.flatMap(category => [
            `${category.title} · жин ${category.weight}%`,
            ...category.evidence.map(evidence => `  ${evidence.label}: ${formatDepartmentKpiEvidence(evidence)}. ${evidence.note}`),
            `  Тохируулах: ${category.gaps.join(' ')}`,
        ]),
        department.basis,
    ].join('\n');
}
