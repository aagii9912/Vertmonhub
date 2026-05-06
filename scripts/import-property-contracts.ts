/**
 * Import contracts from "Property Wrong Info (property.sale).xlsx" → property_contracts table.
 *
 * Usage:
 *   npx tsx scripts/import-property-contracts.ts "/path/to/file.xlsx"
 *   SHOP_ID=<uuid> npx tsx scripts/import-property-contracts.ts <file>   # override shop
 *   WIPE=1 npx tsx scripts/import-property-contracts.ts <file>           # delete shop's existing contracts first
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const FILE = process.argv[2];
const SHOP_ID = process.env.SHOP_ID;
const WIPE = process.env.WIPE === '1';
const BATCH = 100;

if (!FILE) {
    console.error('Usage: npx tsx scripts/import-property-contracts.ts <file.xlsx>');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ----- helpers -----

function excelDateToISO(serial: unknown): string | null {
    if (serial === null || serial === undefined || serial === '') return null;
    const n = typeof serial === 'number' ? serial : Number(serial);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Excel epoch: 1899-12-30 (accounting for the 1900 leap year bug)
    const ms = (n - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

function intNum(v: unknown): number | null {
    const n = num(v);
    return n === null ? null : Math.trunc(n);
}

function str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}

function inferProductType(raw: unknown): string {
    const s = (str(raw) || '').toLowerCase();
    if (['residential', 'parking', 'industry', 'commercial'].includes(s)) return s;
    if (s.includes('агуулах') || s.includes('industry')) return 'industry';
    if (s.includes('зогсоол') || s.includes('parking')) return 'parking';
    if (s.includes('худалд') || s.includes('commercial')) return 'commercial';
    return 'residential';
}

interface XlsxRow {
    [key: string]: string | number | null | undefined;
}

function mapRow(row: XlsxRow, shopId: string) {
    const firstName = str(row['Үндсэн захиалагч/Нэр']);
    const lastName = str(row['Үндсэн захиалагч/Овог']);
    const fullName = [lastName, firstName].filter(Boolean).join(' ').trim()
        || str(row['Үндсэн захиалагч'])
        || null;

    return {
        shop_id: shopId,

        product_type: inferProductType(row['Бүтээгдэхүүний төрөл']),
        block_name: str(row['Блокын дугаар']),
        floor: str(row['Давхар']),
        unit_number: str(row['Шинэ тоот']),
        unit_label: str(row['Бүтээгдэхүүн']),
        unit_type: str(row['Айлын төрөл']),
        model: str(row['Загвар']),
        rooms: intNum(row['Өрөөний тоо']),
        contracted_area: num(row['Гэрээлсэн талбай']),

        price_per_sqm: num(row['М.кв үнэ']),
        total_price: num(row['Нийт дүн']),
        paid_amount: num(row['Нийт төлсөн дүн']),
        balance: num(row['Нийт үлдэгдэл']),
        penalty_amount: num(row['Нийт тооцсон алданги']),
        overdue_days: intNum(row['Нийт хоцорсон хоног']),

        contract_number: str(row['Гэрээний дугаар']),
        contract_date: excelDateToISO(row['Гэрээний огноо']),
        order_date: excelDateToISO(row['Захиалга өгсөн огноо']),
        payment_condition: str(row['Захиалгын нөхцөл']),
        prepayment_condition: str(row['Урьдчилгааны нөхцөл']),
        remaining_payment_condition: str(row['Шинэ үлдэгдэл төлбөр төлөх нөхцөл']),

        sales_channel: str(row['Борлуулалтын суваг']),
        sales_manager: str(row['Борлуулалтын менежер']),
        bank_status: str(row['Банкны төлөв']),
        barter_status: str(row['Бартерийн төлөв']),
        barter_type: str(row['Бартерийн төрөл']),

        customer_name: fullName,
        customer_first_name: firstName,
        customer_last_name: lastName,
        customer_registration: str(row['Үндсэн захиалагч/Регистер №']),
        customer_phone: str(row['Үндсэн захиалагч/Утас']),
        customer_mobile: str(row['Үндсэн захиалагч/Гар утас']),

        commissioning_date: excelDateToISO(row['Ашиглалтад орох огноо']),
    };
}

async function main() {
    let shopId = SHOP_ID;
    if (!shopId) {
        const { data: shops } = await supabase.from('shops').select('id, name').limit(5);
        if (!shops?.length) throw new Error('No shops found');
        if (shops.length > 1) {
            console.log('Multiple shops, set SHOP_ID:');
            shops.forEach(s => console.log(`  ${s.id}  —  ${s.name}`));
            process.exit(1);
        }
        shopId = shops[0].id;
        console.log(`Shop: ${shops[0].name} (${shopId})`);
    }

    console.log(`Reading ${FILE}…`);
    const wb = XLSX.readFile(FILE);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet, { defval: '' });
    console.log(`Excel rows: ${rows.length}`);

    if (WIPE) {
        console.log('Wiping existing contracts for this shop…');
        const { error } = await supabase.from('property_contracts').delete().eq('shop_id', shopId);
        if (error) throw error;
    }

    const mapped = rows.map(r => mapRow(r, shopId!)).filter(r => r.contract_number || r.unit_label);
    console.log(`Valid rows after mapping: ${mapped.length}`);

    let inserted = 0;
    const errors: Array<{ batch: number; reason: string }> = [];

    for (let i = 0; i < mapped.length; i += BATCH) {
        const chunk = mapped.slice(i, i + BATCH);
        const { error, count } = await supabase
            .from('property_contracts')
            .insert(chunk, { count: 'exact' });
        if (error) {
            errors.push({ batch: i / BATCH, reason: error.message });
            console.error(`\nBatch ${i / BATCH + 1} failed: ${error.message}`);
        } else {
            inserted += chunk.length;
        }
        process.stdout.write(`\rInserted ${inserted}/${mapped.length}…`);
        void count;
    }

    process.stdout.write('\n──────────────────\n');
    console.log(`Source rows  : ${rows.length}`);
    console.log(`Mapped rows  : ${mapped.length}`);
    console.log(`Inserted     : ${inserted}`);
    console.log(`Failed batches: ${errors.length}`);
    if (errors.length) {
        console.log('First failure:', errors[0]);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
