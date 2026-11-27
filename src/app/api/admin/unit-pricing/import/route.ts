import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin/auth';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { readWorkbookGrids, XlsxUnsupportedFormatError } from '@/lib/utils/xlsx';
import { PRICING_IMPORT_MAX_BYTES } from '@/lib/sales/pricing-import';
import { UNIT_PRICE_CATEGORIES } from '@/lib/sales/unit-pricing';
import { matchUnitPriceRows, parseUnitPriceWorkbook } from '@/lib/sales/unit-pricing-import';
import { loadRegisterUnits } from '@/lib/sales/unit-pricing-store';

/**
 * Reads an approved per-unit price file into a preview and checks its codes against the unit register.
 * Writes nothing: the admin reviews the preview and saves it as a draft.
 */
export const POST = withRoute({ module: 'settings', access: 'write', error: 'Үнийн файл уншиж чадсангүй' }, async ({ request, shop }) => {
    if (!await getAdminUser()) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const category = z.enum(UNIT_PRICE_CATEGORIES).safeParse(form?.get('category'));
    if (!category.success) return NextResponse.json({ error: 'Төрлөө сонгоно уу' }, { status: 400 });
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Үнийн Excel файлаа сонгоно уу' }, { status: 400 });
    if (file.size > PRICING_IMPORT_MAX_BYTES) return NextResponse.json({ error: 'Файл 5 MB-аас их байна' }, { status: 400 });
    let grids;
    try { grids = await readWorkbookGrids(await file.arrayBuffer()); }
    catch (error) {
        if (error instanceof XlsxUnsupportedFormatError) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ error: 'Файлыг уншиж чадсангүй. .xlsx эсвэл .csv файл оруулна уу' }, { status: 400 });
    }
    const parsed = parseUnitPriceWorkbook(file.name.slice(0, 200), grids);
    const register = parsed.sheets.length ? await loadRegisterUnits(supabaseAdmin(), shop.id, category.data) : [];
    return NextResponse.json({
        ...parsed,
        sheets: parsed.sheets.map(sheet => ({ ...sheet, ...matchUnitPriceRows(sheet.rows, register) })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
});
