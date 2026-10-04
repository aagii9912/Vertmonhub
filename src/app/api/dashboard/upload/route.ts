import { NextResponse } from 'next/server';
import { assertShopAccess, getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { canReadPrivateAttachment, parsePrivateAttachmentUrl, privateAttachmentUrl, PRIVATE_ATTACHMENT_BUCKET } from '@/lib/ai/private-attachments';
import { ProjectScopeError } from '@/lib/sales/project-scope';
import { withRoute } from '@/lib/api/route';

/**
 * POST /api/dashboard/upload — AI туслахын хавсралт (зураг/PDF, ERP-ийн Excel/CSV/TSV) upload.
 *
 * 2026-09 review (H10/M19): өмнө нь MIME/хэмжээ шалгадаггүй, өргөтгөлийг файлын нэрээс
 * авдаг байсан тул public bucket дээр дурын HTML/SVG хадгалах боломжтой байв.
 * Одоо: зөвшөөрөгдсөн MIME л, ≤4MB (Vercel body хязгаар 4.5MB), өргөтгөл MIME-ээс.
 * Хүснэгтийн MIME-г браузер өөр өөрөөр (Windows дээр CSV = application/vnd.ms-excel) өгдөг тул
 * зөвхөн .xlsx/.csv/.tsv нэртэй файлын MIME-г стандарт утга руу хөрвүүлнэ; .xls хүлээн авахгүй.
 */
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    [XLSX]: 'xlsx',
    'text/csv': 'csv',
    'text/tab-separated-values': 'tsv',
};
const SHEET_TYPES: Record<string, string> = { xlsx: XLSX, csv: 'text/csv', tsv: 'text/tab-separated-values' };
const SHEET_ALIASES = new Set(['', 'application/octet-stream', 'application/vnd.ms-excel', 'text/plain', 'application/csv', 'text/x-csv']);
const MAX_BYTES = 4 * 1024 * 1024;

function uploadType(file: File): string {
    const ext = file.name.toLowerCase().match(/\.(xlsx|csv|tsv)$/)?.[1];
    if (ext && (file.type === SHEET_TYPES[ext] || SHEET_ALIASES.has(file.type))) return SHEET_TYPES[ext];
    return file.type;
}

export const POST = withRoute({ module: 'ai-assistant', access: 'write', error: 'Файл upload хийхэд алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'Файл олдсонгүй' }, { status: 400 });
    }
    const type = uploadType(file);
    const ext = ALLOWED[type];
    if (!ext) {
        return NextResponse.json({ error: 'Зөвшөөрөгдөөгүй файлын төрөл (зураг, PDF эсвэл .xlsx/.csv/.tsv байх ёстой)' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Файлын хэмжээ 4MB-аас хэтэрсэн байна' }, { status: 400 });
    }

    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const supabase = supabaseAdmin();
    const fileName = `${authShop.id}/${userId}/${crypto.randomUUID()}.${ext}`;

    // Upload to Supabase Storage using Admin client (bypasses RLS)
    const { error } = await supabase.storage
        .from(PRIVATE_ATTACHMENT_BUCKET)
        .upload(fileName, await file.arrayBuffer(), {
            contentType: type,
            upsert: false,
        });

    if (error) {
        logger.error('[Upload API] storage error:', { error });
        return NextResponse.json({ error: 'Файл хадгалахад алдаа гарлаа' }, { status: 500 });
    }

    return NextResponse.json({ url: privateAttachmentUrl(fileName) });
});

/** Stable links recheck identity, membership and entity module on every download. */
export async function GET(request: Request) {
    try {
        const access = await resolvePermissions();
        const userId = await getUserId();
        if (!access || !userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const url = new URL(request.url);
        const parsed = parsePrivateAttachmentUrl(`${url.pathname}${url.search}`);
        if (!parsed) return NextResponse.json({ error: 'Файлын хаяг буруу байна' }, { status: 400 });
        if (!await assertShopAccess(parsed.shopId)) return NextResponse.json({ error: 'Файл олдсонгүй' }, { status: 404 });
        const db = supabaseAdmin();
        if (!await canReadPrivateAttachment(db, privateAttachmentUrl(parsed.path), { shopId: parsed.shopId, userId, perms: { role: access.role, modules: access.permissions.modules } })) {
            return NextResponse.json({ error: 'Хавсралт харах эрх танд алга' }, { status: 403 });
        }
        const { data, error } = await db.storage.from(PRIVATE_ATTACHMENT_BUCKET).download(parsed.path);
        if (error || !data) return NextResponse.json({ error: 'Файл олдсонгүй' }, { status: 404 });
        if (!ALLOWED[data.type] || data.size > MAX_BYTES) return NextResponse.json({ error: 'Файлын төрөл эсвэл хэмжээ буруу байна' }, { status: 400 });
        return new Response(data, { headers: {
            'Content-Type': data.type,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        } });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        logger.error('[Upload API] download error:', { error });
        return NextResponse.json({ error: 'Файл татахад алдаа гарлаа' }, { status: 500 });
    }
}
