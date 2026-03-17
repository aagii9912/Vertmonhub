import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getClerkUser } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import * as XLSX from 'xlsx';

// ============================================
// TYPES
// ============================================

type ImportType =
    | 'properties'
    | 'faq'
    | 'company'
    | 'project'
    | 'payment_policy'
    | 'loan_info'
    | 'amenities'
    | 'ai_extra';

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    errors?: string[];
    message: string;
}

// ============================================
// POST /api/admin/import
// Bulk import data from CSV/Excel
// Super Admin + зөвшөөрөгдсөн хүмүүс
// ============================================
export async function POST(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Check if user is super_admin or has import permission
        const { data: admin } = await supabase
            .from('admins')
            .select('role, permissions')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (!admin) {
            return NextResponse.json({ error: 'Админ эрх шаардлагатай' }, { status: 403 });
        }

        const isSuperAdmin = admin.role === 'super_admin';
        const hasImportPerm = admin.permissions?.can_import_data === true;

        if (!isSuperAdmin && !hasImportPerm) {
            return NextResponse.json({ error: 'Import хийх эрх байхгүй. Super Admin-д хандана уу.' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const shopId = formData.get('shopId') as string;
        const importType = formData.get('type') as ImportType;

        if (!file || !shopId) {
            return NextResponse.json({ error: 'Файл болон shopId шаардлагатай' }, { status: 400 });
        }

        if (!importType) {
            return NextResponse.json({ error: 'Import төрөл сонгоно уу' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        let result: ImportResult;

        switch (importType) {
            case 'properties':
                result = await importProperties(supabase, buffer, shopId);
                break;
            case 'faq':
                result = await importFAQ(supabase, buffer, shopId);
                break;
            case 'company':
                result = await importCompany(supabase, buffer, shopId);
                break;
            case 'project':
                result = await importProject(supabase, buffer, shopId);
                break;
            case 'payment_policy':
                result = await importPaymentPolicy(supabase, buffer, shopId);
                break;
            case 'loan_info':
                result = await importLoanInfo(supabase, buffer, shopId);
                break;
            case 'amenities':
                result = await importAmenities(supabase, buffer, shopId);
                break;
            case 'ai_extra':
                result = await importAIExtra(supabase, buffer, shopId);
                break;
            default:
                return NextResponse.json({ error: 'Буруу import төрөл' }, { status: 400 });
        }

        return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } catch (error) {
        return safeErrorResponse(error, 'Import алдаа');
    }
}

// ============================================
// HELPERS
// ============================================

function parseExcel(buffer: Buffer): Record<string, any>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
}

function getVal(row: Record<string, any>, ...keys: string[]): string {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
            return String(row[key]).trim();
        }
    }
    return '';
}

function getNum(row: Record<string, any>, ...keys: string[]): number | null {
    const val = getVal(row, ...keys);
    if (!val) return null;
    const num = parseFloat(val.replace(/[,₮%]/g, ''));
    return isNaN(num) ? null : num;
}

/**
 * Batch upsert to ai_knowledge_base
 * Replaces sequential select-then-insert/update with batch operations.
 * Reduces DB calls from O(n*2) → O(3).
 */
async function batchUpsertKnowledge(
    supabase: any,
    entries: Array<{ shop_id: string; category: string; key: string; value: string; description?: string }>,
    shopId: string,
    category: string
): Promise<{ imported: number; updated: number }> {
    if (entries.length === 0) return { imported: 0, updated: 0 };

    // 1. Fetch all existing records for this shop+category in ONE query
    const { data: existingRecords } = await supabase
        .from('ai_knowledge_base')
        .select('id, key')
        .eq('shop_id', shopId)
        .eq('category', category);

    const existingMap = new Map<string, string>();
    if (existingRecords) {
        for (const rec of existingRecords) {
            existingMap.set(rec.key, rec.id);
        }
    }

    // 2. Split into inserts vs updates
    const toInsert: typeof entries = [];
    const toUpdate: Array<{ id: string; value: string; description?: string }> = [];

    for (const entry of entries) {
        const existingId = existingMap.get(entry.key);
        if (existingId) {
            toUpdate.push({ id: existingId, value: entry.value, description: entry.description });
        } else {
            toInsert.push(entry);
        }
    }

    // 3. Batch insert new records
    if (toInsert.length > 0) {
        await supabase.from('ai_knowledge_base').insert(toInsert);
    }

    // 4. Batch update existing records (in parallel)
    if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map(u =>
            supabase.from('ai_knowledge_base')
                .update({ value: u.value, description: u.description })
                .eq('id', u.id)
        ));
    }

    return { imported: toInsert.length, updated: toUpdate.length };
}

function mapPropertyType(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'apartment': 'apartment', 'орон сууц': 'apartment', 'байр': 'apartment',
        'house': 'house', 'хаус': 'house', 'хашаа байшин': 'house',
        'office': 'office', 'оффис': 'office',
        'land': 'land', 'газар': 'land',
        'commercial': 'commercial', 'худалдааны': 'commercial',
    };
    return map[lower] || 'apartment';
}

function mapPropertyStatus(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'available': 'available', 'боломжтой': 'available', 'чөлөөтэй': 'available', 'зарагдаж байна': 'available',
        'reserved': 'reserved', 'захиалсан': 'reserved', 'захиалагдсан': 'reserved',
        'sold': 'sold', 'зарагдсан': 'sold',
        'rented': 'rented', 'түрээслэсэн': 'rented', 'түрээслэгдсэн': 'rented',
        'barter': 'barter', 'бартер': 'barter', 'солилцоо': 'barter',
    };
    return map[lower] || 'available';
}

// ============================================
// 1. PROPERTIES IMPORT (Enhanced)
// ============================================

async function importProperties(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    const properties = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const name = getVal(row, 'Нэр', 'name', 'Name', 'Байрны нэр', 'Байрны нэр/код');
        const price = getNum(row, 'Үнэ', 'price', 'Price', 'Үнэ (₮)');

        if (!name) { errors.push(`Мөр ${rowNum}: Нэр хоосон`); continue; }
        if (!price || price <= 0) { errors.push(`Мөр ${rowNum}: Үнэ буруу (${name})`); continue; }

        // Build features array from additional fields
        const features: string[] = [];
        const block = getVal(row, 'Блок', 'block', 'Block');
        const direction = getVal(row, 'Чиглэл', 'direction', 'Зүг', 'Чиглэл (зүг)');
        const balcony = getVal(row, 'Тагт', 'Балкон', 'Тагт/Балкон', 'balcony');

        if (block) features.push(`Блок: ${block}`);
        if (direction) features.push(`Чиглэл: ${direction}`);
        if (balcony && balcony.toLowerCase() !== 'үгүй' && balcony.toLowerCase() !== 'no') {
            features.push(`Тагт/Балкон: ${balcony}`);
        }

        const type = mapPropertyType(getVal(row, 'Төрөл', 'type', 'Type') || 'apartment');
        const status = mapPropertyStatus(getVal(row, 'Статус', 'status', 'Status') || 'available');

        properties.push({
            shop_id: shopId,
            name,
            description: getVal(row, 'Тайлбар', 'description', 'Description') || null,
            type,
            price,
            price_per_sqm: getNum(row, '1м² үнэ', '1м²-ийн үнэ', 'price_per_sqm'),
            size_sqm: getNum(row, 'Талбай', 'size_sqm', 'м²', 'Нийт талбай', 'Нийт талбай (м²)'),
            rooms: getNum(row, 'Өрөө', 'rooms', 'Rooms', 'Өрөөний тоо'),
            bedrooms: getNum(row, 'Унтлагын өрөө', 'bedrooms', 'Унтлагын өрөө'),
            bathrooms: getNum(row, 'Угаалгын өрөө', 'bathrooms', 'Угаалгын өрөө'),
            floor: getVal(row, 'Давхар', 'floor', 'Floor') || null,
            address: getVal(row, 'Хаяг', 'address', 'Address') || null,
            district: getVal(row, 'Дүүрэг', 'district', 'District') || null,
            status,
            features,
            is_active: true,
        });
    }

    if (properties.length === 0) {
        return { success: false, message: 'Оруулах өгөгдөл олдсонгүй', errors };
    }

    const { data, error } = await supabase.from('properties').insert(properties).select('id, name');
    if (error) return { success: false, message: error.message, errors };

    return {
        success: true,
        imported: data.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `${data.length} байр амжилттай оруулсан${errors.length > 0 ? `, ${errors.length} алдаа` : ''}`,
    };
}

// ============================================
// 2. FAQ IMPORT
// ============================================

async function importFAQ(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    const entries = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const title = getVal(row, 'Асуулт', 'question', 'Question', 'Гарчиг');
        const content = getVal(row, 'Хариулт', 'answer', 'Answer', 'Агуулга');

        if (!title || !content) { errors.push(`Мөр ${rowNum}: Асуулт эсвэл хариулт хоосон`); continue; }

        entries.push({
            shop_id: shopId,
            title,
            content,
            type: 'faq',
            is_active: true,
        });
    }

    if (entries.length === 0) return { success: false, message: 'FAQ олдсонгүй', errors };

    const { data, error } = await supabase.from('custom_knowledge').insert(entries).select('id, title');
    if (error) return { success: false, message: error.message };

    return {
        success: true,
        imported: data.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `${data.length} FAQ амжилттай оруулсан`,
    };
}

// ============================================
// 3. COMPANY IMPORT
// ============================================

async function importCompany(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    const entries = [];

    // Each row is a key-value or we take the first row as a single company
    const row = rows[0];
    const mappings: [string, string[], string][] = [
        ['company_name', ['Компанийн бүтэн нэр', 'Нэр', 'Company Name', 'name'], 'Компанийн нэр'],
        ['founded_year', ['Үүсгэн байгуулагдсан он', 'Founded', 'Он'], 'Үүсгэн байгуулагдсан'],
        ['phone', ['Утас', 'Phone', 'Утас (компани)'], 'Утас'],
        ['email', ['Имэйл', 'Email'], 'Имэйл'],
        ['website', ['Вэбсайт', 'Website'], 'Вэбсайт'],
        ['address', ['Хаяг', 'Address', 'Хаяг (оффис)'], 'Хаяг'],
        ['facebook', ['Facebook хуудас', 'Facebook', 'FB'], 'Facebook'],
        ['instagram', ['Instagram хуудас', 'Instagram', 'IG'], 'Instagram'],
        ['description', ['Компанийн товч танилцуулга', 'Description', 'Тайлбар'], 'Танилцуулга'],
        ['total_projects', ['Нийт барьсан төслийн тоо', 'Projects', 'Төслийн тоо'], 'Нийт төслийн тоо'],
    ];

    for (const [key, cols, desc] of mappings) {
        const value = getVal(row, ...cols);
        if (value) {
            entries.push({
                shop_id: shopId,
                category: 'company',
                key,
                value: JSON.stringify(value),
                description: desc,
            });
        }
    }

    if (entries.length === 0) return { success: false, message: 'Компанийн мэдээлэл олдсонгүй' };

    const { imported, updated } = await batchUpsertKnowledge(supabase, entries, shopId, 'company');

    return {
        success: true,
        imported,
        updated,
        message: `Компанийн мэдээлэл: ${imported} шинэ, ${updated} шинэчлэгдсэн`,
    };
}

// ============================================
// 4. PROJECT IMPORT
// ============================================

async function importProject(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    const entries = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const projectName = getVal(row, 'Төслийн нэр', 'Нэр', 'Project Name', 'name');
        if (!projectName) { errors.push(`Мөр ${rowNum}: Төслийн нэр хоосон`); continue; }

        const projectData: Record<string, any> = {
            name: projectName,
            location: getVal(row, 'Байршил', 'Location', 'Хаяг'),
            district: getVal(row, 'Дүүрэг', 'District'),
            gps: getVal(row, 'GPS координат', 'GPS', 'GPS координат (lat, lng)'),
            total_blocks: getNum(row, 'Нийт блокийн тоо', 'Blocks', 'Нийт блок'),
            total_floors: getVal(row, 'Нийт давхарын тоо', 'Floors', 'Давхарын тоо'),
            total_units: getNum(row, 'Нийт байрны тоо', 'Units', 'Нийт байр'),
            construction_start: getVal(row, 'Баригдаж эхэлсэн огноо', 'Start Date', 'Барилга эхэлсэн'),
            delivery_date: getVal(row, 'Хүлээлгэж өгөх огноо', 'Delivery Date', 'Хүлээлгэх огноо'),
            progress_pct: getNum(row, 'Барилгын явц', 'Барилгын явц (%)', 'Progress'),
            description: getVal(row, 'Төслийн тайлбар', 'Description', 'Тайлбар'),
        };

        // Remove null values
        Object.keys(projectData).forEach(k => {
            if (projectData[k] === null || projectData[k] === '') delete projectData[k];
        });

        entries.push({
            shop_id: shopId,
            category: 'projects',
            key: projectName.toLowerCase().replace(/\s+/g, '_'),
            value: JSON.stringify(projectData),
            description: `Төсөл: ${projectName}`,
        });
    }

    if (entries.length === 0) return { success: false, message: 'Төслийн мэдээлэл олдсонгүй', errors };

    const { imported, updated } = await batchUpsertKnowledge(supabase, entries, shopId, 'projects');

    return {
        success: true,
        imported,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: `Төслийн мэдээлэл: ${imported} шинэ, ${updated} шинэчлэгдсэн`,
    };
}

// ============================================
// 5. PAYMENT POLICY IMPORT
// ============================================

async function importPaymentPolicy(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    // Each row represents a project's payment policy
    const entries = [];
    for (const row of rows) {
        const projectName = getVal(row, 'Төсөл', 'Project', 'Нэр') || 'default';
        const policyData: Record<string, any> = {
            project: projectName,
            down_payment_pct: getNum(row, 'Урьдчилгаа', 'Урьдчилгаа (%)', 'Down Payment'),
            installment_available: getVal(row, 'Хөсөчилсөн төлбөр', 'Installment') || null,
            installment_months: getNum(row, 'Хасагчлэх хугацаа', 'Хөсөчлөх хугацаа', 'Months'),
            discount_pct: getNum(row, 'Бэлнээр хөнгөлөлт', 'Бэлнээр хөнгөлөлт (%)', 'Cash Discount'),
            vip_discount_pct: getNum(row, 'VIP хөнгөлөлт', 'VIP хөнгөлөлт (%)', 'VIP Discount'),
            early_booking_discount: getVal(row, 'Эрт захиалгын хөнгөлөлт', 'Early Booking') || null,
        };

        Object.keys(policyData).forEach(k => {
            if (policyData[k] === null || policyData[k] === '') delete policyData[k];
        });

        entries.push({
            shop_id: shopId,
            category: 'payment',
            key: `policy_${projectName.toLowerCase().replace(/\s+/g, '_')}`,
            value: JSON.stringify(policyData),
            description: `Төлбөрийн бодлого: ${projectName}`,
        });
    }

    if (entries.length === 0) return { success: false, message: 'Төлбөрийн мэдээлэл олдсонгүй' };

    const { imported, updated } = await batchUpsertKnowledge(supabase, entries, shopId, 'payment');

    return {
        success: true,
        imported,
        updated,
        message: `Төлбөрийн бодлого: ${imported} шинэ, ${updated} шинэчлэгдсэн`,
    };
}

// ============================================
// 6. LOAN INFO IMPORT
// ============================================

async function importLoanInfo(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    const row = rows[0];
    const loanData: Record<string, any> = {
        partner_banks: getVal(row, 'Хамтрагч банкууд', 'Banks', 'Банк'),
        interest_rate: getVal(row, 'Зээлийн хүү', 'Зээлийн хүү (жилийн)', 'Interest Rate'),
        loan_term: getVal(row, 'Зээлийн хугацаа', 'Зээлийн хугацаа (жил)', 'Loan Term'),
        has_8pct_program: getVal(row, '"8% зээл" хөтөлбөр', '8% зээл', '8% Program'),
        apartment_subsidy: getVal(row, 'Ажоны байр хөтөлбөр', 'Apartment Subsidy'),
        required_documents: getVal(row, 'Шаардлагатай бичиг баримт', 'Documents', 'Бичиг баримт'),
    };

    Object.keys(loanData).forEach(k => {
        if (!loanData[k]) delete loanData[k];
    });

    const entry = {
        shop_id: shopId,
        category: 'loan',
        key: 'loan_info',
        value: JSON.stringify(loanData),
        description: 'Зээлийн мэдээлэл',
    };

    const { data: existing } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .eq('shop_id', shopId)
        .eq('category', 'loan')
        .eq('key', 'loan_info')
        .single();

    if (existing) {
        await supabase.from('ai_knowledge_base').update({ value: entry.value }).eq('id', existing.id);
        return { success: true, updated: 1, message: 'Зээлийн мэдээлэл шинэчлэгдсэн' };
    }

    await supabase.from('ai_knowledge_base').insert(entry);
    return { success: true, imported: 1, message: 'Зээлийн мэдээлэл оруулсан' };
}

// ============================================
// 7. AMENITIES IMPORT
// ============================================

async function importAmenities(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    // Format: Project Name, Amenity1=Yes, Amenity2=No, ...
    // Or: Онцлог, Тийм/Үгүй, Дэлгэрэнгүй
    const amenitiesByProject: Record<string, string[]> = {};

    for (const row of rows) {
        const projectName = getVal(row, 'Төсөл', 'Project', 'Нэр') || 'default';
        if (!amenitiesByProject[projectName]) amenitiesByProject[projectName] = [];

        // Check each possible amenity column
        const amenityName = getVal(row, 'Онцлог', 'Amenity', 'Онцлог бий юу?');
        const available = getVal(row, 'Тийм/Үгүй', 'Available', 'Тийм', 'Байгаа эсэх');
        const detail = getVal(row, 'Дэлгэрэнгүй', 'Detail', 'Тайлбар');

        if (amenityName && available.toLowerCase() !== 'үгүй' && available.toLowerCase() !== 'no') {
            amenitiesByProject[projectName].push(detail ? `${amenityName} (${detail})` : amenityName);
        }
    }

    const entries = Object.entries(amenitiesByProject).map(([project, amenities]) => ({
        shop_id: shopId,
        category: 'projects',
        key: `amenities_${project.toLowerCase().replace(/\s+/g, '_')}`,
        value: JSON.stringify(amenities),
        description: `${project} — Тохилог/Онцлог`,
    }));

    const { imported, updated } = await batchUpsertKnowledge(supabase, entries, shopId, 'projects');

    return {
        success: true,
        imported,
        updated,
        message: `Тохилог мэдээлэл: ${imported} шинэ, ${updated} шинэчлэгдсэн`,
    };
}

// ============================================
// 8. AI EXTRA INFO IMPORT
// ============================================

async function importAIExtra(supabase: any, buffer: Buffer, shopId: string): Promise<ImportResult> {
    const rows = parseExcel(buffer);
    if (rows.length === 0) return { success: false, message: 'Файл хоосон байна' };

    const entries = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const key = getVal(row, 'Мэдээлэл', 'Түлхүүр', 'Key', 'key');
        const value = getVal(row, 'Утга', 'Бөглөх', 'Value', 'value');

        if (!key) { errors.push(`Мөр ${rowNum}: Мэдээллийн нэр хоосон`); continue; }
        if (!value) { errors.push(`Мөр ${rowNum}: Утга хоосон (${key})`); continue; }

        entries.push({
            shop_id: shopId,
            category: 'ai_extra',
            key: key.toLowerCase().replace(/\s+/g, '_'),
            value: JSON.stringify(value),
            description: key,
        });
    }

    if (entries.length === 0) return { success: false, message: 'AI мэдээлэл олдсонгүй', errors };

    const { imported, updated } = await batchUpsertKnowledge(supabase, entries, shopId, 'ai_extra');

    return {
        success: true,
        imported,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: `AI мэдээлэл: ${imported} шинэ, ${updated} шинэчлэгдсэн`,
    };
}
