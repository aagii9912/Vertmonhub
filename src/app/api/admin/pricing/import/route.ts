import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { withRoute } from '@/lib/api/route';
import { readWorkbookGrids, XlsxUnsupportedFormatError } from '@/lib/utils/xlsx';
import { PRICING_IMPORT_MAX_BYTES, parsePricingWorkbook } from '@/lib/sales/pricing-import';

/** Reads an approved price-list file into a preview. Writes nothing: rules go to the editor as a draft. */
export const POST = withRoute({ module: 'settings', access: 'write', error: 'Үнийн файл уншиж чадсангүй' }, async ({ request }) => {
    if (!await getAdminUser()) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Үнийн Excel файлаа сонгоно уу' }, { status: 400 });
    if (file.size > PRICING_IMPORT_MAX_BYTES) return NextResponse.json({ error: 'Файл 5 MB-аас их байна' }, { status: 400 });
    let grids;
    try { grids = await readWorkbookGrids(await file.arrayBuffer()); }
    catch (error) {
        if (error instanceof XlsxUnsupportedFormatError) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ error: 'Файлыг уншиж чадсангүй. .xlsx эсвэл .csv файл оруулна уу' }, { status: 400 });
    }
    return NextResponse.json(parsePricingWorkbook(file.name.slice(0, 200), grids), { headers: { 'Cache-Control': 'private, no-store' } });
});
