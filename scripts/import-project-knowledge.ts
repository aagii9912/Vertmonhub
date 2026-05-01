/**
 * Import Mandala Garden + Elysium Residence project data into Supabase.
 *
 * Writes:
 *  1. shops.custom_knowledge  → structured Record<string, string>
 *                               (one key per topic per project — read by PromptService.buildDynamicKnowledge)
 *  2. shop_faqs               → one row per FAQ (read by WebhookService.getAIFeatures → PromptService.buildFAQs)
 *  3. properties              → 27 Elysium unit rows (price=0, AI instructed to defer pricing)
 *
 * Idempotent: re-running overwrites prior import for the target shop.
 *
 * Usage:  npx tsx scripts/import-project-knowledge.ts
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
// HELPERS
// ============================================

type Row = (string | number | null | undefined)[];

function readSheet(wb: XLSX.WorkBook, name: string): Row[] {
    const sheet = wb.Sheets[name];
    if (!sheet) throw new Error(`Sheet not found: "${name}"`);
    return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null }) as Row[];
}

function pct(val: unknown): string {
    if (val == null) return '-';
    if (typeof val === 'number') {
        return val < 1 ? `${Math.round(val * 100)}%` : `${val}%`;
    }
    return String(val).trim();
}

function s(val: unknown): string {
    return val == null ? '' : String(val).trim();
}

function yn(val: unknown): boolean {
    return s(val).toLowerCase().startsWith('тийм');
}

// ============================================
// MANDALA GARDEN — knowledge builder
// ============================================

interface Built {
    knowledge: Record<string, string>;
    faqs: Array<{ question: string; answer: string }>;
}

function buildMandalaGarden(): Built {
    const wb = XLSX.readFile(path.resolve(__dirname, '../Мандала гарден CRM хөгжүүлэлтэд орох мэдээлэл.xlsx'));

    const proj = readSheet(wb, 'Төслийн мэдээлэл');
    const features = readSheet(wb, 'Онцлог Тохилог давуу тал ');
    const nearby = readSheet(wb, 'Ойр орчмын мэдээлэл ');
    const payment = readSheet(wb, 'Төлбөрийн мэдээлэл');
    const loan = readSheet(wb, 'Зээлийн мэдээлэл ');
    const parking = readSheet(wb, 'Зогсоолын төлбөр ');
    const refund = readSheet(wb, 'Буцаалтын бодлого');
    const extra = readSheet(wb, 'Нэмэлт мэдээлэл ');

    const k: Record<string, string> = {};

    // Overview
    k['mandala_overview'] = [
        `Төслийн нэр: ${s(proj[1]?.[2]) || 'Mandala Garden'}`,
        `Байршил: ${s(proj[2]?.[2])}`,
        `Дүүрэг: ${s(proj[3]?.[2])}`,
        `GPS: ${s(proj[4]?.[2])}`,
        `Нийт блок: ${s(proj[5]?.[2])}`,
        `Давхарын тоо (блок тус бүр): ${s(proj[6]?.[2])}`,
        `Нийт байрны тоо: ${s(proj[7]?.[2])}`,
        `Баригдаж эхэлсэн он: ${s(proj[8]?.[2])}`,
        `Хүлээлгэж өгөх он: ${s(proj[9]?.[2])}`,
        `Барилгын явц: ${pct(proj[10]?.[2])}`,
        `Тайлбар: ${s(proj[11]?.[2])}`,
    ].join('\n');

    // Amenities
    k['mandala_amenities'] = features.slice(1)
        .filter(r => s(r[1]))
        .map(r => `- ${s(r[1])}: ${yn(r[2]) ? 'тийм' : 'үгүй'}${s(r[3]) ? ` — ${s(r[3])}` : ''}`)
        .join('\n');

    // Nearby
    k['mandala_nearby'] = nearby.slice(1)
        .filter(r => s(r[1]))
        .map(r => `- ${s(r[1])}${s(r[2]) ? ` — ${s(r[2])}` : ''}`)
        .join('\n');

    // Payment
    k['mandala_payment'] = [
        `БЭЛЭН БҮТЭЭГДЭХҮҮН (нүүж ороход бэлэн):`,
        `  - Урьдчилгаа: ${pct(payment[1]?.[2])}`,
        `  - Хэсэгчилсэн төлбөр: ${s(payment[2]?.[2]) || 'үгүй'}`,
        `  - Бэлнээр хөнгөлөлт: ${pct(payment[4]?.[2])}`,
        `  - VIP хөнгөлөлт: ${pct(payment[5]?.[2])}`,
        `  - Эрт захиалгын хөнгөлөлт: ${pct(payment[6]?.[2])}`,
        ``,
        `ЗАХИАЛГЫН БҮТЭЭГДЭХҮҮН:`,
        `  - Урьдчилгаа: ${pct(payment[1]?.[3])}`,
        `  - Хэсэгчилсэн төлбөр: ${s(payment[2]?.[3]) || 'тийм'}`,
        `  - Хэсэг төлөх хугацаа: ${s(payment[3]?.[3]) || 'Ашиглалтад орох хүртэл'}`,
        `  - Бэлнээр хөнгөлөлт: ${pct(payment[4]?.[3])}`,
        `  - Эрт захиалгын хөнгөлөлт: ${pct(payment[6]?.[3])}`,
    ].join('\n');

    // Loan
    k['mandala_loan'] = [
        `Хамтрагч банк: ${s(loan[1]?.[2]) || 'Голомт банк'}`,
        `Зээлийн хүү (жилийн): ${pct(loan[2]?.[2])}`,
        `Зээлийн хугацаа: ${s(loan[3]?.[2]) || '15-20 жил'}`,
        `Хөнгөлөлттэй зээл: ${yn(loan[4]?.[2]) ? 'тийм' : 'үгүй'}`,
        `Ипотекийн зээл: ${yn(loan[5]?.[2]) ? 'тийм' : 'үгүй'}`,
        `Ногоон зээл: ${yn(loan[6]?.[2]) ? 'тийм' : 'үгүй'}`,
        `Шаардлагатай бичиг баримт: Иргэний үнэмлэхний хуулбар, оршин суугаа хаяг, мэйл хаяг, утасны дугаар`,
    ].join('\n');

    // Parking
    k['mandala_parking'] = [
        `Паркинг үнэ: ${s(parking[1]?.[2]) || '50,000,000-57,000,000'}₮`,
        `Нийт зогсоол: ${s(parking[2]?.[2]) || '1080'}`,
        `Боломжтой зогсоол: ${s(parking[3]?.[2]) || '464'}`,
        `Гадна зогсоол: 749 ширхэг`,
    ].join('\n');

    // Refund
    k['mandala_refund'] = [
        `Шимтгэл суутгал: ${pct(refund[3]?.[2])}`,
        `Гэрээ цуцлах нөхцөл: ${s(refund[4]?.[2])}`,
    ].join('\n');

    // Contacts
    const managers: string[] = [];
    let workHours = '';
    let showroom = '';
    let specialOffer = '';
    for (const row of extra.slice(1)) {
        const idx = row[0];
        if (idx == null && s(row[1]) && s(row[2])) {
            managers.push(`${s(row[1])}: ${s(row[2])}`);
        } else if (idx === 1 && s(row[1]) && s(row[2])) {
            managers.push(`${s(row[1])}: ${s(row[2])}`);
        } else if (idx === 2) {
            workHours = s(row[1]);
        } else if (idx === 3) {
            showroom = s(row[1]);
        } else if (idx === 5) {
            specialOffer = s(row[1]);
        }
    }
    k['mandala_contacts'] = [
        `Борлуулалтын менежерүүд:`,
        ...managers.map(m => `  - ${m}`),
        ``,
        `Ажлын цаг: ${workHours || '09:00-18:00'}`,
        `Шоурум: ${showroom || 'Яармаг, Арцатын ам, Мандала Гарден борлуулалтын оффис'}`,
        specialOffer ? `Онцгой нөхцөл: ${specialOffer}` : '',
    ].filter(Boolean).join('\n');

    // FAQs — Mandala FAQ sheet has bare answers (numbers), so synthesize from full data.
    const faqs: Array<{ question: string; answer: string }> = [
        { question: 'Mandala Garden хаана байрлах вэ?', answer: `${s(proj[2]?.[2])}. Дүүрэг: ${s(proj[3]?.[2])}.` },
        { question: 'Mandala Garden урьдчилгаа хэд вэ?', answer: `Бэлэн бүтээгдэхүүнд ${pct(payment[1]?.[2])}, захиалгын бүтээгдэхүүнд ${pct(payment[1]?.[3])}.` },
        { question: 'Mandala Garden зээлийн хүү хэд вэ?', answer: `Жилийн ${pct(loan[2]?.[2])}. Голомт банктай хамтарч ажилладаг. Ипотек болон ногоон зээлийн нөхцөл бий.` },
        { question: 'Mandala Garden хэзээ хүлээлгэж өгөх вэ?', answer: `${s(proj[9]?.[2]) || '2030'} он. Барилгын явц одоогоор ${pct(proj[10]?.[2])}.` },
        { question: 'Mandala Garden бэлнээр авахад хөнгөлөлт байна уу?', answer: `Захиалгын бүтээгдэхүүнд ${pct(payment[4]?.[3])} бэлний хөнгөлөлт. Эрт захиалгын ${pct(payment[6]?.[3])} нэмэлт хөнгөлөлт.` },
        { question: 'Mandala Garden паркинг үнэгүй юу?', answer: `Үгүй, паркинг тусдаа ${s(parking[1]?.[2]) || '50-57 сая'}₮ үнэтэй. Нийт ${s(parking[2]?.[2]) || '1080'} газар доорх + 749 гадна зогсоолтой.` },
        { question: 'Mandala Garden үзлэг хэрхэн товлох вэ?', answer: `Манай борлуулалтын менежертэй холбогдож үзлэг товлоно. Шоурум: Яармаг, Арцатын ам, Мандала Гарден борлуулалтын оффис.` },
        { question: 'Mandala Garden ямар банктай хамтарч ажилладаг вэ?', answer: `${s(loan[1]?.[2]) || 'Голомт банк'}. Ипотек болон ногоон зээлийн аль аль нь боломжтой.` },
        { question: 'Mandala Garden давхар солих боломжтой юу?', answer: 'Гэрээний нөхцлөөс хамааран давхар солих боломжтой. Нарийвчилсан нөхцлөө борлуулалтын менежерээс асууна уу.' },
        { question: 'Mandala Garden ямар материалаар барьсан бэ?', answer: 'Эрчим хүчний хэмнэлттэй, дулаан алдагдал багатай шийдлээр баригдсан.' },
        { question: 'Mandala Garden дотор засал хийгдсэн үү?', answer: 'Бэлэн бүтээгдэхүүнд дотор засал хийгдсэн байна. Захиалгын бүтээгдэхүүний нөхцлийг гэрээгээр тохирно.' },
    ];

    return { knowledge: k, faqs };
}

// ============================================
// ELYSIUM — knowledge builder
// ============================================

interface ElysiumUnit {
    block: string;
    floor: string;
    code: string;          // E-1 / E-2 / ...
    sizeSqm: number;
    rooms: number;
    rawText: string;
}

function parseElysiumUnits(rows: Row[]): ElysiumUnit[] {
    const units: ElysiumUnit[] = [];
    let currentBlock = '';
    // skip first 2 rows (title + header)
    for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (s(r[0])) currentBlock = s(r[0]);
        const text = s(r[2]);
        if (!text) continue;
        // normalize Cyrillic Е/cyrillic е (U+0415/U+0435) → Latin E (Elysium uses both)
        const normalizedText = text.replace(/[Ее]/g, 'E').replace(/\s+/g, ' ').trim();
        const m = normalizedText.match(/^([A-Z]-\d+)\s+([\d.]+)\s*мкв\s+(\d+)\s*өрөө/);
        if (!m) continue;
        units.push({
            block: currentBlock,
            floor: s(r[1]),
            code: m[1],
            sizeSqm: parseFloat(m[2]),
            rooms: parseInt(m[3], 10),
            rawText: normalizedText,
        });
    }
    return units;
}

function buildElysium(): Built & { units: ElysiumUnit[] } {
    const wb = XLSX.readFile(path.resolve(__dirname, '../Elysium CRM орох мэдээлэл.xlsx'));

    const proj = readSheet(wb, 'Төслийн мэдээлэл');
    const features = readSheet(wb, 'Онцлог Тохилог давуу тал ');
    const nearby = readSheet(wb, 'Ойр орчмын мэдээлэл ');
    const payment = readSheet(wb, 'Төлбөрийн мэдээлэл');
    const refund = readSheet(wb, 'Буцаалтын бодлого');
    const extra = readSheet(wb, 'Нэмэлт мэдээлэл ');
    const products = readSheet(wb, 'Нийт худалдаанд бүтээгдэхүүн ');
    const faqSheet = readSheet(wb, 'FAQ Заавал бичих ');

    const k: Record<string, string> = {};

    k['elysium_overview'] = [
        `Төслийн нэр: ${s(proj[1]?.[2]) || 'Elysium Residence'}`,
        `Байршил: ${s(proj[2]?.[2])}`,
        `Дүүрэг: ${s(proj[3]?.[2])}`,
        `GPS: ${s(proj[4]?.[2])}`,
        `Нийт блок: ${s(proj[5]?.[2])}`,
        `Давхарын тоо (блок тус бүр): ${s(proj[6]?.[2])}`,
        `Нийт байрны тоо: ${s(proj[7]?.[2])}`,
        `Баригдаж эхэлсэн он: ${s(proj[8]?.[2])}`,
        `Хүлээлгэж өгөх: ${s(proj[9]?.[2]) || '2027'} (2-р улирал)`,
        `Барилгын явц: ${pct(proj[10]?.[2])}`,
        `Тайлбар: ${s(proj[11]?.[2])}`,
    ].join('\n');

    k['elysium_amenities'] = features.slice(1)
        .filter(r => s(r[1]))
        .map(r => `- ${s(r[1])}: ${yn(r[2]) ? 'тийм' : 'үгүй'}${s(r[3]) ? ` — ${s(r[3])}` : ''}`)
        .join('\n');

    // Elysium nearby has section headers (rows where col[0] is null but col[1] is set).
    // Render those as "## category" lines.
    k['elysium_nearby'] = nearby.slice(1)
        .filter(r => s(r[1]))
        .map(r => {
            if (r[0] == null && s(r[1]) && !s(r[2])) {
                return `\n[${s(r[1])}]`;
            }
            return `- ${s(r[1])}${s(r[2]) ? ` — ${s(r[2])}` : ''}`;
        })
        .join('\n')
        .trim();

    k['elysium_payment'] = [
        `БЭЛЭН БҮТЭЭГДЭХҮҮН:`,
        `  - Урьдчилгаа: ${pct(payment[1]?.[2])}`,
        `  - Хэсэгчилсэн төлбөр: ${s(payment[2]?.[2]) || 'үгүй'}`,
        ``,
        `ЗАХИАЛГЫН БҮТЭЭГДЭХҮҮН:`,
        `  - Урьдчилгаа: ${s(payment[1]?.[3]) || '10-30%, 30%, 50%'}`,
        `  - Хэсэгчилсэн төлбөр: ${s(payment[2]?.[3]) || 'тийм'}`,
        `  - Хэсэг төлөх хугацаа: ${s(payment[3]?.[3]) || 'Ашиглалтад орох хүртэл'}`,
        `  - Эрт захиалгын хөнгөлөлт: ${s(payment[6]?.[3]) || 'Урьдчилгаанаас хамаарсан'}`,
    ].join('\n');

    k['elysium_loan'] = [
        `Хамтрагч банкууд: Хаан банк, Голомт банк`,
        `Зээлийн хүү: Тухайн жилийн банкны ханшаар. Одоогоор Хаан банкны энгийн зээл сарын 1.54%, ногоон зээл сарын 1.35-1.4%.`,
        `Зээлийн хугацаа: 15-20 жил`,
        `Ипотекийн зээл: тийм`,
        `Ногоон зээл: тийм`,
    ].join('\n');

    k['elysium_refund'] = [
        `Шимтгэл суутгал: ${pct(refund[3]?.[2])}`,
        `Гэрээ цуцлах нөхцөл: ${s(refund[4]?.[2])}`,
    ].join('\n');

    // Contacts
    const managers: string[] = [];
    let workHours = '';
    let showroom = '';
    let specialOffer = '';
    for (const row of extra.slice(1)) {
        const idx = row[0];
        if (idx == null && s(row[1]) && s(row[2])) {
            managers.push(`${s(row[1])}: ${s(row[2])}`);
        } else if (idx === 1 && s(row[1]) && s(row[2])) {
            managers.push(`${s(row[1])}: ${s(row[2])}`);
        } else if (idx === 2) {
            workHours = s(row[1]);
        } else if (idx === 3) {
            showroom = s(row[1]);
        } else if (idx === 5) {
            specialOffer = s(row[1]);
        }
    }
    k['elysium_contacts'] = [
        `Борлуулалтын менежерүүд:`,
        ...managers.map(m => `  - ${m}`),
        ``,
        `Ажлын цаг: ${workHours || '09:00-18:00'}`,
        `Борлуулалтын алба: ${showroom || 'Үндэсний цэцэрлэгт хүрээлэнгийн баруун хойно, 360 Мандала Тауэр'}`,
        specialOffer ? `Онцгой нөхцөл: ${specialOffer}` : '',
        `Уулзалт товлох линк: https://lnk.elysium.mn/appointment`,
    ].filter(Boolean).join('\n');

    // Units list (also imported as properties below)
    const units = parseElysiumUnits(products);
    k['elysium_units'] = [
        `Худалдаанд байгаа байрны төрлүүд (Block B1, давхар тус бүр давтагдана):`,
        ...units.map(u => `- Блок ${u.block} ${u.floor}-р давхар: ${u.code}, ${u.sizeSqm}м², ${u.rooms} өрөө`),
        ``,
        `Жич: үнийн талаар манай борлуулалтын менежертэй холбогдоно уу.`,
    ].join('\n');

    // FAQs — Elysium FAQ sheet has real answers; use them directly.
    const faqs: Array<{ question: string; answer: string }> = [];
    for (const row of faqSheet.slice(1)) {
        const q = s(row[1]);
        const a = s(row[2]);
        if (q && a) {
            faqs.push({ question: `Elysium ${q}`, answer: a });
        }
    }

    return { knowledge: k, faqs, units };
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('🔍 Парс хийж эхэллээ...\n');

    const mandala = buildMandalaGarden();
    const elysium = buildElysium();

    const combinedKnowledge: Record<string, string> = {
        ...mandala.knowledge,
        ...elysium.knowledge,
    };
    const allFaqs = [...mandala.faqs, ...elysium.faqs];

    const knowledgeBytes = JSON.stringify(combinedKnowledge).length;
    console.log(`📝 Mandala: ${Object.keys(mandala.knowledge).length} key, ${mandala.faqs.length} FAQ`);
    console.log(`📝 Elysium: ${Object.keys(elysium.knowledge).length} key, ${elysium.faqs.length} FAQ, ${elysium.units.length} unit`);
    console.log(`📝 Нийт custom_knowledge: ${Object.keys(combinedKnowledge).length} key, ${knowledgeBytes} bytes\n`);

    // Pick target shop (first by created_at, per user decision)
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

    // 1) custom_knowledge — whole-object replace (NOT merge — old keys with raw markdown blob would linger)
    const { error: knowledgeErr } = await supabase
        .from('shops')
        .update({ custom_knowledge: combinedKnowledge })
        .eq('id', targetShop.id);
    if (knowledgeErr) {
        console.error('❌ custom_knowledge:', knowledgeErr);
        process.exit(1);
    }
    console.log(`✅ custom_knowledge шинэчлэгдлээ (${Object.keys(combinedKnowledge).length} key)`);

    // 2) shop_faqs — clear + bulk insert
    const { error: deleteFaqErr } = await supabase
        .from('shop_faqs')
        .delete()
        .eq('shop_id', targetShop.id);
    if (deleteFaqErr) console.warn('⚠️ Хуучин FAQ устгахад алдаа:', deleteFaqErr);

    const faqInserts = allFaqs.map((f, i) => ({
        shop_id: targetShop.id,
        question: f.question,
        answer: f.answer,
        category: 'general',
        is_active: true,
        sort_order: i,
    }));
    const { data: insertedFaqs, error: faqErr } = await supabase
        .from('shop_faqs')
        .insert(faqInserts)
        .select('id');
    if (faqErr) {
        console.error('❌ FAQ insert:', faqErr);
        process.exit(1);
    }
    console.log(`✅ ${insertedFaqs?.length || 0} FAQ оруулагдлаа`);

    // 3) Elysium properties — clear + bulk insert (idempotent on `name LIKE 'Elysium %'`)
    const { error: deletePropErr } = await supabase
        .from('properties')
        .delete()
        .eq('shop_id', targetShop.id)
        .like('name', 'Elysium %');
    if (deletePropErr) console.warn('⚠️ Хуучин Elysium байр устгахад алдаа:', deletePropErr);

    const propertyInserts = elysium.units.map(u => ({
        shop_id: targetShop.id,
        name: `Elysium ${u.code} (Блок ${u.block}, давхар ${u.floor}, ${u.sizeSqm}м², ${u.rooms} өрөө)`,
        description: `Elysium Residence бизнес зэрэглэлийн орон сууц. Блок ${u.block}, ${u.floor}-р давхар. Талбай ${u.sizeSqm}м², ${u.rooms} өрөө. 2027 оны 2-р улиралд хүлээлгэж өгнө. Үнийн талаар борлуулалтын менежертэй холбогдоно уу.`,
        type: 'apartment',
        price: 0,
        currency: 'MNT',
        size_sqm: u.sizeSqm,
        rooms: u.rooms,
        district: 'Хан-Уул',
        city: 'Улаанбаатар',
        status: 'available',
        is_active: true,
        is_featured: false,
        features: { project: 'Elysium Residence', block: u.block, floor_label: u.floor, unit_code: u.code },
    }));
    const { data: insertedProps, error: propErr } = await supabase
        .from('properties')
        .insert(propertyInserts)
        .select('id');
    if (propErr) {
        console.error('❌ Property insert:', propErr);
        process.exit(1);
    }
    console.log(`✅ ${insertedProps?.length || 0} Elysium байр properties-д орлоо`);

    console.log('\n🎉 Import дууслаа!');
}

main().catch((e) => {
    console.error('❌ Үндсэн алдаа:', e);
    process.exit(1);
});
