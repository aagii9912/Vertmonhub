/**
 * ERP-ийн бүтээгдэхүүний экспортоос (Код, Захиалагч, Бүтээгдэхүүний төлөв …) гэрээний мөр гаргана.
 *
 * Гэрээ = «Гэрээ баталгаажсан» (sold) эсвэл «Хүлээлгэсэн» (handed_over) төлөвтэй нэгж — Хурлын бэлтгэлийн
 * «Гэрээтэй» тоололтой ижил. Нэгжийн код, блок, давхар, ангиллыг байрны импортын дүрмээр (`mapInventoryRows`)
 * гаргана: гэрээний `unit_label` = `property_units.code`.
 *
 * Экспортод гэрээний дугаар, огноо, төлсөн дүн байхгүй: тэдгээрийг NULL үлдээнэ (0 гэж таахгүй).
 * «Үлдэгдэл төлбөр» нь урьдчилгааны дараах хуваарь (нийт − урьдчилгаа), харилцагчийн өр биш тул хадгалахгүй.
 */
import type { ImportRow } from '@/lib/admin/import/mappers';
import { mapInventoryRows, type InventoryImportContext } from '@/lib/admin/import/units';
import { erpNumber } from './records';

export interface ErpProductContract {
    shop_id: string;
    project_id: string;
    product_type: string;
    block_name: string;
    floor: string | null;
    unit_label: string;
    unit_number: string | null;
    legacy_unit_number: string | null;
    model: string | null;
    rooms: number | null;
    unit_type: string | null;
    contracted_area: number | null;
    price_per_sqm: number | null;
    total_price: number | null;
    prepayment_condition: string | null;
    prepayment_due: number | null;
    sales_channel: string | null;
    sales_manager: string | null;
    customer_name: string;
    customer_registration: string | null;
    contract_status: 'active' | 'closed';
    paid_amount: null;
    balance: null;
    notes: string;
}

export interface ErpProductContractContext extends InventoryImportContext {
    /** Snapshot-ийн тайлангийн огноо (YYYY-MM-DD) — тэмдэглэлд эх сурвалжийг ил бичнэ. */
    reportDate: string;
}

const CONTRACT_STATUSES = new Set(['sold', 'handed_over']);
/** «Бямбадорж.Эрдэнэбат ЗЮ96030910» → нэр + регистр. */
const REGISTRATION = /^(.*?)[\s.]*([А-ЯӨҮЁ]{2}\d{8})$/u;

function cell(row: ImportRow, column: string): string | null {
    const raw = row[column];
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    return text || null;
}

/** ERP-ийн тооцоолсон дүнгийн хөвөгч таслалын үлдэгдлийг (459194120.0000001) 2 орон руу буцаана. */
function money(row: ImportRow, column: string): number | null {
    const value = erpNumber(cell(row, column));
    return value === null || value <= 0 ? null : Math.round(value * 100) / 100;
}

export function contractsFromErpProducts(sourceRows: ImportRow[], context: ErpProductContractContext) {
    const units = mapInventoryRows(sourceRows, context);
    const contracts: ErpProductContract[] = [];
    // Байрны импорт алдаатай бол нэгжийн код тодорхойгүй — гэрээг ч гаргахгүй.
    if (units.errors.length) return { contracts, errors: units.errors };

    const errors: string[] = [];
    const notes = `ERP бүтээгдэхүүний экспорт «${context.sourceFile}» (${context.reportDate}). Гэрээний дугаар, огноо, төлсөн дүн энэ экспортод байхгүй.`;
    // Алдаагүй үед `units.rows[i]` нь `sourceRows[i]`-тэй харгалзана.
    units.rows.forEach((unit, index) => {
        if (!CONTRACT_STATUSES.has(unit.status)) return;
        const source = sourceRows[index];
        const customer = cell(source, 'Захиалагч');
        const match = customer?.match(REGISTRATION);
        const customerName = (match ? match[1] : customer)?.trim() || null;
        if (!customerName) {
            errors.push(`Мөр ${index + 2}: ${unit.code} «${unit.raw_status}» төлөвтэй боловч захиалагчийн нэр хоосон`);
            return;
        }
        const total = money(source, 'Нийт борлуулах үнэ');
        const pricePerSqm = money(source, 'Борлуулалтын үнэ 1мкв');
        const area = unit.contracted_area || null;
        contracts.push({
            shop_id: unit.shop_id,
            project_id: unit.project_id,
            product_type: unit.category,
            block_name: unit.block,
            floor: unit.floor,
            unit_label: unit.code,
            unit_number: unit.unit_number && unit.unit_number !== '0' ? unit.unit_number : null,
            legacy_unit_number: unit.legacy_unit_number,
            model: unit.model,
            rooms: unit.rooms,
            unit_type: unit.unit_type,
            contracted_area: area,
            // Зогсоолд ERP нэгжийн үнийг «1мкв»-ийн баганад бичдэг: талбай × үнэ нийт дүнтэй таарахгүй бол хадгалахгүй.
            price_per_sqm: area && pricePerSqm && total && Math.abs(area * pricePerSqm - total) <= total * 0.01 ? pricePerSqm : null,
            total_price: total,
            prepayment_condition: cell(source, 'Урьдчилгааны нөхцөл'),
            prepayment_due: money(source, 'Төлөх урьдчилгаа төлбөр'),
            sales_channel: unit.sales_channel,
            sales_manager: unit.sales_manager,
            customer_name: customerName,
            customer_registration: match?.[2] ?? null,
            contract_status: cell(source, 'Захиалгын төлөв') === 'closed' ? 'closed' : 'active',
            paid_amount: null,
            balance: null,
            notes,
        });
    });
    return { contracts: errors.length ? [] : contracts, errors };
}
