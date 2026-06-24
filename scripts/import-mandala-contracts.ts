/**
 * Import Mandala Garden contracts ("Бүх гэрээ.xlsx") → property_contracts.
 *
 * ⚠ Энэ файлын багана нь POST /api/dashboard/contracts (Аагийд загвар) -аас ӨӨР:
 *   - Гэрээний дугаар БАЙХГҮЙ (тиймээс upsert key алга → snapshot replace)
 *   - Нэр/регистр НЭГ талбарт ("Анужин.Баттулга ЖЯ94...") → задлан авна
 *   - Утас БАЙХГҮЙ
 *   - Бүтээгдэхүүний төрөл нь "Бүтээгдэхүүн" мөрөнд шигдсэн → парслана
 *
 * Багана: Захиалга өгсөн огноо | Борлуулалтын менежер | Бүтээгдэхүүн |
 *   Блокын дугаар | Борлуулалтын суваг | Үндсэн захиалагч | Урьдчилгааны нөхцөл |
 *   Урьдчилгааны дүн | Төлөв | Банкны төлөв | ТХЗ-н төлөв | М.кв үнэ |
 *   Гэрээлсэн талбай | Нийт дүн | Нийт төлсөн дүн | Нийт үлдэгдэл |
 *   Төлбөр хоцролт | Нийт хоцорсон хоног | Шинэ тоот | Шинэчилсэн борлуулах талбай
 *
 * Usage:
 *   npx tsx scripts/import-mandala-contracts.ts "/tmp/mandala_analysis/Buh_geree.xlsx"            # DRY RUN
 *   npx tsx scripts/import-mandala-contracts.ts "<file>" --commit --wipe                          # replace shop's contracts
 *   npx tsx scripts/import-mandala-contracts.ts "<file>" --commit --append                        # insert without wiping
 *   SHOP_ID=<uuid> npx tsx scripts/import-mandala-contracts.ts "<file>" --commit --wipe
 */

import * as XLSX from 'xlsx';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const WIPE = args.includes('--wipe');
const APPEND = args.includes('--append');
const SHOP_ID = process.env.SHOP_ID;
const BATCH = 200;

if (!FILE) {
    console.error('Usage: npx tsx scripts/import-mandala-contracts.ts <Buh_geree.xlsx> [--commit --wipe|--append]');
    process.exit(1);
}

type Row = Record<string, unknown>;

function cell(row: Row, ...keys: string[]): string {
    for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}
function num(row: Row, ...keys: string[]): number | null {
    const raw = cell(row, ...keys);
    if (!raw) return null;
    const n = parseFloat(raw.replace(/[,₮%\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}
function intNum(row: Row, ...keys: string[]): number | null {
    const n = num(row, ...keys);
    return n === null ? null : Math.trunc(n);
}
function excelDateToISO(row: Row, ...keys: string[]): string | null {
    for (const k of keys) {
        const v = row[k];
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'number' && v > 0) {
            const ms = (v - 25569) * 86400 * 1000;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        if (typeof v === 'string' && v.trim()) {
            const d = new Date(v);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
    }
    return null;
}

function inferProductType(label: string): string {
    const s = label.toLowerCase();
    if (s.includes('зогсоол') || s.includes('зогс')) return 'parking';
    if (s.includes('агуулах') || s.includes('агуул')) return 'industry';
    if (s.includes('үйлчилгээ') || s.includes('үйлчил')) return 'commercial';
    return 'residential';
}

function parseStatus(raw: string): string {
    const v = raw.toLowerCase();
    if (v.includes('цуцл')) return 'cancelled';
    if (v.includes('шилж')) return 'transferred';      // Тоот шилжсэн
    if (v.includes('хаас') || v.includes('хаагдсан')) return 'closed'; // Гэрээ хаасан
    return 'active';                                     // Гэрээ үүссэн, НӨАТ олгосон
}

// "Анужин.Баттулга ЖЯ94012345" → { name, registration, first, last }
const REG_RE = /([А-ЯӨҮЁ]{2}\s?\d{8})/u;
function parseCustomer(raw: string): {
    name: string | null; reg: string | null; first: string | null; last: string | null;
} {
    if (!raw) return { name: null, reg: null, first: null, last: null };
    let reg: string | null = null;
    const m = raw.match(REG_RE);
    if (m) reg = m[1].replace(/\s/g, '');
    const name = raw.replace(REG_RE, '').trim() || null;
    let first: string | null = null, last: string | null = null;
    if (name && name.includes('.')) {
        const [a, b] = name.split('.', 2).map((s) => s.trim());
        last = a || null;   // Эцгийн нэр
        first = b || null;  // Өөрийн нэр
    }
    return { name, reg, first, last };
}

interface ContractInsert {
    shop_id: string;
    product_type: string;
    block_name: string | null;
    unit_number: string | null;
    unit_label: string | null;
    contracted_area: number | null;
    price_per_sqm: number | null;
    total_price: number | null;
    paid_amount: number | null;
    balance: number | null;
    overdue_days: number | null;
    order_date: string | null;
    prepayment_condition: string | null;
    prepayment_due: number | null;
    contract_status: string;
    sales_channel: string | null;
    sales_manager: string | null;
    bank_status: string | null;
    customer_name: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    customer_registration: string | null;
}

function mapRow(row: Row, shopId: string): ContractInsert | null {
    const label = cell(row, 'Бүтээгдэхүүн');
    const block = cell(row, 'Блокын дугаар');
    if (!label && !block) return null;
    const cust = parseCustomer(cell(row, 'Үндсэн захиалагч'));

    return {
        shop_id: shopId,
        product_type: inferProductType(label || block),
        block_name: block || null,
        unit_number: cell(row, 'Шинэ тоот') || null,
        unit_label: label || null,
        contracted_area: num(row, 'Гэрээлсэн талбай'),
        price_per_sqm: num(row, 'М.кв үнэ'),
        total_price: num(row, 'Нийт дүн'),
        paid_amount: num(row, 'Нийт төлсөн дүн'),
        balance: num(row, 'Нийт үлдэгдэл'),
        overdue_days: intNum(row, 'Нийт хоцорсон хоног'),
        order_date: excelDateToISO(row, 'Захиалга өгсөн огноо'),
        prepayment_condition: cell(row, 'Урьдчилгааны нөхцөл') || null,
        prepayment_due: num(row, 'Урьдчилгааны дүн'),
        contract_status: parseStatus(cell(row, 'Төлөв')),
        sales_channel: cell(row, 'Борлуулалтын суваг') || null,
        sales_manager: cell(row, 'Борлуулалтын менежер') || null,
        bank_status: cell(row, 'Банкны төлөв') || null,
        customer_name: cust.name,
        customer_first_name: cust.first,
        customer_last_name: cust.last,
        customer_registration: cust.reg,
    };
}

function pct(part: number, total: number): string {
    return total ? ((part / total) * 100).toFixed(1) + '%' : '0%';
}

async function resolveShopId(supabase: SupabaseClient): Promise<string> {
    if (SHOP_ID) return SHOP_ID;
    const { data: shops } = await supabase.from('shops').select('id, name').order('created_at', { ascending: true });
    if (!shops?.length) throw new Error('No shops found');
    if (shops.length > 1) {
        console.log('Multiple shops — set SHOP_ID:');
        shops.forEach((s) => console.log(`  ${s.id}  —  ${s.name}`));
        process.exit(1);
    }
    console.log(`Shop: ${shops[0].name} (${shops[0].id})`);
    return shops[0].id;
}

async function main() {
    if (COMMIT && !WIPE && !APPEND) {
        console.error('❌ --commit-той хамт --wipe (бүгдийг солих) эсвэл --append (нэмэх) -ийн аль нэгийг заавал өгнө.');
        console.error('   Бүх гэрээд гэрээний дугаар байхгүй тул давхардлаас сэргийлж энэ нь шаардлагатай.');
        process.exit(1);
    }

    console.log(`📂 ${FILE}`);
    const wb = XLSX.readFile(FILE!, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });
    console.log(`📄 Excel мөр: ${rows.length}\n`);

    const placeholderShop = '00000000-0000-0000-0000-000000000000';
    const mapped: ContractInsert[] = [];
    for (const r of rows) {
        const m = mapRow(r, placeholderShop);
        if (m) mapped.push(m);
    }

    // ----- summary -----
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const managers = new Set<string>();
    let withReg = 0, withName = 0, totalSales = 0, totalPaid = 0, totalBalance = 0;
    for (const c of mapped) {
        byType[c.product_type] = (byType[c.product_type] || 0) + 1;
        byStatus[c.contract_status] = (byStatus[c.contract_status] || 0) + 1;
        if (c.sales_manager) managers.add(c.sales_manager);
        if (c.customer_registration) withReg++;
        if (c.customer_name) withName++;
        totalSales += c.total_price || 0;
        totalPaid += c.paid_amount || 0;
        totalBalance += c.balance || 0;
    }

    console.log('────────── SUMMARY ──────────');
    console.log(`Эх мөр: ${rows.length} → mapped: ${mapped.length}`);
    console.log('Төрлөөр  :', byType);
    console.log('Төлөвөөр :', byStatus);
    console.log(`Менежер  : ${managers.size} өвөрмөц`);
    console.log(`Захиалагчийн нэр задарсан: ${withName} (${pct(withName, mapped.length)}), регистртэй: ${withReg} (${pct(withReg, mapped.length)})`);
    console.log(`Нийт борлуулалт: ${Math.round(totalSales).toLocaleString()}₮ | Төлсөн: ${Math.round(totalPaid).toLocaleString()}₮ | Үлдэгдэл: ${Math.round(totalBalance).toLocaleString()}₮`);

    if (!COMMIT) {
        console.log('\n🟡 DRY RUN — DB-д бичсэнгүй. Бодитоор: --commit --wipe (эсвэл --append).');
        return;
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const shopId = await resolveShopId(supabase);
    mapped.forEach((c) => (c.shop_id = shopId));

    if (WIPE) {
        console.log(`\n🗑  Хуучин property_contracts устгаж байна (shop ${shopId})…`);
        const { error } = await supabase.from('property_contracts').delete().eq('shop_id', shopId);
        if (error) throw error;
    }

    let inserted = 0;
    for (let i = 0; i < mapped.length; i += BATCH) {
        const chunk = mapped.slice(i, i + BATCH);
        const { error } = await supabase.from('property_contracts').insert(chunk);
        if (error) { console.error(`\nBatch ${i / BATCH + 1} failed: ${error.message}`); throw error; }
        inserted += chunk.length;
        process.stdout.write(`\rInserted ${inserted}/${mapped.length}…`);
    }
    console.log(`\n✅ ${inserted} гэрээ property_contracts-д оруулсан.`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
