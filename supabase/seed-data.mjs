/**
 * Supabase Data Seeder
 * Гэрээ, HubSpot contacts, AI documents-ийг Supabase-д оруулна
 * 
 * Ашиглах заавар:
 *   SUPABASE_URL=your-url SUPABASE_SERVICE_KEY=your-key node supabase/seed-data.mjs
 *   
 * Эсвэл .env файлаас уншина
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Supabase client (service role for bypassing RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    console.error('Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed-data.mjs');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ============================================
// Helper Functions
// ============================================

function parseNumber(val) {
    if (!val || val === '' || val === 'nan') return null;
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function parseDate(val) {
    if (!val || val === '' || val === 'nan') return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function cleanStr(val) {
    if (!val || val === '' || val === 'nan' || val === 'undefined') return null;
    return String(val).trim();
}

// ============================================
// 1. Seed Property Contracts
// ============================================
async function seedPropertyContracts(shopId) {
    console.log('\n📋 Seeding property contracts...');
    
    const csvPath = '/tmp/property_wrong_info.csv';
    if (!fs.existsSync(csvPath)) {
        console.error('  ❌ CSV file not found:', csvPath);
        return;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });
    
    console.log(`  Found ${records.length} records`);
    
    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE).map(row => ({
            shop_id: shopId,
            product_type: cleanStr(row['Бүтээгдэхүүний төрөл']) || 'residential',
            block_name: cleanStr(row['Блокын дугаар']),
            floor: cleanStr(row['Давхар']),
            unit_number: cleanStr(row['Өрөөний №']),
            model: cleanStr(row['Загвар']),
            rooms: parseNumber(row['Өрөөний тоо']),
            contracted_area: parseNumber(row['Гэрээлсэн талбай']),
            price_per_sqm: parseNumber(row['М.кв үнэ']),
            total_price: parseNumber(row['Нийт дүн']),
            paid_amount: parseNumber(row['Нийт төлсөн дүн']),
            balance: parseNumber(row['Нийт үлдэгдэл']),
            penalty_amount: parseNumber(row['Алданги']),
            overdue_days: parseNumber(row['Хугацаа хэтрэлт /хоног/']),
            contract_number: cleanStr(row['Гэрээний дугаар']),
            contract_date: parseDate(row['Гэрээний огноо']),
            order_date: parseDate(row['Захиалгын огноо']),
            payment_condition: cleanStr(row['Захиалгын нөхцөл']),
            remaining_payment_condition: cleanStr(row['Шинэ үлдэгдэл төлбөр төлөх нөхцөл']),
            sales_channel: cleanStr(row['Борлуулалтын суваг']),
            sales_manager: cleanStr(row['Борлуулалтын менежер']),
            bank_status: cleanStr(row['Банкны төлөв']),
            barter_status: cleanStr(row['Бартерийн төлөв']),
            barter_type: cleanStr(row['Бартерийн төрөл']),
            customer_first_name: cleanStr(row['Үндсэн захиалагч/Нэр']),
            customer_last_name: cleanStr(row['Үндсэн захиалагч/Овог']),
            customer_name: [cleanStr(row['Үндсэн захиалагч/Овог']), cleanStr(row['Үндсэн захиалагч/Нэр'])].filter(Boolean).join(' ') || null,
            customer_registration: cleanStr(row['Үндсэн захиалагч/Регистер №']),
            customer_phone: cleanStr(row['Үндсэн захиалагч/Утас']),
            customer_mobile: cleanStr(row['Үндсэн захиалагч/Гар утас'])
        }));

        const { error } = await supabase.from('property_contracts').insert(batch);
        if (error) {
            console.error(`  ❌ Batch ${i / BATCH_SIZE + 1} error:`, error.message);
        } else {
            inserted += batch.length;
            process.stdout.write(`\r  ✅ Inserted: ${inserted}/${records.length}`);
        }
    }
    console.log(`\n  ✅ Done: ${inserted} contracts inserted`);
}

// ============================================
// 2. Seed HubSpot Contacts
// ============================================
async function seedHubSpotContacts(shopId) {
    console.log('\n👥 Seeding HubSpot contacts...');
    
    const csvPath = path.resolve(process.env.HOME, 'Downloads/all-contacts 2.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('  ❌ CSV file not found:', csvPath);
        return;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });
    
    console.log(`  Found ${records.length} records`);
    
    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE).map(row => ({
            shop_id: shopId,
            hubspot_record_id: cleanStr(row['Record ID']),
            first_name: cleanStr(row['First Name']),
            last_name: cleanStr(row['Last Name']),
            phone: cleanStr(row['Phone Number']),
            lifecycle_stage: cleanStr(row['Lifecycle Stage']),
            lead_status: cleanStr(row['Lead Status']),
            contact_owner: cleanStr(row['Contact owner']),
            original_source: cleanStr(row['Original Traffic Source']),
            original_source_drill: cleanStr(row['Original Traffic Source Drill-Down 1']),
            latest_source: cleanStr(row['Latest Traffic Source']),
            lead_source: cleanStr(row['Lead source']),
            city: cleanStr(row['City']),
            hubspot_created_at: parseDate(row['Create Date']) ? new Date(row['Create Date']).toISOString() : null
        }));

        const { error } = await supabase.from('hubspot_contacts').insert(batch);
        if (error) {
            console.error(`  ❌ Batch ${i / BATCH_SIZE + 1} error:`, error.message);
        } else {
            inserted += batch.length;
            process.stdout.write(`\r  ✅ Inserted: ${inserted}/${records.length}`);
        }
    }
    console.log(`\n  ✅ Done: ${inserted} contacts inserted`);
}

// ============================================
// 3. Seed AI Documents (from JSONL)
// ============================================
async function seedAIDocuments(shopId) {
    console.log('\n🧠 Seeding AI documents...');
    
    const files = [
        { path: '/tmp/properties_for_supabase.jsonl', source: 'property_contracts', type: 'contract' },
        { path: '/tmp/contacts_for_supabase.jsonl', source: 'hubspot_contacts', type: 'contact' },
        { path: '/tmp/segments_for_supabase.jsonl', source: 'hubspot_segments', type: 'segment' }
    ];

    for (const file of files) {
        if (!fs.existsSync(file.path)) {
            console.log(`  ⚠️  Skipping ${file.source}: file not found`);
            continue;
        }

        const lines = fs.readFileSync(file.path, 'utf-8').trim().split('\n');
        console.log(`  📄 ${file.source}: ${lines.length} documents`);

        const BATCH_SIZE = 100;
        let inserted = 0;

        for (let i = 0; i < lines.length; i += BATCH_SIZE) {
            const batch = lines.slice(i, i + BATCH_SIZE).map(line => {
                const doc = JSON.parse(line);
                return {
                    shop_id: shopId,
                    content: doc.content,
                    metadata: doc.metadata,
                    source: file.source,
                    document_type: file.type
                };
            });

            const { error } = await supabase.from('ai_documents').insert(batch);
            if (error) {
                console.error(`  ❌ Batch error:`, error.message);
            } else {
                inserted += batch.length;
                process.stdout.write(`\r    ✅ Inserted: ${inserted}/${lines.length}`);
            }
        }
        console.log();
    }
    console.log('  ✅ AI documents done');
}

// ============================================
// 4. Seed AI Knowledge Base
// ============================================
async function seedKnowledgeBase(shopId) {
    console.log('\n📚 Seeding AI knowledge base...');
    
    const kbPath = path.resolve(__dirname, '../src/lib/ai/data-assistant/knowledge-base.json');
    if (!fs.existsSync(kbPath)) {
        console.error('  ❌ Knowledge base not found:', kbPath);
        return;
    }

    const kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    
    const entries = [];
    for (const [category, value] of Object.entries(kb)) {
        if (typeof value === 'object' && !Array.isArray(value)) {
            // For nested objects, store each key separately
            for (const [key, val] of Object.entries(value)) {
                entries.push({
                    shop_id: shopId,
                    category: category,
                    key: key,
                    value: typeof val === 'object' ? val : { value: val },
                    description: `${category} > ${key}`
                });
            }
        } else {
            entries.push({
                shop_id: shopId,
                category: 'general',
                key: category,
                value: Array.isArray(value) ? { items: value } : { value: value },
                description: category
            });
        }
    }

    const { error } = await supabase.from('ai_knowledge_base').upsert(entries, {
        onConflict: 'shop_id,category,key'
    });

    if (error) {
        console.error('  ❌ Error:', error.message);
    } else {
        console.log(`  ✅ Inserted ${entries.length} knowledge base entries`);
    }
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('🚀 Vertmon Hub - Supabase Data Seeder');
    console.log('=' .repeat(50));
    
    // Get shop ID (first shop or from env)
    let shopId = process.env.SHOP_ID;
    
    if (!shopId) {
        const { data: shops, error } = await supabase.from('shops').select('id, name').limit(1);
        if (error || !shops?.length) {
            console.error('❌ No shops found. Create a shop first or set SHOP_ID env var');
            process.exit(1);
        }
        shopId = shops[0].id;
        console.log(`Using shop: ${shops[0].name} (${shopId})`);
    }
    
    // Run all seeders
    await seedPropertyContracts(shopId);
    await seedHubSpotContacts(shopId);
    await seedAIDocuments(shopId);
    await seedKnowledgeBase(shopId);
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ All data seeded successfully!');
    console.log('\nNext steps:');
    console.log('  1. Generate embeddings: node supabase/generate-embeddings.mjs');
    console.log('  2. Verify data: SELECT COUNT(*) FROM property_contracts;');
}

main().catch(console.error);
