/**
 * Import project knowledge from Excel files into Supabase
 * 
 * Imports:
 *  1. custom_knowledge → shops table (AI system prompt context)
 *  2. shop_faqs → FAQ entries for AI settings page
 * 
 * Usage: npx tsx scripts/import-project-knowledge.ts
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

function readSheet(wb: XLSX.WorkBook, name: string): any[][] {
    const sheet = wb.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
}

function percentToStr(val: any): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number' && val < 1) return `${Math.round(val * 100)}%`;
    if (typeof val === 'number' && val === 1) return '100%';
    return String(val);
}

// ============================================
// MANDALA GARDEN — Knowledge Builder
// ============================================

function buildMandalaGardenKnowledge(): { knowledge: string; faqs: { question: string; answer: string; category: string }[] } {
    const wb = XLSX.readFile(path.resolve(__dirname, '../Мандала гарден CRM хөгжүүлэлтэд орох мэдээлэл.xlsx'));
    
    let knowledge = '';
    
    // --- Төслийн мэдээлэл ---
    const projData = readSheet(wb, 'Төслийн мэдээлэл');
    knowledge += `## Mandala Garden — Төслийн мэдээлэл\n\n`;
    knowledge += `- **Төслийн нэр:** Mandala Garden хороолол\n`;
    knowledge += `- **Байршил:** ${projData[2]?.[2] || 'Хан-Уул дүүрэг, Яармаг, Арцатын ам'}\n`;
    knowledge += `- **Дүүрэг:** ${projData[3]?.[2] || 'Хан-Уул дүүрэг'}\n`;
    knowledge += `- **GPS:** ${projData[4]?.[2] || ''}\n`;
    knowledge += `- **Нийт блок:** ${projData[5]?.[2] || 24}\n`;
    knowledge += `- **Давхарын тоо (блок бүр):** ${projData[6]?.[2] || 16}\n`;
    knowledge += `- **Нийт байрны тоо:** ${projData[7]?.[2] || 957}\n`;
    knowledge += `- **Баригдаж эхэлсэн:** ${projData[8]?.[2] || 2019}\n`;
    knowledge += `- **Хүлээлгэж өгөх:** ${projData[9]?.[2] || 2030}\n`;
    knowledge += `- **Барилгын явц:** ${percentToStr(projData[10]?.[2])}\n`;
    knowledge += `- **Тайлбар:** ${projData[11]?.[2] || ''}\n\n`;
    
    // --- Онцлог ---
    const features = readSheet(wb, 'Онцлог Тохилог давуу тал ');
    knowledge += `## Онцлог, давуу талууд\n\n`;
    for (let i = 1; i < features.length; i++) {
        const row = features[i];
        if (!row[1]) continue;
        const status = (row[2] || '').toString().trim();
        const detail = row[3] ? ` — ${row[3]}` : '';
        knowledge += `- ${row[1]}: ${status}${detail}\n`;
    }
    knowledge += '\n';
    
    // --- Ойр орчин ---
    const nearby = readSheet(wb, 'Ойр орчмын мэдээлэл ');
    knowledge += `## Ойр орчмын байгууллагууд\n\n`;
    for (let i = 1; i < nearby.length; i++) {
        const row = nearby[i];
        if (!row[1]) continue;
        const dist = row[2] ? ` — ${row[2]}` : '';
        knowledge += `- ${row[1]}${dist}\n`;
    }
    knowledge += '\n';
    
    // --- Төлбөр ---
    const payment = readSheet(wb, 'Төлбөрийн мэдээлэл');
    knowledge += `## Төлбөрийн нөхцөл\n\n`;
    knowledge += `### Бэлэн бүтээгдэхүүн (нүүж ороход бэлэн)\n`;
    knowledge += `- Урьдчилгаа: ${percentToStr(payment[1]?.[2])}\n`;
    knowledge += `- Хэсэгчилсэн төлбөр: ${payment[2]?.[2] || 'Үгүй'}\n`;
    knowledge += `- Бэлнээр хөнгөлөлт: ${percentToStr(payment[4]?.[2])}\n\n`;
    knowledge += `### Захиалгын бүтээгдэхүүн\n`;
    knowledge += `- Урьдчилгаа: ${percentToStr(payment[1]?.[3])}\n`;
    knowledge += `- Хэсэгчилсэн төлбөр: ${payment[2]?.[3] || 'Тийм'}\n`;
    knowledge += `- Хэсэг төлөх хугацаа: ${payment[3]?.[3] || 'Ашиглалтад орох хүртэл'}\n`;
    knowledge += `- Бэлнээр хөнгөлөлт: ${percentToStr(payment[4]?.[3])}\n`;
    knowledge += `- Эрт захиалгын хөнгөлөлт: ${percentToStr(payment[6]?.[3])}\n\n`;
    
    // --- Зээл ---
    const loan = readSheet(wb, 'Зээлийн мэдээлэл ');
    knowledge += `## Зээлийн мэдээлэл\n\n`;
    knowledge += `- Хамтрагч банк: ${loan[1]?.[2] || 'Голомт банк'}\n`;
    knowledge += `- Зээлийн хүү (жилийн): ${percentToStr(loan[2]?.[2])}\n`;
    knowledge += `- Зээлийн хугацаа: ${loan[3]?.[2] || '15-20 жил'}\n`;
    knowledge += `- Хөнгөлөлттэй зээл: ${(loan[4]?.[2] || '').toString().trim() === 'Тийм' ? 'Тийм' : 'Үгүй'}\n`;
    knowledge += `- Ипотекийн зээл: ${(loan[5]?.[2] || '').toString().trim() === 'Тийм' ? 'Тийм' : 'Үгүй'}\n`;
    knowledge += `- Ногоон зээл: ${(loan[6]?.[2] || '').toString().trim() === 'Тийм' ? 'Тийм' : 'Үгүй'}\n`;
    if (loan[7]?.[3]) knowledge += `- Шаардлагатай бичиг баримт: ${loan[7][3]}\n`;
    knowledge += '\n';
    
    // --- Зогсоол ---
    const parking = readSheet(wb, 'Зогсоолын төлбөр ');
    knowledge += `## Зогсоолын мэдээлэл\n\n`;
    knowledge += `- Паркинг үнэ: ${parking[1]?.[2] || '50,000,000-57,000,000'}₮\n`;
    knowledge += `- Нийт зогсоол: ${parking[2]?.[2] || 1080}\n`;
    knowledge += `- Боломжтой зогсоол: ${parking[3]?.[2] || ''}\n\n`;
    
    // --- Буцаалт ---
    const refund = readSheet(wb, 'Буцаалтын бодлого');
    knowledge += `## Буцаалтын бодлого\n\n`;
    knowledge += `- Шимтгэл: ${percentToStr(refund[3]?.[2])}\n`;
    knowledge += `- Гэрээ цуцлах нөхцөл: ${refund[4]?.[2] || ''}\n\n`;
    
    // --- Нэмэлт ---
    const extra = readSheet(wb, 'Нэмэлт мэдээлэл ');
    knowledge += `## Холбоо барих\n\n`;
    knowledge += `### Борлуулалтын менежерүүд:\n`;
    for (let i = 1; i < extra.length; i++) {
        const row = extra[i];
        if (row[2] && row[3]) {
            knowledge += `- ${row[2]}: ${row[3]}\n`;
        }
        if (row[1] === 2) knowledge += `\n- **Ажлын цаг:** ${row[2]}\n`;
        if (row[1] === 3) knowledge += `- **Шоурум:** ${row[2]}\n`;
        if (row[1] === 5 && row[2]) knowledge += `- **Онцгой нөхцөл:** ${row[2]}\n`;
    }
    knowledge += '\n';
    
    // --- FAQs ---
    const faqSheet = readSheet(wb, 'FAQ Заавал бичих ');
    const faqs: { question: string; answer: string; category: string }[] = [];
    
    // Build FAQ answers from combined data
    const faqAnswers: Record<string, string> = {
        'Урьдчилгаа хэд вэ?': `Бэлэн бүтээгдэхүүнд ${percentToStr(payment[1]?.[2])}, захиалгын бүтээгдэхүүнд ${percentToStr(payment[1]?.[3])} урьдчилгаа төлнө.`,
        'Зээлийн хүү хэд вэ?': `Жилийн ${percentToStr(loan[2]?.[2])} хүүтэй. Голомт банктай хамтарч ажилладаг. Ипотек болон ногоон зээлийн аль алиных нь нөхцөл байна.`,
        'Хэзээ хүлээлгэж өгөх вэ?': `${projData[9]?.[2] || '2030'} он. Одоогийн барилгын явц ${percentToStr(projData[10]?.[2])}.`,
        'Бэлнээр авахад хөнгөлөлт бий юу?': `Захиалгын бүтээгдэхүүнд ${percentToStr(payment[4]?.[3])} хөнгөлөлттэй. Мөн эрт захиалгын ${percentToStr(payment[6]?.[3])} хөнгөлөлт байна.`,
        'Паркинг үнэгүй юу?': `Үгүй, паркинг тусдаа ${parking[1]?.[2] || '50,000,000-57,000,000'}₮ үнэтэй. Нийт ${parking[2]?.[2] || 1080} зогсоолтой.`,
        'Үзлэг хэрхэн товлох вэ?': 'Та манай борлуулалтын менежертэй холбогдож үзлэг товлох боломжтой. Борлуулалтын оффис Яармаг, Арцатын ам, Мандала Гарден байрлалд байрлана.',
        'Ямар банктай хамтарч ажилладаг вэ?': `${loan[1]?.[2] || 'Голомт банк'}. Ипотек, ногоон зээлийн аль аль нь боломжтой.`,
        'Давхар солих боломжтой юу?': 'Гэрээний нөхцлөөс хамааран давхар солих боломжтой.',
        'Ямар материалаар барьсан бэ?': 'Эрчим хүчний хэмнэлттэй, дулаан алдагдал багатай шийдлээр баригдсан.',
        'Дотор засал хийгдсэн үү?': 'Бэлэн бүтээгдэхүүнд дотор засал хийгдсэн байна.',
    };
    
    for (let i = 1; i < faqSheet.length; i++) {
        const q = faqSheet[i]?.[1];
        if (!q) continue;
        const answer = faqAnswers[q] || faqSheet[i]?.[2]?.toString() || faqSheet[i]?.[3]?.toString() || '';
        if (answer) {
            faqs.push({ question: q, answer, category: 'general' });
        }
    }
    
    return { knowledge, faqs };
}

// ============================================
// ELYSIUM — Knowledge Builder  
// ============================================

function buildElysiumKnowledge(): { knowledge: string; faqs: { question: string; answer: string; category: string }[] } {
    const wb = XLSX.readFile(path.resolve(__dirname, '../Elysium CRM орох мэдээлэл.xlsx'));
    
    let knowledge = '';
    
    // --- Төслийн мэдээлэл ---
    const projData = readSheet(wb, 'Төслийн мэдээлэл');
    knowledge += `## Elysium Residence — Төслийн мэдээлэл\n\n`;
    knowledge += `- **Төслийн нэр:** ${projData[1]?.[2] || 'Elysium Residence бизнес зэрэглэлийн орон сууц'}\n`;
    knowledge += `- **Байршил:** ${projData[2]?.[2] || ''}\n`;
    knowledge += `- **Дүүрэг:** ${projData[3]?.[2] || 'Хан-Уул дүүрэг'}\n`;
    knowledge += `- **GPS:** ${projData[4]?.[2] || ''}\n`;
    knowledge += `- **Нийт блок:** ${projData[5]?.[2] || ''}\n`;
    knowledge += `- **Давхарын тоо:** ${projData[6]?.[2] || ''}\n`;
    knowledge += `- **Нийт байрны тоо:** ${projData[7]?.[2] || ''}\n`;
    knowledge += `- **Баригдаж эхэлсэн:** ${projData[8]?.[2] || ''}\n`;
    knowledge += `- **Хүлээлгэж өгөх:** ${projData[9]?.[2] || '2027 оны 2-р улирал'}\n`;
    knowledge += `- **Барилгын явц:** ${percentToStr(projData[10]?.[2])}\n`;
    knowledge += `- **Тайлбар:** ${projData[11]?.[2] || ''}\n\n`;
    
    // --- Онцлог ---
    const features = readSheet(wb, 'Онцлог Тохилог давуу тал ');
    knowledge += `## Онцлог, давуу талууд\n\n`;
    for (let i = 1; i < features.length; i++) {
        const row = features[i];
        if (!row[1]) continue;
        const status = (row[2] || '').toString().trim();
        const detail = row[3] ? ` — ${row[3]}` : '';
        knowledge += `- ${row[1]}: ${status}${detail}\n`;
    }
    knowledge += '\n';
    
    // --- Ойр орчин ---
    const nearby = readSheet(wb, 'Ойр орчмын мэдээлэл ');
    knowledge += `## Ойр орчмын байгууллагууд\n\n`;
    for (let i = 1; i < nearby.length; i++) {
        const row = nearby[i];
        if (!row[1]) continue;
        const dist = row[2] ? ` — ${row[2]}` : '';
        knowledge += `- ${row[1]}${dist}\n`;
    }
    knowledge += '\n';
    
    // --- Төлбөр ---
    const payment = readSheet(wb, 'Төлбөрийн мэдээлэл');
    knowledge += `## Төлбөрийн нөхцөл\n\n`;
    knowledge += `### Бэлэн бүтээгдэхүүн\n`;
    knowledge += `- Урьдчилгаа: ${percentToStr(payment[1]?.[2])}\n`;
    knowledge += `- Хэсэгчилсэн төлбөр: ${payment[2]?.[2] || 'Үгүй'}\n\n`;
    knowledge += `### Захиалгын бүтээгдэхүүн\n`;
    knowledge += `- Урьдчилгаа: ${payment[1]?.[3] || '10-30%, 30%, 50%'}\n`;
    knowledge += `- Хэсэгчилсэн төлбөр: ${payment[2]?.[3] || 'Тийм'}\n`;
    knowledge += `- Хэсэг төлөх хугацаа: ${payment[3]?.[3] || 'Ашиглалтад орох хүртэл'}\n`;
    knowledge += `- Эрт захиалгын хөнгөлөлт: ${payment[6]?.[3] || 'Урьдчилгаанаас хамаарсан'}\n\n`;
    
    // --- Буцаалт ---
    const refund = readSheet(wb, 'Буцаалтын бодлого');
    knowledge += `## Буцаалтын бодлого\n\n`;
    knowledge += `- Шимтгэл: ${percentToStr(refund[3]?.[2])}\n`;
    knowledge += `- Гэрээ цуцлах нөхцөл: ${refund[4]?.[2] || ''}\n\n`;
    
    // --- Нэмэлт ---
    const extra = readSheet(wb, 'Нэмэлт мэдээлэл ');
    knowledge += `## Холбоо барих\n\n`;
    knowledge += `### Борлуулалтын менежерүүд:\n`;
    for (let i = 1; i < extra.length; i++) {
        const row = extra[i];
        if (row[2] && row[3]) {
            knowledge += `- ${row[2]}: ${row[3]}\n`;
        }
        if (row[1] === 2) knowledge += `\n- **Ажлын цаг:** ${row[2]}\n`;
        if (row[1] === 3) knowledge += `- **Борлуулалтын алба:** ${row[2]}\n`;
        if (row[1] === 5 && row[2]) knowledge += `- **Онцгой нөхцөл:** ${row[2]}\n`;
    }
    knowledge += '\n';
    
    // --- Худалдаанд бүтээгдэхүүн ---
    const products = readSheet(wb, 'Нийт худалдаанд бүтээгдэхүүн ');
    knowledge += `## Худалдаанд байгаа бүтээгдэхүүнүүд\n\n`;
    let currentBlock = '';
    for (let i = 2; i < products.length; i++) {
        const row = products[i];
        if (row[0]) currentBlock = row[0];
        if (!row[2]) continue;
        const floorStr = row[1] ? `${row[1]}-р давхар` : '';
        knowledge += `- ${currentBlock} блок, ${floorStr}: ${row[2]}\n`;
    }
    knowledge += '\n';
    
    // --- FAQs ---
    const faqSheet = readSheet(wb, 'FAQ Заавал бичих ');
    const faqs: { question: string; answer: string; category: string }[] = [];
    
    for (let i = 1; i < faqSheet.length; i++) {
        const q = faqSheet[i]?.[1];
        const a = faqSheet[i]?.[2];
        if (!q || !a) continue;
        faqs.push({ question: q, answer: a.toString(), category: 'general' });
    }
    
    return { knowledge, faqs };
}

// ============================================
// MAIN — Import to Supabase
// ============================================

async function main() {
    console.log('🔍 Мэдээлэл уншиж байна...\n');
    
    // 1. Get shops
    const { data: shops, error: shopErr } = await supabase
        .from('shops')
        .select('id, name')
        .order('created_at', { ascending: true });
    
    if (shopErr || !shops?.length) {
        console.error('❌ Shop олдсонгүй:', shopErr);
        process.exit(1);
    }
    
    console.log('📦 Олдсон shop-ууд:');
    shops.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} (${s.id})`));
    console.log('');
    
    // Build knowledge for both projects
    const mandala = buildMandalaGardenKnowledge();
    const elysium = buildElysiumKnowledge();
    
    // Combine all knowledge
    const combinedKnowledge = [mandala.knowledge, elysium.knowledge].join('\n---\n\n');
    const allFaqs = [...mandala.faqs, ...elysium.faqs];
    
    console.log(`📝 Mandala Garden: ${mandala.knowledge.length} тэмдэгт, ${mandala.faqs.length} FAQ`);
    console.log(`📝 Elysium: ${elysium.knowledge.length} тэмдэгт, ${elysium.faqs.length} FAQ`);
    console.log(`📝 Нийт: ${combinedKnowledge.length} тэмдэгт, ${allFaqs.length} FAQ\n`);
    
    // Use first shop (or specify)
    const targetShop = shops[0];
    console.log(`🎯 Target shop: ${targetShop.name} (${targetShop.id})\n`);
    
    // 2. Update custom_knowledge on shop
    const { error: updateErr } = await supabase
        .from('shops')
        .update({ custom_knowledge: combinedKnowledge })
        .eq('id', targetShop.id);
    
    if (updateErr) {
        console.error('❌ custom_knowledge шинэчлэх алдаа:', updateErr);
    } else {
        console.log('✅ custom_knowledge шинэчлэгдлээ');
    }
    
    // 3. Insert FAQs (clear existing first)
    const { error: deleteErr } = await supabase
        .from('shop_faqs')
        .delete()
        .eq('shop_id', targetShop.id);
    
    if (deleteErr) {
        console.error('⚠️ Хуучин FAQ устгах алдаа:', deleteErr);
    }
    
    const faqInserts = allFaqs.map((faq, i) => ({
        shop_id: targetShop.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        sort_order: i,
    }));
    
    const { data: insertedFaqs, error: faqErr } = await supabase
        .from('shop_faqs')
        .insert(faqInserts)
        .select('id, question');
    
    if (faqErr) {
        console.error('❌ FAQ оруулах алдаа:', faqErr);
    } else {
        console.log(`✅ ${insertedFaqs?.length || 0} FAQ оруулагдлаа:`);
        insertedFaqs?.forEach(f => console.log(`   - ${f.question}`));
    }
    
    console.log('\n🎉 Import дууслаа!');
}

main().catch(console.error);
