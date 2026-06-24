/**
 * Import Mandala Garden unit inventory (зарагдсан + зарагдаагүй) → property_units.
 *
 * Эх дата: "ээлж" бүрийн zip-ээс задалсан 18 xlsx файл (ижил 15 баганатай).
 *   Zoo Garden / Zoo Plus / Water Garden  ×  орон сууц / зогсоол / агуулах / үйлчилгээ
 *
 * Багана: Борлуулалтын менежер | Код | Бүтээгдэхүүний төрөл | Шинэ тоот |
 *         Хуучин Тоот | Борлуулалтын суваг | Бүтээгдэхүүний төлөв | Давхар |
 *         Айлын төрөл | Загвар | Цонхны харагдац | Өрөөний тоо |
 *         Борлуулах талбай | Шинэчилсэн борлуулах талбай | Гэрээлсэн талбай
 *
 * Usage:
 *   npx tsx scripts/import-mandala-units.ts --dir=/tmp/mandala_analysis/zips         # DRY RUN (no DB writes)
 *   npx tsx scripts/import-mandala-units.ts --dir=/tmp/mandala_analysis/zips --commit # wipe shop's units + insert
 *   SHOP_ID=<uuid> npx tsx scripts/import-mandala-units.ts --dir=... --commit
 *
 * Dry-run нь зөвхөн xlsx файл уншина — Supabase холболт шаардахгүй.
 */

import * as XLSX from 'xlsx';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ----- args -----
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const dirArg = args.find((a) => a.startsWith('--dir='))?.slice('--dir='.length);
const BASE_DIR = dirArg || '/tmp/mandala_analysis/zips';
const SHOP_ID = process.env.SHOP_ID;
const BATCH = 200;

// ----- mappings -----
const CATEGORY_MAP: Record<string, string> = {
    'Орон сууц': 'residential',
    'Зогсоол': 'parking',
    'Агуулах': 'industry',
    'Үйлчилгээ': 'commercial',
};

const STATUS_MAP: Record<string, string> = {
    'Худалдаанд': 'available',
    'Хадгалсан': 'reserved',
    'Захиалга үүссэн': 'ordered',
    'Гэрээ баталгаажсан': 'sold',
    'Гэрээ баталгаажаагүй': 'ordered',
    'Хүлээлгэсэн': 'handed_over',
};

function phaseFromPath(p: string): string {
    const lower = p.toLowerCase();
    if (lower.includes('watergarden')) return 'Water Garden';
    if (lower.includes('zoogarden')) return 'Zoo Garden';
    if (lower.includes('zooplus')) return 'Zoo Plus';
    return 'Unknown';
}

// ----- cell helpers -----
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

interface UnitInsert {
    shop_id: string;
    phase: string;
    block: string | null;
    building_number: string | null;
    floor: string | null;
    code: string;
    unit_number: string | null;
    legacy_unit_number: string | null;
    category: string;
    unit_type: string | null;
    model: string | null;
    window_view: string | null;
    rooms: number | null;
    sale_area: number | null;
    updated_sale_area: number | null;
    contracted_area: number | null;
    status: string;
    raw_status: string | null;
    sales_channel: string | null;
    sales_manager: string | null;
    source_file: string;
}

function mapRow(row: Row, shopId: string, phase: string, fileName: string): UnitInsert | null {
    const code = cell(row, 'Код', 'code');
    if (!code) return null;

    const building = code.includes('-') ? code.split('-')[0] : code;
    const fileBlockMatch = path.basename(fileName).match(/^(\d+)/);
    const block = fileBlockMatch ? fileBlockMatch[1] : building;

    const rawType = cell(row, 'Бүтээгдэхүүний төрөл');
    const rawStatus = cell(row, 'Бүтээгдэхүүний төлөв');

    return {
        shop_id: shopId,
        phase,
        block,
        building_number: building || null,
        floor: cell(row, 'Давхар') || null,
        code,
        unit_number: cell(row, 'Шинэ тоот') || null,
        legacy_unit_number: cell(row, 'Хуучин Тоот') || null,
        category: CATEGORY_MAP[rawType] || 'residential',
        unit_type: cell(row, 'Айлын төрөл') || null,
        model: cell(row, 'Загвар') || null,
        window_view: cell(row, 'Цонхны харагдац') || null,
        rooms: intNum(row, 'Өрөөний тоо'),
        sale_area: num(row, 'Борлуулах талбай'),
        updated_sale_area: num(row, 'Шинэчилсэн борлуулах талбай'),
        contracted_area: num(row, 'Гэрээлсэн талбай'),
        status: STATUS_MAP[rawStatus] || 'available',
        raw_status: rawStatus || null,
        sales_channel: cell(row, 'Борлуулалтын суваг') || null,
        sales_manager: cell(row, 'Борлуулалтын менежер') || null,
        source_file: path.relative(BASE_DIR, fileName),
    };
}

function findXlsx(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...findXlsx(full));
        else if (entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) out.push(full);
    }
    return out;
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
    if (!fs.existsSync(BASE_DIR)) throw new Error(`Dir not found: ${BASE_DIR}`);

    const files = findXlsx(BASE_DIR).sort();
    console.log(`📂 ${BASE_DIR}\n📄 ${files.length} xlsx файл олдов\n`);

    const shopId = COMMIT ? 'PENDING' : '00000000-0000-0000-0000-000000000000';
    const all: UnitInsert[] = [];
    for (const f of files) {
        const phase = phaseFromPath(f);
        const wb = XLSX.readFile(f);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });
        let kept = 0;
        for (const r of rows) {
            const mapped = mapRow(r, shopId, phase, f);
            if (mapped) { all.push(mapped); kept++; }
        }
        console.log(`  [${phase.padEnd(12)}] ${path.relative(BASE_DIR, f).padEnd(48)} ${kept} нэгж`);
    }

    // ----- dedupe by (phase, category, code) — эх файлд давхардсан мөр байдаг -----
    // Давхардвал sales_manager-тэй (зарагдсан) мөрийг илүүд үзнэ, эс бөгөөс эхнийхийг.
    const seen = new Map<string, UnitInsert>();
    const collapsed: string[] = [];
    for (const u of all) {
        const key = `${u.phase}|${u.category}|${u.code}`;
        const prev = seen.get(key);
        if (!prev) { seen.set(key, u); continue; }
        collapsed.push(`${u.phase}/${u.category}/${u.code}`);
        if (!prev.sales_manager && u.sales_manager) seen.set(key, u);
    }
    const units = [...seen.values()];
    if (collapsed.length) {
        console.log(`\nℹ Эх файл доторх давхардсан ${collapsed.length} мөр нэгтгэв: ${collapsed.slice(0, 12).join(', ')}${collapsed.length > 12 ? '…' : ''}`);
    }

    // ----- summary -----
    const byCat: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPhase: Record<string, number> = {};
    const unknownStatus = new Set<string>();
    for (const u of units) {
        byCat[u.category] = (byCat[u.category] || 0) + 1;
        byStatus[u.status] = (byStatus[u.status] || 0) + 1;
        byPhase[u.phase] = (byPhase[u.phase] || 0) + 1;
        if (u.raw_status && !STATUS_MAP[u.raw_status]) unknownStatus.add(u.raw_status);
    }
    const available = byStatus['available'] || 0;

    console.log('\n────────── SUMMARY ──────────');
    console.log(`Эх мөр: ${all.length} → онцлог нэгж: ${units.length}`);
    console.log('Ангиллаар :', byCat);
    console.log('Төлөвөөр  :', byStatus, `(available = ${pct(available, units.length)})`);
    console.log('Ээлжээр   :', byPhase);
    if (unknownStatus.size) console.log('⚠ Тодорхойгүй raw_status (→ available болсон):', [...unknownStatus]);

    if (!COMMIT) {
        console.log('\n🟡 DRY RUN — DB-д бичсэнгүй. Бодитоор оруулахдаа --commit нэмнэ үү.');
        return;
    }

    // ----- commit -----
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const realShopId = await resolveShopId(supabase);
    units.forEach((u) => (u.shop_id = realShopId));

    console.log(`\n🗑  Хуучин property_units устгаж байна (shop ${realShopId})…`);
    const { error: delErr } = await supabase.from('property_units').delete().eq('shop_id', realShopId);
    if (delErr) throw delErr;

    let inserted = 0;
    for (let i = 0; i < units.length; i += BATCH) {
        const chunk = units.slice(i, i + BATCH);
        const { error } = await supabase.from('property_units').insert(chunk);
        if (error) { console.error(`\nBatch ${i / BATCH + 1} failed: ${error.message}`); throw error; }
        inserted += chunk.length;
        process.stdout.write(`\rInserted ${inserted}/${units.length}…`);
    }
    console.log(`\n✅ ${inserted} нэгж property_units-д оруулсан.`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
