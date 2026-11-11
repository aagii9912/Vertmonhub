/**
 * Лхагвын тайлангийн «Гараар нөхөх» алхам — ERP-ийн файлд байдаггүй, хүн гараар оруулдаг зүйлс (цэвэр, client-safe):
 *
 *  - гэрээний менежер: HUB жагсаалт менежергүй ирдэг → гэрээн дээр сонгоно (PATCH `sales_manager`, хязгааргүй
 *    бичих эрхтэй хэрэглэгч, аудиттай);
 *  - гэрээний огноо: огноогүй амьд гэрээ долоо хоног, сарын тоонд ордоггүй → гэрээний «Огноо оруулах»
 *    (PATCH `order_date`, нэг удаа);
 *  - сарын төлөвлөгөө ба гараар оруулсан гүйцэтгэл (`team_sales_targets`, Удирдлага → «Борлуулалтын төлөвлөгөө»).
 * Гурвууланг нь алхам дотроос шууд оруулна (эзэмшигчийн хүсэлт 2026-11-11: өөр хуудас руу явахгүй).
 *
 * Зөвхөн «оруулсан эсэх»-ийг дамжуулна — дүн энд байхгүй. Мөнгөн урсгалын мөр санхүүгийн эрхгүй хүнд null.
 * ERP-ийн гэрээний экспортоор ажилладаг төсөлд менежер, огноо экспортоос ирдэг тул гэрээний хоёр мөр хамаарахгүй.
 */
export const WEEKLY_MANUAL_LIST_LIMIT = 50;

export interface WeeklyManualContract {
    id: string;
    number: string | null;
    date: string | null;
    block: string | null;
    unit: string | null;
    kindLabel: string;
    /** Зөвхөн гэрээ харах эрхтэй хүнд. */
    customer: string | null;
    total: number | null;
    /** Тайлант долоо хоногийн гэрээ. */
    inWeek: boolean;
}

/** Огноогүй гэрээ: `dateEntry` — «Захиалга өгсөн огноо» хоосон тул огноог эндээс нэг удаа оруулж болно. */
export interface WeeklyManualUndatedContract extends WeeklyManualContract { manager: string | null; dateEntry: boolean }

/** `true` = оруулсан (0 ч гэсэн утга), `false` = хоосон; `cashflow: null` = харах эрхгүй. */
export interface WeeklyManualEntered { contractAmount: boolean; contractCount: boolean; cashflow: boolean | null }

export interface WeeklyManual {
    /** Тайлант долоо хоногийн сүүлийн өдрийн сар (YYYY-MM) — төлөвлөгөө энэ сарынх. */
    month: string;
    /** Менежергүй амьд гэрээ: нийт тоо ба эхний `WEEKLY_MANUAL_LIST_LIMIT` (шинэ нь эхэндээ). */
    managerless: { count: number; contracts: WeeklyManualContract[] };
    /** Огноогүй амьд гэрээний тоо. */
    undated: number;
    /** Огноогүй амьд гэрээний эхний `WEEKLY_MANUAL_LIST_LIMIT` (хуучин хариунд байхгүй байж болно). */
    undatedContracts?: WeeklyManualUndatedContract[];
    plan: WeeklyManualEntered;
    manualActuals: WeeklyManualEntered;
}

export type WeeklyManualItem = 'manager' | 'date' | 'plan';

/**
 * Одоо гараар нөхөх зүйлс. `contractsFromErp` — гэрээг ERP-ийн гэрээний экспортоос уншдаг төсөл: менежер, огноо
 * тэндээс ирдэг тул CRM-ийн гэрээг засахыг шаардахгүй. Гараар оруулсан гүйцэтгэл заавал биш (үгүй бол системийн
 * бүртгэлээр тооцно), харин гэрээний дүнгийн төлөвлөгөөгүй бол биелэлтийн хувь гарахгүй.
 */
export function weeklyManualStatus(manual: WeeklyManual, options: { contractsFromErp: boolean }) {
    const pending: WeeklyManualItem[] = [
        ...(!options.contractsFromErp && manual.managerless.count > 0 ? ['manager' as const] : []),
        ...(!options.contractsFromErp && manual.undated > 0 ? ['date' as const] : []),
        ...(!manual.plan.contractAmount ? ['plan' as const] : []),
    ];
    return { ready: pending.length === 0, pending };
}

const METRICS = [['contractCount', 'гэрээний тоо'], ['contractAmount', 'гэрээний дүн'], ['cashflow', 'мөнгөн урсгал']] as const;

/** «гэрээний тоо, гэрээний дүн» — оруулсан (`entered: true`) эсвэл хоосон үзүүлэлтүүдийн нэрс (харах эрхгүйг алгасна). */
export function weeklyManualMetricNames(row: WeeklyManualEntered, entered: boolean): string[] {
    return METRICS.filter(([key]) => row[key] === entered).map(([, label]) => label);
}
