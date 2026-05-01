/**
 * Import Elysium Residence Block Б1 (110 units) into Supabase.
 *
 * Replaces prior placeholder Elysium properties (created by import-project-knowledge.ts)
 * with the real 110 units from the customer-supplied Excel file.
 *
 * Writes:
 *  1. properties                         → DELETE name LIKE 'Elysium %' for target shop, INSERT 110
 *  2. shops.custom_knowledge.elysium_units → regenerated as a grouped (available/reserved/sold) listing
 *
 * Idempotent: re-running with the same Excel produces the same DB state.
 *
 * Usage:
 *   npx tsx scripts/import-elysium-b1-units.ts "/Users/aagii/Downloads/Property (property.property) (3).xlsx"
 *   npx tsx scripts/import-elysium-b1-units.ts            # falls back to ./elysium-b1-units.xlsx
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// TYPES & MAPPINGS
// ============================================

type PropertyStatus = 'available' | 'reserved' | 'sold' | 'rented';

const STATUS_MAP: Record<string, PropertyStatus> = {
    'Худалдаанд': 'available',
    'Хадгалсан': 'reserved',
    'Гэрээ баталгаажсан': 'sold',
    'Хүлээлгэсэн': 'sold',
};

interface ExcelRow {
    'Код': string;
    'Загвар': string;
    'Хуучин Тоот': number;
    'Давхар': number;
    'Борлуулах талбай': number;
    'Борлуулалтын үнэ 1мкв': number;
    'Нийт борлуулах үнэ': number;
    'Бүтээгдэхүүний төлөв': string;
    'Бүтээгдэхүүний төрөл': string;
    'Цонхны харагдац': string;
    'Өрөөний тоо': number;
    'Урьдчилгааны нөхцөл'?: string | number | null;
    'Төлөх урьдчилгаа төлбөр': number;
    'Үлдэгдэл төлбөр': number;
}

interface PropertyInsert {
    shop_id: string;
    name: string;
    description: string;
    type: 'apartment';
    price: number;
    price_per_sqm: number | null;
    currency: 'MNT';
    size_sqm: number;
    rooms: number;
    floor: string;
    district: string;
    city: string;
    status: PropertyStatus;
    is_active: boolean;
    is_featured: boolean;
    features: Record<string, unknown>;
}

// ============================================
// HELPERS
// ============================================

function fmt(n: number): string {
    return Math.round(n).toLocaleString('en-US');
}

function readExcel(filePath: string): ExcelRow[] {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<ExcelRow>(sheet);
}

function buildName(row: ExcelRow): string {
    return `Elysium ${row['Код']} (${row['Загвар']}, давхар ${row['Давхар']}, ${row['Борлуулах талбай']}м², ${row['Өрөөний тоо']} өрөө)`;
}

function buildDescription(row: ExcelRow): string {
    const pricePerSqm = row['Борлуулалтын үнэ 1мкв'];
    const ppsClause = pricePerSqm > 0 ? ` 1м² үнэ ${fmt(pricePerSqm)}₮.` : '';
    return `Elysium Residence бизнес зэрэглэлийн орон сууц. Блок Б1, ${row['Давхар']}-р давхар. Талбай ${row['Борлуулах талбай']}м², ${row['Өрөөний тоо']} өрөө. Цонхны харагдац: ${row['Цонхны харагдац']}.${ppsClause} 2027 оны 2-р улиралд хүлээлгэж өгнө.`;
}

function buildFeatures(row: ExcelRow): Record<string, unknown> {
    const features: Record<string, unknown> = {
        project: 'Elysium Residence',
        block: 'Б1',
        unit_code: row['Код'],
        layout: row['Загвар'],
        unit_number: row['Хуучин Тоот'],
        window_view: row['Цонхны харагдац'],
    };

    const dpPct = row['Урьдчилгааны нөхцөл'];
    if (dpPct != null && String(dpPct).trim() !== '') {
        features.down_payment_pct = String(dpPct);
    }
    if (row['Төлөх урьдчилгаа төлбөр'] > 0) {
        features.down_payment_amount = row['Төлөх урьдчилгаа төлбөр'];
    }
    if (row['Үлдэгдэл төлбөр'] > 0) {
        features.remaining_balance = row['Үлдэгдэл төлбөр'];
    }

    return features;
}

function buildKnowledgeText(rows: ExcelRow[]): string {
    const grouped: Record<PropertyStatus, ExcelRow[]> = { available: [], reserved: [], sold: [], rented: [] };
    for (const row of rows) {
        const status = STATUS_MAP[row['Бүтээгдэхүүний төлөв']];
        if (!status) continue;
        grouped[status].push(row);
    }

    const labels: Record<PropertyStatus, string> = {
        available: 'Худалдаанд бэлэн',
        reserved: 'Хадгалсан',
        sold: 'Зарагдсан/Гэрээтэй',
        rented: 'Түрээслэсэн',
    };

    const sections: string[] = [
        `Elysium Residence Б1 блокийн нийт ${rows.length} байр (давхар 2-23, давхар тус бүрт 5 байр):`,
        '',
    ];

    for (const status of ['available', 'reserved', 'sold'] as const) {
        const list = grouped[status];
        if (!list.length) continue;
        sections.push(`[${labels[status]} — ${list.length}]`);
        for (const r of list) {
            sections.push(
                `- ${r['Код']}: ${r['Загвар']}, давхар ${r['Давхар']}, ${r['Борлуулах талбай']}м², ${r['Өрөөний тоо']} өрөө, ${r['Цонхны харагдац']}, ${fmt(r['Нийт борлуулах үнэ'])}₮`
            );
        }
        sections.push('');
    }

    sections.push('Жич: үнийн дэлгэрэнгүй ба нөхцлийн талаар борлуулалтын менежертэй холбогдоно уу.');

    return sections.join('\n');
}

// ============================================
// MAIN
// ============================================

async function main() {
    const filePath = process.argv[2] || path.resolve(process.cwd(), 'elysium-b1-units.xlsx');
    console.log(`📂 Excel: ${filePath}`);

    const rows = readExcel(filePath);
    console.log(`📊 Нийт ${rows.length} мөр уншсан\n`);

    // Validate every row before any DB write
    for (const row of rows) {
        if (!row['Код']) throw new Error(`Код хоосон row олдов`);
        if (!STATUS_MAP[row['Бүтээгдэхүүний төлөв']]) {
            throw new Error(`Тодорхойгүй статус "${row['Бүтээгдэхүүний төлөв']}" (${row['Код']})`);
        }
        if (!row['Нийт борлуулах үнэ'] || row['Нийт борлуулах үнэ'] <= 0) {
            throw new Error(`Үнэ 0 эсвэл хоосон байна (${row['Код']})`);
        }
    }

    // Pick target shop (first by created_at — same as import-project-knowledge.ts)
    const { data: shops, error: shopErr } = await supabase
        .from('shops')
        .select('id, name, created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    if (shopErr || !shops?.length) {
        console.error('❌ Shop олдсонгүй:', shopErr);
        process.exit(1);
    }
    const targetShop = shops[0];
    console.log(`🎯 Target shop: ${targetShop.name} (${targetShop.id})\n`);

    // Delete existing Elysium properties
    const { data: deleted, error: delErr } = await supabase
        .from('properties')
        .delete()
        .eq('shop_id', targetShop.id)
        .like('name', 'Elysium %')
        .select('id');
    if (delErr) {
        console.error('❌ Delete алдаа:', delErr);
        process.exit(1);
    }
    console.log(`🗑  Хуучин Elysium байр устгасан: ${deleted?.length || 0}`);

    // Build inserts
    const inserts: PropertyInsert[] = rows.map((row) => {
        const status = STATUS_MAP[row['Бүтээгдэхүүний төлөв']];
        const pricePerSqm = row['Борлуулалтын үнэ 1мкв'];
        return {
            shop_id: targetShop.id,
            name: buildName(row),
            description: buildDescription(row),
            type: 'apartment',
            price: row['Нийт борлуулах үнэ'],
            price_per_sqm: pricePerSqm > 0 ? pricePerSqm : null,
            currency: 'MNT',
            size_sqm: row['Борлуулах талбай'],
            rooms: row['Өрөөний тоо'],
            floor: String(row['Давхар']),
            district: 'Хан-Уул',
            city: 'Улаанбаатар',
            status,
            is_active: true,
            is_featured: false,
            features: buildFeatures(row),
        };
    });

    // Bulk insert
    const { data: inserted, error: insErr } = await supabase
        .from('properties')
        .insert(inserts)
        .select('id, status');
    if (insErr) {
        console.error('❌ Insert алдаа:', insErr);
        process.exit(1);
    }

    const counts: Record<string, number> = { available: 0, reserved: 0, sold: 0, rented: 0 };
    for (const p of inserted || []) counts[p.status as string]++;
    console.log(`✅ properties insert хийсэн: ${inserted?.length || 0}`);
    console.log(`   - available: ${counts.available}`);
    console.log(`   - reserved: ${counts.reserved}`);
    console.log(`   - sold:     ${counts.sold}`);

    // Update custom_knowledge.elysium_units (preserve all other keys)
    const { data: shop, error: readErr } = await supabase
        .from('shops')
        .select('custom_knowledge')
        .eq('id', targetShop.id)
        .single();
    if (readErr) {
        console.error('❌ shop custom_knowledge уншихад алдаа:', readErr);
        process.exit(1);
    }

    const newUnitsText = buildKnowledgeText(rows);
    const newKnowledge = {
        ...((shop.custom_knowledge as Record<string, unknown>) || {}),
        elysium_units: newUnitsText,
    };

    const { error: updErr } = await supabase
        .from('shops')
        .update({ custom_knowledge: newKnowledge })
        .eq('id', targetShop.id);
    if (updErr) {
        console.error('❌ custom_knowledge шинэчлэхэд алдаа:', updErr);
        process.exit(1);
    }
    console.log(`✅ custom_knowledge.elysium_units шинэчлэгдсэн (~${newUnitsText.length} bytes)`);

    console.log('\n🎉 Import дууслаа!');
}

main().catch((e) => {
    console.error('❌ Үндсэн алдаа:', e);
    process.exit(1);
});
