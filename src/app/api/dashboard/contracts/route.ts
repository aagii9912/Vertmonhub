import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import * as XLSX from 'xlsx';

// ============================================
// GET /api/dashboard/contracts
// Жагсаалт + статистик
// ============================================
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ contracts: [], stats: emptyStats() });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;
        const sp = request.nextUrl.searchParams;

        const search = sp.get('search')?.trim() || '';
        const status = sp.get('status'); // active | closed | cancelled | null
        const manager = sp.get('manager');
        const channel = sp.get('channel');
        const overdueOnly = sp.get('overdue') === '1';
        const sortBy = sp.get('sortBy') || 'contract_date';
        const sortOrder = sp.get('sortOrder') === 'asc';

        let query = supabase
            .from('property_contracts')
            .select('*')
            .eq('shop_id', shopId);

        if (status) query = query.eq('contract_status', status);
        if (manager) query = query.eq('sales_manager', manager);
        if (channel) query = query.eq('sales_channel', channel);
        if (overdueOnly) query = query.gt('overdue_days', 0);

        if (search) {
            // Гэрээний дугаар, нэр, утас, регистр-ээр хайх
            query = query.or(
                `contract_number.ilike.%${search}%,` +
                `customer_name.ilike.%${search}%,` +
                `customer_first_name.ilike.%${search}%,` +
                `customer_last_name.ilike.%${search}%,` +
                `customer_phone.ilike.%${search}%,` +
                `customer_registration.ilike.%${search}%`
            );
        }

        query = query.order(sortBy, { ascending: sortOrder, nullsFirst: false });

        const { data: contracts, error } = await query;
        if (error) throw error;

        // Статистик
        const stats = computeStats(contracts || []);

        return NextResponse.json({ contracts: contracts || [], stats });
    } catch (error) {
        logger.error('[Contracts API] GET error:', { error });
        return NextResponse.json(
            { error: 'Гэрээ татахад алдаа гарлаа', contracts: [], stats: emptyStats() },
            { status: 500 }
        );
    }
}

// ============================================
// POST /api/dashboard/contracts
// Excel-ээс импорт хийх
// ============================================
export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'Файл оруулна уу' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await importContracts(authShop.id, buffer);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } catch (error) {
        logger.error('[Contracts API] POST error:', { error });
        return NextResponse.json(
            { error: 'Импорт хийхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}

// ============================================
// HELPERS
// ============================================

interface ImportRow {
    shop_id: string;
    product_type: string;
    block_name: string | null;
    building_number: string | null;
    floor: string | null;
    unit_number: string | null;
    legacy_unit_number: string | null;
    unit_label: string | null;
    unit_type: string | null;
    model: string | null;
    rooms: number | null;
    contracted_area: number | null;
    first_price: number | null;
    price_per_sqm: number | null;
    total_price: number | null;
    prepayment_condition: string | null;
    prepayment_percent: number | null;
    prepayment_due: number | null;
    prepayment_paid: number | null;
    prepayment_paid_cash: number | null;
    prepayment_paid_barter: number | null;
    paid_amount: number | null;
    paid_percent: number | null;
    balance: number | null;
    overdue_days: number | null;
    contract_number: string | null;
    contract_date: string | null;
    contract_status: 'active' | 'closed' | 'cancelled';
    sales_channel: string | null;
    sales_manager: string | null;
    customer_name: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    customer_registration: string | null;
    customer_phone: string | null;
}

function getCell(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
        }
    }
    return '';
}

function toNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
    const raw = getCell(row, ...keys);
    if (!raw) return null;
    // Хувь дотор % тэмдэг, мөнгөн дүн дотор таслал/₮ байж болно
    const cleaned = raw.replace(/[,₮%\s]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
}

function toDate(row: Record<string, unknown>, ...keys: string[]): string | null {
    for (const key of keys) {
        const val = row[key];
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        if (typeof val === 'number') {
            // Excel serial date
            const epoch = new Date(Date.UTC(1899, 11, 30));
            const d = new Date(epoch.getTime() + val * 86400000);
            return d.toISOString().slice(0, 10);
        }
        if (typeof val === 'string' && val.trim()) {
            const parsed = new Date(val);
            if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        }
    }
    return null;
}

function parseRooms(raw: string): number | null {
    if (!raw) return null;
    const match = raw.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function parseContractStatus(raw: string): 'active' | 'closed' | 'cancelled' {
    const v = raw.toLowerCase();
    if (v.includes('хаагдсан') || v.includes('closed')) return 'closed';
    if (v.includes('цуцал') || v.includes('cancel')) return 'cancelled';
    return 'active';
}

async function importContracts(
    shopId: string,
    buffer: Buffer
): Promise<{ success: boolean; imported: number; errors: string[]; message: string }> {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
        return { success: false, imported: 0, errors: [], message: 'Excel файлд лист олдсонгүй' };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    if (rows.length === 0) {
        return { success: false, imported: 0, errors: [], message: 'Excel файл хоосон байна' };
    }

    const records: ImportRow[] = [];
    const errors: string[] = [];

    rows.forEach((row, idx) => {
        const rowNum = idx + 2;

        const contractNumber = getCell(row, 'Гэрээний дугаар', 'contract_number');
        if (!contractNumber) {
            errors.push(`Мөр ${rowNum}: Гэрээний дугаар хоосон`);
            return;
        }

        const firstName = getCell(row, 'Нэр', 'first_name');
        const lastName = getCell(row, 'Овог', 'last_name');
        const fullName = [lastName, firstName].filter(Boolean).join(' ');

        records.push({
            shop_id: shopId,
            product_type: 'residential',

            block_name: getCell(row, 'Блок', 'block') || null,
            building_number: getCell(row, 'Барилгын дугаар', 'building_number') || null,
            floor: getCell(row, 'Давхар', 'floor') || null,
            unit_number: getCell(row, 'Шинэ тоот', 'unit_number') || null,
            legacy_unit_number: getCell(row, 'Тоот', 'legacy_unit_number') || null,
            unit_label: getCell(row, 'Сууцны тэмдэглэгээ', 'unit_label') || null,
            unit_type: getCell(row, 'Айлын төрөл', 'unit_type') || null,
            model: getCell(row, 'Загвар', 'model') || null,
            rooms: parseRooms(getCell(row, 'Өрөөний тоо', 'rooms')),
            contracted_area: toNumber(row, 'Борлуулах талбай', 'contracted_area'),

            first_price: toNumber(row, '1-р үнэ', 'first_price'),
            price_per_sqm: toNumber(row, 'Үнэ /м²', 'price_per_sqm'),
            total_price: toNumber(row, 'Борлуулалтын орлогын дүн', 'total_price'),

            prepayment_condition: getCell(row, 'Урьдчилгааны нөхцөл', 'prepayment_condition') || null,
            prepayment_percent: toNumber(row, 'Урьдчилгаа %', 'prepayment_percent'),
            prepayment_due: toNumber(row, 'Төлөх урьд. Төлбөр', 'Төлөх урьд. төлбөр', 'prepayment_due'),
            prepayment_paid: toNumber(row, 'Төлөгдсөн урьд. Төлбөр', 'Төлөгдсөн урьд. төлбөр', 'prepayment_paid'),
            prepayment_paid_cash: toNumber(row, 'Төлөгдсөн урьд. төлбөр (бэлэн) 2 сар', 'prepayment_paid_cash'),
            prepayment_paid_barter: toNumber(row, 'Төлөгдсөн урьд. төлбөр (бартер)', 'prepayment_paid_barter'),

            paid_amount: toNumber(row, 'Төлөгдсөн урьд. төлбөр (нийт)', 'paid_amount'),
            paid_percent: toNumber(row, 'Төлсөн %', 'paid_percent'),
            balance: toNumber(row, 'Үлдэгдэл төлбөр', 'balance'),
            overdue_days: toNumber(row, 'Төлбөрийн хоцролт', 'overdue_days'),

            contract_number: contractNumber,
            contract_date: toDate(row, 'Гэрээ хийсэн огноо', 'contract_date'),
            contract_status: parseContractStatus(
                getCell(row, 'ГЭРЭЭ ХААГДСАН ЭСЭХ', 'Гэрээ хаагдсан эсэх', 'contract_status')
            ),

            sales_channel: getCell(row, 'Борлуулалтын төрөл', 'sales_channel') || null,
            sales_manager: getCell(row, 'Менежерын нэр', 'Менежерийн нэр', 'sales_manager') || null,

            customer_name: fullName || null,
            customer_first_name: firstName || null,
            customer_last_name: lastName || null,
            customer_registration: getCell(row, 'Регистрийн дугаар', 'registration') || null,
            customer_phone: getCell(row, 'Утасны дугаар', 'phone') || null,
        });
    });

    if (records.length === 0) {
        return {
            success: false,
            imported: 0,
            errors,
            message: 'Импорт хийх боломжтой мөр олдсонгүй',
        };
    }

    const supabase = supabaseAdmin();

    // Гэрээний дугаараар upsert хийх — давхардсан гэрээ дахин орвол шинэчилнэ
    const { error, count } = await supabase
        .from('property_contracts')
        .upsert(records, {
            onConflict: 'shop_id,contract_number',
            ignoreDuplicates: false,
            count: 'exact',
        });

    if (error) {
        // contract_number дээр UNIQUE байхгүй бол энгийн insert хийе
        logger.warn('[Contracts API] upsert failed, trying plain insert:', { error: error.message });
        const { data: inserted, error: insertErr } = await supabase
            .from('property_contracts')
            .insert(records)
            .select('id');

        if (insertErr) {
            return {
                success: false,
                imported: 0,
                errors: [...errors, insertErr.message],
                message: 'Импорт амжилтгүй: ' + insertErr.message,
            };
        }

        return {
            success: true,
            imported: inserted?.length || 0,
            errors,
            message: `${inserted?.length || 0} гэрээ амжилттай оруулсан${errors.length ? `, ${errors.length} алдаатай` : ''}`,
        };
    }

    return {
        success: true,
        imported: count ?? records.length,
        errors,
        message: `${count ?? records.length} гэрээ амжилттай оруулсан${errors.length ? `, ${errors.length} алдаатай` : ''}`,
    };
}

interface Stats {
    total: number;
    closed: number;
    active: number;
    total_sales: number;
    total_paid: number;
    total_balance: number;
    overdue_count: number;
}

function emptyStats(): Stats {
    return {
        total: 0,
        closed: 0,
        active: 0,
        total_sales: 0,
        total_paid: 0,
        total_balance: 0,
        overdue_count: 0,
    };
}

function computeStats(contracts: Array<Record<string, unknown>>): Stats {
    const stats = emptyStats();
    for (const c of contracts) {
        stats.total += 1;
        if (c.contract_status === 'closed') stats.closed += 1;
        else if (c.contract_status !== 'cancelled') stats.active += 1;

        stats.total_sales += Number(c.total_price) || 0;
        stats.total_paid += Number(c.paid_amount) || 0;
        stats.total_balance += Number(c.balance) || 0;
        if (Number(c.overdue_days) > 0) stats.overdue_count += 1;
    }
    return stats;
}
