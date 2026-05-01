import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

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

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: `Файлын хэмжээ хэтэрсэн (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)` },
                { status: 413 }
            );
        }

        const fileExt = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_MIME.has(file.type) || !ALLOWED_EXT.has(fileExt)) {
            return NextResponse.json(
                { error: 'Зөвхөн зураг (jpg/png/webp/gif) хүлээн авна' },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();
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
