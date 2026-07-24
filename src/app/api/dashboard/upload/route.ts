import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Зөвшөөрөгдөх төрлүүд. Bucket нь нийтэд нээлттэй тул HTML/SVG зэрэг
 * хөтөч дээр гүйцэтгэгдэх төрлийг ЗОРИУДААР оруулаагүй (XSS-ээс сэргийлнэ).
 */
const ALLOWED_MIME = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv', 'text/plain',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
    try {
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (!ALLOWED_MIME.has(file.type)) {
            return NextResponse.json({ error: 'Зөвшөөрөгдөөгүй файлын төрөл' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Файлын хэмжээ 10MB-аас хэтэрсэн байна' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const fileName = `${authShop.id}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

        // Upload to Supabase Storage using Admin client (bypasses RLS)
        const { error } = await supabase.storage
            .from('products')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (error) {
            console.error('Supabase storage error:', error);
            throw error;
        }

        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('products')
            .getPublicUrl(fileName);

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error('Upload API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
