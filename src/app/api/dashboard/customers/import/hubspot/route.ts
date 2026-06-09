import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { parseHubspotContacts } from '@/lib/utils/file-parser';
import { normalizePhone } from '@/lib/utils/phone';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const PREVIEW_ROWS = 10;

export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const form = await request.formData();
        const file = form.get('file');
        const previewMode = form.get('preview') === 'true';

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'Файл хавсаргана уу' }, { status: 400 });
        }
        if (file.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: 'Файлын хэмжээ 10MB-аас хэтэрсэн' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const contacts = parseHubspotContacts(buffer);

        if (contacts.length === 0) {
            return NextResponse.json({
                error: 'Танигдсан мэдээлэл олдсонгүй. HubSpot Contacts CSV/XLSX гэдгийг шалгана уу.',
            }, { status: 400 });
        }

        if (previewMode) {
            return NextResponse.json({
                preview: true,
                total: contacts.length,
                sample: contacts.slice(0, PREVIEW_ROWS),
            });
        }

        // Confirm import
        const supabase = supabaseAdmin();
        let imported = 0;
        let skipped = 0;
        const errors: Array<{ name: string; reason: string }> = [];

        for (const c of contacts) {
            const phoneNormalized = normalizePhone(c.phone);

            // Dedup: и-мэйл эсвэл нормчилсон утсаар shop дотор давхардлыг шалгана
            if (c.email || phoneNormalized) {
                const orParts: string[] = [];
                if (c.email) orParts.push(`email.eq.${c.email}`);
                if (phoneNormalized) orParts.push(`phone_normalized.eq.${phoneNormalized}`);

                const { data: existing } = await supabase
                    .from('customers')
                    .select('id')
                    .eq('shop_id', authShop.id)
                    .or(orParts.join(','))
                    .maybeSingle();
                if (existing) {
                    skipped++;
                    continue;
                }
            }

            const { error: insertError } = await supabase
                .from('customers')
                .insert({
                    shop_id: authShop.id,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    phone_normalized: phoneNormalized,
                    notes: c.notes,
                    tags: c.tags,
                });

            if (insertError) {
                errors.push({ name: c.name, reason: insertError.message });
            } else {
                imported++;
            }
        }

        logger.info('[HubSpot Import] done', {
            shopId: authShop.id,
            imported,
            skipped,
            errors: errors.length,
        });

        return NextResponse.json({
            preview: false,
            imported,
            skipped,
            errors,
        });
    } catch (error) {
        logger.error('[HubSpot Import] error:', { error });
        return NextResponse.json({ error: 'Импорт амжилтгүй боллоо' }, { status: 500 });
    }
}
