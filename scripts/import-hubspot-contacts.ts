/**
 * Import HubSpot contacts → Vertmon Hub `customers` table.
 *
 * Usage:
 *   HUBSPOT_TOKEN=pat-... SHOP_ID=<uuid> npx tsx scripts/import-hubspot-contacts.ts
 *
 * If SHOP_ID omitted, picks the first shop in the DB (single-tenant assumption).
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const SHOP_ID = process.env.SHOP_ID;
const MAX = Number(process.env.MAX || 5000);

if (!HUBSPOT_TOKEN) {
    console.error('Set HUBSPOT_TOKEN env var');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HS = 'https://api.hubapi.com';
const PROPS = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'address', 'city', 'lifecyclestage', 'hs_lead_status', 'createdate'];

async function fetchPage(after?: string) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    for (const p of PROPS) params.append('properties', p);
    const res = await fetch(`${HS}/crm/v3/objects/contacts?${params}`, {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`HubSpot ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<{ results: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after: string } } }>;
}

async function fetchAll() {
    const all: Array<{ id: string; properties: Record<string, string | null> }> = [];
    let after: string | undefined;
    while (all.length < MAX) {
        const page = await fetchPage(after);
        all.push(...page.results);
        const next = page.paging?.next?.after;
        if (!next) break;
        after = next;
        process.stdout.write(`\rFetched ${all.length}…`);
    }
    process.stdout.write('\n');
    return all.slice(0, MAX);
}

function buildName(p: Record<string, string | null>): string {
    const fn = (p.firstname || '').trim();
    const ln = (p.lastname || '').trim();
    const combined = [fn, ln].filter(Boolean).join(' ').trim();
    if (combined) return combined;
    if (p.email) return p.email.split('@')[0];
    return 'Unnamed Contact';
}

function buildTags(p: Record<string, string | null>): string[] {
    const tags = ['source:hubspot'];
    if (p.lifecyclestage) tags.push(`lifecycle:${p.lifecyclestage.toLowerCase().replace(/\s+/g, '_')}`);
    if (p.hs_lead_status) tags.push(`status:${p.hs_lead_status.toLowerCase().replace(/\s+/g, '_')}`);
    return tags;
}

function buildNotes(p: Record<string, string | null>): string | null {
    const lines: string[] = [];
    if (p.company) lines.push(`Company: ${p.company}`);
    if (p.address || p.city) lines.push(`Address: ${[p.address, p.city].filter(Boolean).join(', ')}`);
    if (p.createdate) lines.push(`[HubSpot created ${p.createdate.slice(0, 10)}]`);
    return lines.length ? lines.join('\n') : null;
}

async function main() {
    let shopId = SHOP_ID;
    if (!shopId) {
        const { data: shops } = await supabase.from('shops').select('id, name').limit(5);
        if (!shops?.length) {
            console.error('No shops found. Set SHOP_ID=<uuid>');
            process.exit(1);
        }
        if (shops.length > 1) {
            console.log('Multiple shops found. Pick one and set SHOP_ID=<uuid>:');
            shops.forEach(s => console.log(`  ${s.id}  —  ${s.name}`));
            process.exit(1);
        }
        shopId = shops[0].id;
        console.log(`Using single shop: ${shops[0].name} (${shopId})`);
    }

    console.log('Fetching from HubSpot…');
    const contacts = await fetchAll();
    console.log(`Total contacts: ${contacts.length}`);

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ name: string; reason: string }> = [];

    for (const c of contacts) {
        const email = c.properties.email || null;
        const phone = c.properties.phone || c.properties.mobilephone || null;
        const name = buildName(c.properties);

        // Dedupe by email then phone
        if (email) {
            const { data: ex } = await supabase
                .from('customers')
                .select('id')
                .eq('shop_id', shopId)
                .eq('email', email)
                .maybeSingle();
            if (ex) { skipped++; continue; }
        } else if (phone) {
            const { data: ex } = await supabase
                .from('customers')
                .select('id')
                .eq('shop_id', shopId)
                .eq('phone', phone)
                .maybeSingle();
            if (ex) { skipped++; continue; }
        }

        const { error } = await supabase
            .from('customers')
            .insert({
                shop_id: shopId,
                name,
                email,
                phone,
                notes: buildNotes(c.properties),
                tags: buildTags(c.properties),
            });

        if (error) {
            errors.push({ name, reason: error.message });
        } else {
            imported++;
        }

        if ((imported + skipped) % 50 === 0) {
            process.stdout.write(`\rProcessed ${imported + skipped}/${contacts.length} (imported ${imported}, skipped ${skipped})…`);
        }
    }

    process.stdout.write('\n');
    console.log('───────────────────────────────────');
    console.log(`Total fetched : ${contacts.length}`);
    console.log(`Imported       : ${imported}`);
    console.log(`Skipped (dupe) : ${skipped}`);
    console.log(`Errors         : ${errors.length}`);
    if (errors.length) {
        console.log('\nFirst errors:');
        errors.slice(0, 5).forEach(e => console.log(`  - ${e.name}: ${e.reason}`));
    }
}

main().catch(err => { console.error(err); process.exit(1); });
