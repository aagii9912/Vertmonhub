import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/dashboard/upload — AI туслахын хавсралт (зураг/PDF) upload.
 *
 * 2026-09 review (H10/M19): өмнө нь MIME/хэмжээ шалгадаггүй, өргөтгөлийг файлын нэрээс
 * авдаг байсан тул public bucket дээр дурын HTML/SVG хадгалах боломжтой байв.
 * Одоо: зөвшөөрөгдсөн MIME л, ≤4MB (Vercel body хязгаар 4.5MB), өргөтгөл MIME-ээс.
 */
const ALLOWED: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
};
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'Файл олдсонгүй' }, { status: 400 });
        }
        const ext = ALLOWED[file.type];
        if (!ext) {
            return NextResponse.json({ error: 'Зөвшөөрөгдөөгүй файлын төрөл (зураг эсвэл PDF байх ёстой)' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Файлын хэмжээ 4MB-аас хэтэрсэн байна' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const fileName = `${authShop.id}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

        // Upload to Supabase Storage using Admin client (bypasses RLS)
        const { error } = await supabase.storage
            .from('products')
            .upload(fileName, await file.arrayBuffer(), {
                contentType: file.type,
                upsert: false,
            });

        if (error) {
            logger.error('[Upload API] storage error:', { error });
            return NextResponse.json({ error: 'Файл хадгалахад алдаа гарлаа' }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase.storage
            .from('products')
            .getPublicUrl(fileName);

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        logger.error('[Upload API] error:', { error });
        return NextResponse.json({ error: 'Файл upload хийхэд алдаа гарлаа' }, { status: 500 });
    }
}
