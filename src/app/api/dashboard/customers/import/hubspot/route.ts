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
        const CHUNK = 500;

        // Мөр бүрд SELECT хийхгүй (N+1) — бүх и-мэйл/утсыг урьдчилан нормчилж,
        // байгаа хэрэглэгчдийг chunk-аар .in()-ээр татаж Set болгоно.
        const prepared = contacts.map(c => ({ ...c, phoneNormalized: normalizePhone(c.phone) }));
        const emails = [...new Set(prepared.map(c => c.email).filter(Boolean))] as string[];
        const phones = [...new Set(prepared.map(c => c.phoneNormalized).filter(Boolean))] as string[];

        const existingEmails = new Set<string>();
        const existingPhones = new Set<string>();
        for (let i = 0; i < emails.length; i += CHUNK) {
            const { data } = await supabase.from('customers').select('email')
                .eq('shop_id', authShop.id).in('email', emails.slice(i, i + CHUNK));
            for (const r of data || []) if (r.email) existingEmails.add(r.email);
        }
        for (let i = 0; i < phones.length; i += CHUNK) {
            const { data } = await supabase.from('customers').select('phone_normalized')
                .eq('shop_id', authShop.id).in('phone_normalized', phones.slice(i, i + CHUNK));
            for (const r of data || []) if (r.phone_normalized) existingPhones.add(r.phone_normalized);
        }

        // DB-д байгаа + файл доторх давхардлыг шүүнэ (анхны семантик хэвээр).
        const seenEmails = new Set<string>();
        const seenPhones = new Set<string>();
        const toInsert: Array<Record<string, unknown>> = [];
        const insertNames: string[] = [];
        for (const c of prepared) {
            if (c.email || c.phoneNormalized) {
                const dupDb = (c.email && existingEmails.has(c.email)) || (c.phoneNormalized && existingPhones.has(c.phoneNormalized));
                const dupFile = (c.email && seenEmails.has(c.email)) || (c.phoneNormalized && seenPhones.has(c.phoneNormalized));
                if (dupDb || dupFile) { skipped++; continue; }
                if (c.email) seenEmails.add(c.email);
                if (c.phoneNormalized) seenPhones.add(c.phoneNormalized);
            }
            toInsert.push({
                shop_id: authShop.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                phone_normalized: c.phoneNormalized,
                notes: c.notes,
                tags: c.tags,
            });
            insertNames.push(c.name);
        }

        // Chunk-аар bulk insert; chunk алдаа гарвал мөр-мөрөөр fallback (алдааны
        // нарийвчлал хадгалагдана).
        for (let i = 0; i < toInsert.length; i += CHUNK) {
            const chunk = toInsert.slice(i, i + CHUNK);
            const { error: bulkError } = await supabase.from('customers').insert(chunk);
            if (!bulkError) { imported += chunk.length; continue; }
            for (let j = 0; j < chunk.length; j++) {
                const { error: rowError } = await supabase.from('customers').insert(chunk[j]);
                if (rowError) errors.push({ name: insertNames[i + j], reason: rowError.message });
                else imported++;
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
