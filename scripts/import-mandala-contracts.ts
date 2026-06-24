/**
 * Import Mandala Garden contracts ("Бүх гэрээ.xlsx") → property_contracts.
 *
 * ⚠ "Бүх гэрээ" нь орон сууцны ЦЭВЭР талбаруудыг (давхар/өрөө/айлын төрөл/загвар)
 * тусдаа баганаар БИШ, "Бүтээгдэхүүн" мөрөнд шигтгэсэн байдаг:
 *   "Г1485-68, Энгийн-12.5, Зогсоол, МГ-I ээлж \"Зүү Гарден\""
 * Тиймээс:
 *   1. "Бүтээгдэхүүн"-ээс КОД (Г1485-68) -ыг салгана.
 *   2. Тэр кодоор НЭГЖИЙН файлуудаас (zip-ууд) давхар/өрөө/айлын төрөл/загвар/
 *      цонх/талбай/блок/ээлжийг БАЯЖУУЛНА (≈97% тохирно).
 *   3. М.кв үнийг эх баганаас бус, Нийт дүн ÷ Талбай-аар ЗӨВ тооцно (эх багана
 *      зарим мөрөнд нийт үнийг агуулдаг тул найдваргүй).
 *   4. Бүх 20 баганыг (Төлбөр хоцролт г.м.) бүрэн авна.
 *
 * Usage:
 *   npx tsx scripts/import-mandala-contracts.ts "<Buh_geree.xlsx>"                                  # DRY RUN
 *   npx tsx scripts/import-mandala-contracts.ts "<Buh_geree.xlsx>" --units-dir=/tmp/mandala_analysis/zips --commit --wipe
 */

import * as XLSX from 'xlsx';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const WIPE = args.includes('--wipe');
const APPEND = args.includes('--append');
const UNITS_DIR = args.find((a) => a.startsWith('--units-dir='))?.slice('--units-dir='.length) || '/tmp/mandala_analysis/zips';
const SHOP_ID = process.env.SHOP_ID;
const BATCH = 200;

if (!FILE) {
    console.error('Usage: npx tsx scripts/import-mandala-contracts.ts <Buh_geree.xlsx> [--units-dir=… --commit --wipe|--append]');
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
            const d = new Date((v - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
        if (typeof v === 'string' && v.trim()) {
            const d = new Date(v);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
    }
    return null;
}

// ---------- НЭГЖИЙН ИНДЕКС (баяжуулалт) ----------
interface UnitInfo {
    phase: string; block: string | null; building: string | null;
    floor: string | null; unit_type: string | null; model: string | null;
    window_view: string | null; rooms: number | null; area: number | null;
}
function phaseFromPath(p: string): string {
    const l = p.toLowerCase();
    if (l.includes('watergarden')) return 'Water Garden';
    if (l.includes('zoogarden')) return 'Zoo Garden';
    if (l.includes('zooplus')) return 'Zoo Plus';
    return 'Unknown';
}
function findXlsx(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...findXlsx(full));
        else if (e.name.toLowerCase().endsWith('.xlsx') && !e.name.startsWith('~$')) out.push(full);
    }
    return out;
}
function loadUnitIndex(dir: string): Map<string, UnitInfo> {
    const idx = new Map<string, UnitInfo>();
    if (!fs.existsSync(dir)) { console.warn(`⚠ units-dir not found: ${dir} — баяжуулалтгүй үргэлжилнэ`); return idx; }
    for (const f of findXlsx(dir)) {
        const phase = phaseFromPath(f);
        const fileBlock = path.basename(f).match(/^(\d+)/)?.[1] || null;
        const wb = XLSX.readFile(f);
        const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: null });
        for (const r of rows) {
            const code = cell(r, 'Код');
            if (!code) continue;
            const building = code.includes('-') ? code.split('-')[0] : code;
            idx.set(code, {
                phase,
                block: fileBlock || building,
                building,
                floor: cell(r, 'Давхар') || null,
                unit_type: cell(r, 'Айлын төрөл') || null,
                model: cell(r, 'Загвар') || null,
                window_view: cell(r, 'Цонхны харагдац') || null,
                rooms: intNum(r, 'Өрөөний тоо'),
                area: num(r, 'Борлуулах талбай'),
            });
        }
    }
    return idx;
}

// ---------- "Бүтээгдэхүүн" задлал ----------
// "Г1485-68, Энгийн-12.5, Зогсоол, МГ-I ээлж \"Зүү Гарден\""
function parseProduct(s: string): { code: string; descriptor: string; categoryWord: string } {
    const parts = s.split(',').map((p) => p.trim());
    return { code: parts[0] || '', descriptor: parts[1] || '', categoryWord: parts[2] || '' };
}
// Төрлийг "Бүтээгдэхүүн"-ий БҮТЭН мөрнөөс хайна (зарим мөрд ангилал 3-р token биш
// тул бүтэн мөр найдвартай — хурлын тоо 724/599/262/32-той тааруулна).
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
    if (v.includes('шилж')) return 'transferred';
    if (v.includes('хаас') || v.includes('хаагдсан')) return 'closed';
    return 'active';
}

const REG_RE = /([А-ЯӨҮЁ]{2}\s?\d{8})/u;
function parseCustomer(raw: string): { name: string | null; reg: string | null; first: string | null; last: string | null } {
    if (!raw) return { name: null, reg: null, first: null, last: null };
    const m = raw.match(REG_RE);
    const reg = m ? m[1].replace(/\s/g, '') : null;
    const name = raw.replace(REG_RE, '').trim() || null;
    let first: string | null = null, last: string | null = null;
    if (name && name.includes('.')) {
        const [a, b] = name.split('.', 2).map((s) => s.trim());
        last = a || null; first = b || null;
    }
    return { name, reg, first, last };
}

interface ContractInsert {
    shop_id: string;
    product_type: string;
    block_name: string | null;
    building_number: string | null;
    floor: string | null;
    unit_number: string | null;
    unit_label: string | null;
    unit_type: string | null;
    model: string | null;
    rooms: number | null;
    contracted_area: number | null;
    price_per_sqm: number | null;
    total_price: number | null;
    paid_amount: number | null;
    balance: number | null;
    penalty_amount: number | null;
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

function mapRow(row: Row, shopId: string, units: Map<string, UnitInfo>) {
    const productStr = cell(row, 'Бүтээгдэхүүн');
    const blockRaw = cell(row, 'Блокын дугаар');
    if (!productStr && !blockRaw) return null;

    const { code, descriptor } = parseProduct(productStr);
    const u = code ? units.get(code) : undefined;
    const cust = parseCustomer(cell(row, 'Үндсэн захиалагч'));

    const total = num(row, 'Нийт дүн');
    const area = num(row, 'Гэрээлсэн талбай') ?? u?.area ?? null;
    const pricePerSqm = total && area && area > 0 ? Math.round((total / area) * 100) / 100 : null;

    return {
        shop_id: shopId,
        product_type: inferProductType(productStr),
        block_name: u?.block ?? (code.includes('-') ? code.split('-')[0] : null) ?? blockRaw ?? null,
        building_number: u?.building ?? (code.includes('-') ? code.split('-')[0] : code || null),
        floor: u?.floor ?? null,
        unit_number: cell(row, 'Шинэ тоот') || null,
        // unit_label-д НЭГЖИЙН КОД-ыг хадгална: цэвэр + property_units_with_buyer
        // view-ийн split_part(unit_label,',',1)=code холболтыг ажиллуулна.
        unit_label: code || null,
        unit_type: u?.unit_type ?? null,
        model: u?.model ?? descriptor ?? null,
        rooms: u?.rooms ?? null,
        contracted_area: area,
        price_per_sqm: pricePerSqm,
        total_price: total,
        paid_amount: num(row, 'Нийт төлсөн дүн'),
        balance: num(row, 'Нийт үлдэгдэл'),
        penalty_amount: num(row, 'Төлбөр хоцролт'),
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
        _matched: !!u,
    } as ContractInsert & { _matched: boolean };
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
        console.error('❌ --commit-той хамт --wipe эсвэл --append заавал өгнө (гэрээний дугаар байхгүй тул давхардлаас сэргийлнэ).');
        process.exit(1);
    }

    console.log(`📦 Нэгжийн индекс ачаалж байна (${UNITS_DIR})…`);
    const units = loadUnitIndex(UNITS_DIR);
    console.log(`   ${units.size} нэгж индекслэв.\n`);

    console.log(`📂 ${FILE}`);
    const wb = XLSX.readFile(FILE!, { cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: null });
    console.log(`📄 Excel мөр: ${rows.length}\n`);

    const placeholder = '00000000-0000-0000-0000-000000000000';
    const mapped: (ContractInsert & { _matched: boolean })[] = [];
    for (const r of rows) {
        const m = mapRow(r, placeholder, units);
        if (m) mapped.push(m);
    }

    // ----- summary -----
    const byType: Record<string, number> = {};
    let enriched = 0, withFloor = 0, withRooms = 0, withReg = 0, badPrice = 0;
    for (const c of mapped) {
        byType[c.product_type] = (byType[c.product_type] || 0) + 1;
        if (c._matched) enriched++;
        if (c.floor) withFloor++;
        if (c.rooms != null) withRooms++;
        if (c.customer_registration) withReg++;
        if (c.price_per_sqm == null) badPrice++;
    }
    console.log('────────── SUMMARY ──────────');
    console.log(`mapped: ${mapped.length}`);
    console.log('төрлөөр:', byType);
    console.log(`нэгжээс баяжсан: ${enriched} (${pct(enriched, mapped.length)})`);
    console.log(`  → давхартай: ${withFloor} | өрөөтэй: ${withRooms} | м.кв үнэ тооцоолсон: ${mapped.length - badPrice}`);
    console.log(`регистр задарсан: ${withReg} (${pct(withReg, mapped.length)})`);

    const strip = (c: ContractInsert & { _matched?: boolean }) => { const { _matched, ...rest } = c; void _matched; return rest; };

    if (!COMMIT) {
        const sample = mapped.find((c) => c._matched && c.product_type === 'residential');
        console.log('\nЖишээ баяжсан гэрээ:', JSON.stringify(strip(sample || mapped[0]), null, 1));
        console.log('\n🟡 DRY RUN — DB-д бичсэнгүй. Бодитоор: --commit --wipe.');
        return;
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const shopId = await resolveShopId(supabase);
    const records = mapped.map((c) => { const r = strip(c); r.shop_id = shopId; return r; });

    if (WIPE) {
        console.log(`\n🗑  Хуучин property_contracts устгаж байна (shop ${shopId})…`);
        const { error } = await supabase.from('property_contracts').delete().eq('shop_id', shopId);
        if (error) throw error;
    }

    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH) {
        const chunk = records.slice(i, i + BATCH);
        const { error } = await supabase.from('property_contracts').insert(chunk);
        if (error) { console.error(`\nBatch ${i / BATCH + 1} failed: ${error.message}`); throw error; }
        inserted += chunk.length;
        process.stdout.write(`\rInserted ${inserted}/${records.length}…`);
    }
    console.log(`\n✅ ${inserted} гэрээ property_contracts-д оруулсан (баяжуулсан).`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
