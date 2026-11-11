/**
 * Лхагвын тайлангийн эх файлууд — ERP-ээс долоо хоног бүр оруулдаг гурван төрөл. Тайлан бэлдэх эхний алхам
 * («ERP мэдээлэл оруулах») аль файл хэзээ орсон, тайланд хэрэгтэй эсэхийг эндээс харуулна (цэвэр, client-safe).
 *
 *  - `hub`      гэрээний HUB жагсаалт (16 багана) → `/dashboard/contracts/import` (гэрээг шинэчилнэ);
 *  - `products` ERP бүтээгдэхүүний экспорт → `/dashboard/reports/erp` (snapshot);
 *  - `sales`    ERP гэрээний экспорт (`property.sale`) → `/dashboard/reports/erp` (snapshot) — зөвхөн ийм файл
 *               оруулж байсан төсөлд харуулна: нэг ч удаа ороогүй төсөлд санал болгохгүй (орвол тайлангийн
 *               гэрээний эх CRM-ээс ERP snapshot руу шилжинэ).
 *
 * Огноо нь файлын «мэдээллийн огноо» (snapshot-ын `report_date`), оруулсан цаг биш. Тайлант долоо хоног
 * Лхагва–Мягмар тул Мягмар (`range.to`) буюу түүнээс хойших файл л долоо хоногийг бүтэн хамарна.
 */
export type WeeklyFileKind = 'hub' | 'products' | 'sales';
/** fresh = долоо хоногийг бүтэн хамарсан; partial = долоо хоногийн дундах; stale = өмнөх долоо хоногийнх; missing = ороогүй. */
export type WeeklyFileState = 'fresh' | 'partial' | 'stale' | 'missing';

export interface WeeklyFileSource {
    date: string;
    /** HUB: файлын нэр; ERP snapshot: тайлангийн багцын нэр. */
    name: string | null;
    /** Оруулсан хүний нэр (HUB импорт л хадгалдаг). */
    by?: string | null;
}

export interface WeeklyFile {
    kind: WeeklyFileKind;
    state: WeeklyFileState;
    /** Тайлан одоо энэ файлаас уншиж байгаа (эсвэл юу ч ороогүй төсөлд эхлэх файл) — хуучирсан бол анхааруулна. */
    needed: boolean;
    date: string | null;
    name: string | null;
    by: string | null;
}

export const WEEKLY_FILE_LABEL: Record<WeeklyFileKind, { title: string; feeds: string; href: string }> = {
    hub: {
        title: 'Гэрээний жагсаалт (HUB Excel)',
        feeds: 'Долоо хоног, сарын гэрээ · менежерээр · блокийн үлдэгдэл · давхрын зураглал',
        href: '/dashboard/contracts/import',
    },
    products: {
        title: 'ERP бүтээгдэхүүний экспорт',
        feeds: 'Блокийн үлдэгдэл · давхрын зураглал · байрны үнэ',
        href: '/dashboard/reports/erp',
    },
    sales: {
        title: 'ERP гэрээний экспорт',
        feeds: 'Гэрээ · мөнгөн орлого (хоёр экспортын «Нийт төлсөн дүн»-гийн зөрүү) · төлбөрийн хоцролт',
        href: '/dashboard/reports/erp',
    },
};

export function weeklyFileState(date: string | null, range: { from: string; to: string }): WeeklyFileState {
    if (!date) return 'missing';
    if (date >= range.to) return 'fresh';
    return date >= range.from ? 'partial' : 'stale';
}

export function buildWeeklyFiles(input: {
    range: { from: string; to: string };
    hub: WeeklyFileSource | null;
    products: WeeklyFileSource | null;
    sales: WeeklyFileSource | null;
}): WeeklyFile[] {
    const { range, hub, products, sales } = input;
    const file = (kind: WeeklyFileKind, source: WeeklyFileSource | null, needed: boolean): WeeklyFile => ({
        kind, needed, state: weeklyFileState(source?.date ?? null, range),
        date: source?.date ?? null, name: source?.name ?? null, by: source?.by ?? null,
    });
    // Үлдэгдлийг HUB гэрээнээс тооцож байвал (`loadReportInventory`-ийн дүрэм) бүтээгдэхүүний экспорт заавал биш.
    const hubCoversInventory = !!hub && (!products || hub.date >= products.date);
    return [
        file('hub', hub, !!hub || (!products && !sales)),
        file('products', products, !!products && !hubCoversInventory),
        ...(sales ? [file('sales', sales, true)] : []),
    ];
}

/** Хэрэгтэй файл бүр долоо хоногийг бүтэн хамарсан эсэх; `pending` — шинээр оруулах файлууд. */
export function weeklyFilesStatus(files: WeeklyFile[]) {
    const needed = files.filter(file => file.needed);
    const pending = needed.filter(file => file.state !== 'fresh');
    return { ready: needed.length > 0 && pending.length === 0, pending };
}

const shortDate = (date: string) => date.slice(5);

/** Файлын төлөвийн нэг мөр тайлбар (дэлгэц, тест нэг үгсээр). */
export function weeklyFileNote(file: WeeklyFile, range: { from: string; to: string }): string {
    if (file.state === 'missing') return 'Хараахан оруулаагүй.';
    const date = shortDate(file.date as string);
    if (file.state === 'fresh') return `${date}-ний файл — тайлант долоо хоногийг бүтэн хамарсан.`;
    if (file.state === 'partial') return `${date}-ний файл — ${shortDate(range.to)} хүртэлх сүүлийн өдрүүд ороогүй байж болно.`;
    return `Сүүлийн файл ${date}-нийх — энэ долоо хоногийн (${shortDate(range.from)}–${shortDate(range.to)}) мэдээлэл ороогүй.`;
}
