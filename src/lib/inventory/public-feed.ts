import type { ErpProduct, ProductKind } from '@/lib/erp/records';
import type { InventoryStatus } from '@/lib/inventory/labels';
import type { ReportInventory, ReportInventorySourceKind } from '@/lib/inventory/report-inventory';

/**
 * Гадаад 3D үзүүлэн (Orshin 3D) руу өгөх байрны төлөв — `/api/integrations/orshin/inventory`.
 *
 * Тайлангийн нөөцийн дүрмээр (`loadReportInventory`) гарсан мөрөөс ЗӨВХӨН байрыг таних талбар ба төлөв:
 * үнэ, талбай, менежер, худалдан авагч, бартер, дотоод төлөвийн тайлбар («амьд гэрээгүй») хэзээ ч гарахгүй.
 * Шинэ талбар нэмэхдээ энэ жагсаалтыг ил өргөтгөнө — мөрийг бүхлээр нь дамжуулахгүй.
 */
export interface PublicInventoryUnit {
    /** ERP-ийн код («Б1-53»). Зогсоол/агуулахын код ангилал дамжин давтагддаг тул `kind`-тай хамт түлхүүр. */
    code: string;
    kind: ProductKind;
    /** «Б1», «Б2». */
    block: string | null;
    floor: number | null;
    /** Загвар («E3», «C»). */
    model: string | null;
    /** null = төлөв тодорхойгүй (хүлээн авагч «худалдаанд гараагүй» гэж үзнэ). */
    status: InventoryStatus | null;
}

export interface PublicInventoryFeed {
    project: string;
    /** Эх өгөгдлийн огноо (УБ, YYYY-MM-DD): HUB гэрээний жагсаалт, ERP экспорт эсвэл бүртгэлийн сүүлийн өөрчлөлт. */
    asOf: string;
    source: ReportInventorySourceKind;
    units: PublicInventoryUnit[];
}

const publicUnit = (row: ErpProduct): PublicInventoryUnit => ({
    code: row.code, kind: row.kind, block: row.block, floor: row.floor, model: row.model, status: row.status,
});

export function publicInventoryFeed(project: string, inventory: ReportInventory): PublicInventoryFeed {
    return { project, asOf: inventory.info.date, source: inventory.info.kind, units: inventory.rows.map(publicUnit) };
}
