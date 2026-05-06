import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(request: NextRequest) {
  try {
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const propertyId = (form.get('property_id') as string) || 'unassigned';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File шаардлагатай' }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'Зөвшөөрөгдөөгүй файлын төрөл' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Файлын хэмжээ 8MB-аас хэтэрсэн байна' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safePropertyId = String(propertyId).replace(/[^a-z0-9-]/gi, '');
    const uuid = crypto.randomUUID();
    const path = `${authShop.id}/${safePropertyId}/${uuid}.${ext}`;

    const supabase = supabaseAdmin();
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('property-images')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logger.error('[Properties Upload] storage error:', { error: uploadError });
      return NextResponse.json({ error: 'Зураг хадгалахад алдаа гарлаа' }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from('property-images')
      .getPublicUrl(path);

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path,
    });
  } catch (error) {
    logger.error('[Properties Upload] error:', { error });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
