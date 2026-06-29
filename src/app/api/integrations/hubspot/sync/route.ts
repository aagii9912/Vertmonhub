import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchAllContacts, fetchContactsPage, verifyHubspotToken, HubspotApiError } from '@/lib/hubspot/client';

const MAX_CONTACTS = 5000;

function getToken(req: NextRequest, shopToken?: string | null): string | null {
    const headerToken = req.headers.get('x-hubspot-token');
    return (headerToken || shopToken || process.env.HUBSPOT_ACCESS_TOKEN || null);
}

function buildName(c: { properties: { firstname?: string; lastname?: string; email?: string } }): string {
    const fn = (c.properties.firstname || '').trim();
    const ln = (c.properties.lastname || '').trim();
    const combined = [fn, ln].filter(Boolean).join(' ').trim();
    if (combined) return combined;
    if (c.properties.email) return c.properties.email.split('@')[0];
    return 'Unnamed Contact';
}

function buildTags(c: { properties: { lifecyclestage?: string; hs_lead_status?: string } }): string[] {
    const tags: string[] = ['source:hubspot'];
    const lc = (c.properties.lifecyclestage || '').trim().toLowerCase();
    const ls = (c.properties.hs_lead_status || '').trim().toLowerCase();
    if (lc) tags.push(`lifecycle:${lc.replace(/\s+/g, '_')}`);
    if (ls) tags.push(`status:${ls.replace(/\s+/g, '_')}`);
    return tags;
}

function buildNotes(c: { properties: { company?: string; notes_last_contacted?: string; createdate?: string; address?: string; city?: string } }): string | null {
    const lines: string[] = [];
    if (c.properties.company) lines.push(`Company: ${c.properties.company}`);
    if (c.properties.address || c.properties.city) {
        lines.push(`Address: ${[c.properties.address, c.properties.city].filter(Boolean).join(', ')}`);
    }
    if (c.properties.notes_last_contacted) lines.push(`Last contacted: ${c.properties.notes_last_contacted}`);
    if (c.properties.createdate) lines.push(`[HubSpot created ${c.properties.createdate.slice(0, 10)}]`);
    return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * GET /api/integrations/hubspot/sync — preview (token validation + first 10 contacts)
 */
export async function GET(req: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { data: shop } = await supabase
            .from('shops')
            .select('hubspot_access_token')
            .eq('id', authShop.id)
            .single();

        const token = getToken(req, shop?.hubspot_access_token);
        if (!token) {
            return NextResponse.json({
                error: 'HubSpot token шаардлагатай. POST /api/integrations/hubspot/sync эсвэл `x-hubspot-token` header-ээр илгээнэ үү.',
                no_token: true,
            }, { status: 400 });
        }

        const verify = await verifyHubspotToken(token);
        if (!verify.ok) {
            return NextResponse.json({ error: verify.error || 'Token буруу' }, { status: 401 });
        }

        const page = await fetchContactsPage(token, { limit: 10 });
        return NextResponse.json({
            preview: true,
            sample: page.results.map(c => ({
                id: c.id,
                name: buildName(c),
                email: c.properties.email || null,
                phone: c.properties.phone || c.properties.mobilephone || null,
                lifecycle: c.properties.lifecyclestage || null,
                lead_status: c.properties.hs_lead_status || null,
            })),
            has_more: !!page.paging?.next,
        });
    } catch (error) {
        logger.error('[HubSpot Sync GET] error:', { error });
        const status = error instanceof HubspotApiError ? error.status : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Алдаа' }, { status });
    }
}

/**
 * POST /api/integrations/hubspot/sync
 *   body: { save_token?: string, max?: number }
 *   Headers: x-hubspot-token (optional)
 *
 * - If save_token is provided, persists it to shops.hubspot_access_token
 * - Pulls all contacts (capped at max or 5000) and upserts to customers
 */
export async function POST(req: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const saveToken = typeof body?.save_token === 'string' && body.save_token.trim() ? body.save_token.trim() : null;
        const max = Math.min(Number(body?.max) || MAX_CONTACTS, MAX_CONTACTS);

        const supabase = supabaseAdmin();

        // Persist token if provided
        if (saveToken) {
            await supabase
                .from('shops')
                .update({
                    hubspot_access_token: saveToken,
                    hubspot_connected_at: new Date().toISOString(),
                })
                .eq('id', authShop.id);
        }

        const { data: shop } = await supabase
            .from('shops')
            .select('hubspot_access_token')
            .eq('id', authShop.id)
            .single();

        const token = getToken(req, saveToken || shop?.hubspot_access_token);
        if (!token) {
            return NextResponse.json({ error: 'HubSpot token байхгүй' }, { status: 400 });
        }

        const verify = await verifyHubspotToken(token);
        if (!verify.ok) {
            return NextResponse.json({ error: verify.error || 'Token буруу' }, { status: 401 });
        }

        const contacts = await fetchAllContacts(token, max);

        let imported = 0;
        let skipped = 0;
        const errors: Array<{ name: string; reason: string }> = [];
        const CHUNK = 500;

        // Мөр бүрд SELECT хийхгүй (N+1). Dedup семантик хэвээр: email байвал
        // email-ээр, эс бөгөөс phone-оор давхардлыг шалгана.
        const prepared = contacts.map(c => ({
            email: c.properties.email || null,
            phone: c.properties.phone || c.properties.mobilephone || null,
            name: buildName(c),
            c,
        }));
        const emails = [...new Set(prepared.map(p => p.email).filter(Boolean))] as string[];
        const phones = [...new Set(prepared.filter(p => !p.email && p.phone).map(p => p.phone).filter(Boolean))] as string[];

        const existingEmails = new Set<string>();
        const existingPhones = new Set<string>();
        for (let i = 0; i < emails.length; i += CHUNK) {
            const { data } = await supabase.from('customers').select('email')
                .eq('shop_id', authShop.id).in('email', emails.slice(i, i + CHUNK));
            for (const r of data || []) if (r.email) existingEmails.add(r.email);
        }
        for (let i = 0; i < phones.length; i += CHUNK) {
            const { data } = await supabase.from('customers').select('phone')
                .eq('shop_id', authShop.id).in('phone', phones.slice(i, i + CHUNK));
            for (const r of data || []) if (r.phone) existingPhones.add(r.phone);
        }

        const seenEmails = new Set<string>();
        const seenPhones = new Set<string>();
        const toInsert: Array<Record<string, unknown>> = [];
        const insertNames: string[] = [];
        for (const p of prepared) {
            if (p.email) {
                if (existingEmails.has(p.email) || seenEmails.has(p.email)) { skipped++; continue; }
                seenEmails.add(p.email);
            } else if (p.phone) {
                if (existingPhones.has(p.phone) || seenPhones.has(p.phone)) { skipped++; continue; }
                seenPhones.add(p.phone);
            }
            toInsert.push({
                shop_id: authShop.id,
                name: p.name,
                email: p.email,
                phone: p.phone,
                notes: buildNotes(p.c),
                tags: buildTags(p.c),
            });
            insertNames.push(p.name);
        }

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

        logger.info('[HubSpot Sync] done', {
            shopId: authShop.id,
            total: contacts.length,
            imported,
            skipped,
            errors: errors.length,
        });

        return NextResponse.json({
            preview: false,
            total: contacts.length,
            imported,
            skipped,
            errors,
            token_saved: !!saveToken,
        });
    } catch (error) {
        logger.error('[HubSpot Sync POST] error:', { error });
        const status = error instanceof HubspotApiError ? error.status : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync алдаа' }, { status });
    }
}
