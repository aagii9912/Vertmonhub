/**
 * Elysium-ийн өмнөх лидэд landing page-ийг тэмдэглэлээс («Сайтын эх сурвалж: …», «Арга хэмжээ: …») нөхнө.
 * Хуудасны одоогийн нэр, хаяг, зориулалтыг Elysium-ийн `events`-ээс уншина (зөвхөн SELECT;
 * ELYSIUM_SUPABASE_URL + ELYSIUM_SUPABASE_SERVICE_KEY). Өмнө нь линкийн UTM хадгалагдаагүй тул эх үүсвэр
 * «Вэбсайт» хэвээр лидийг зөвхөн хуудасны зориулалт (Эвент, Сошиал зар) байвал түүгээр солино
 * (`landingLeadSource`, шинэ лидтэй ижил дүрэм). Үндсэн сайтын лид «Вэбсайт» хэвээр.
 *
 *   PROJECT_ID=<uuid> npx tsx scripts/backfill-elysium-landing-pages.ts            # урьдчилсан шалгалт (бичихгүй)
 *   PROJECT_ID=<uuid> npx tsx scripts/backfill-elysium-landing-pages.ts --apply    # бичнэ
 *
 * Зөвхөн landing_page хоосон лидийг шинэчилнэ (дахин ажиллуулахад өөрчлөлтгүй). Эх үүсвэр солигдсон лид
 * бүрт timeline-д тэмдэглэл, `admin_audit_log`-д `leads.landing_page_backfill`. ELYSIUM_SITE_URL — хуудасны
 * хаягийн суурь (анхдагч https://elysium.mn).
 */

import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { elysiumLandingPage, elysiumNotesSubmission } from '../src/lib/leads/elysium';
import { isLandingPurpose, landingLeadSource, type LandingPurpose } from '../src/lib/leads/landing-attribution';
import { sourceLabel } from '../src/lib/leads/labels';
import { fetchAllRows } from '../src/lib/utils/pagination';

const usage = 'PROJECT_ID=<uuid> npx tsx scripts/backfill-elysium-landing-pages.ts [--apply]';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 200;

interface LeadRow { id: string; shop_id: string; source: string | null; notes: string | null }
interface PagePatch {
    landing_page: string;
    landing_page_name: string;
    landing_page_url: string | null;
    landing_page_purpose: LandingPurpose | null;
    source?: string;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error(`Ашиглах команд: ${usage}`);
    const apply = args.includes('--apply');

    dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
    const projectId = process.env.PROJECT_ID;
    if (!projectId || !uuid.test(projectId)) throw new Error('PROJECT_ID UUID утгыг ил тод тохируулна уу');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL болон service-role тохиргоо шаардлагатай');
    const elysiumUrl = process.env.ELYSIUM_SUPABASE_URL?.trim();
    const elysiumKey = process.env.ELYSIUM_SUPABASE_SERVICE_KEY?.trim();
    if (!elysiumUrl || !elysiumKey) throw new Error('ELYSIUM_SUPABASE_URL, ELYSIUM_SUPABASE_SERVICE_KEY шаардлагатай (хуудасны нэр, зориулалт)');
    const siteUrl = (process.env.ELYSIUM_SITE_URL?.trim() || 'https://elysium.mn').replace(/\/+$/, '');
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const db = createClient(supabaseUrl, serviceKey, options);
    const elysium = createClient(elysiumUrl, elysiumKey, options);

    const { data: events, error: eventsError } = await elysium.from('events').select('slug, name, purpose:content->>purpose');
    if (eventsError) throw new Error(`Elysium-ийн хуудсуудыг уншиж чадсангүй: ${eventsError.message}`);
    const pages = new Map((events ?? []).map(event => [`event/${event.slug}`, event as { slug: string; name: string; purpose: string | null }]));

    const leads = await fetchAllRows<LeadRow>((from, to) => db.from('leads')
        .select('id, shop_id, source, notes').eq('project_id', projectId).is('deleted_at', null).is('landing_page', null)
        .ilike('notes', '%Сайтын эх сурвалж:%').order('created_at').order('id').range(from, to));

    const plan = new Map<string, { patch: PagePatch; ids: string[]; from: Record<string, number> }>();
    let unrecognised = 0;
    for (const lead of leads) {
        const submission = elysiumNotesSubmission(lead.notes);
        const page = elysiumLandingPage(submission.source, submission.event);
        if (!page) { unrecognised++; continue; }
        const live = pages.get(page.key);
        const purpose = live && isLandingPurpose(live.purpose) ? live.purpose : null;
        const patch: PagePatch = {
            landing_page: page.key,
            landing_page_name: live?.name ?? page.name,
            landing_page_url: page.key === 'site' ? `${siteUrl}/` : live ? `${siteUrl}/${live.slug}` : null,
            landing_page_purpose: purpose,
        };
        const channel = landingLeadSource({ landing_page_purpose: purpose });
        if (lead.source === 'website' && channel.basis === 'page') patch.source = channel.source;
        const key = JSON.stringify(patch);
        const entry = plan.get(key) ?? { patch, ids: [], from: {} };
        entry.ids.push(lead.id);
        entry.from[lead.source ?? '—'] = (entry.from[lead.source ?? '—'] ?? 0) + 1;
        plan.set(key, entry);
    }
    const summary = {
        mode: apply ? 'apply' : 'dry-run', candidates: leads.length, unrecognised,
        plan: [...plan.values()].map(({ patch, ids, from }) => ({
            ...patch, leads: ids.length, current_sources: from,
            ...(patch.source ? { source_change: `Вэбсайт → ${sourceLabel(patch.source)}` } : {}),
        })),
    };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    let updated = 0;
    let sourceChanged = 0;
    for (const { patch, ids } of plan.values()) {
        for (let offset = 0; offset < ids.length; offset += BATCH) {
            let query = db.from('leads').update(patch).eq('project_id', projectId).in('id', ids.slice(offset, offset + BATCH))
                .is('landing_page', null);
            if (patch.source) query = query.eq('source', 'website');
            const { data, error } = await query.select('id, shop_id');
            if (error) throw new Error(`Лид шинэчилж чадсангүй (${patch.landing_page}): ${error.message}`);
            const rows = (data ?? []) as Array<{ id: string; shop_id: string }>;
            updated += rows.length;
            if (!patch.source || !rows.length) continue;
            sourceChanged += rows.length;
            const { error: activityError } = await db.from('lead_activities').insert(rows.map(row => ({
                shop_id: row.shop_id, lead_id: row.id, type: 'system',
                content: `Эх үүсвэр: Вэбсайт → ${sourceLabel(patch.source)} (landing page «${patch.landing_page_name}»-ийн зориулалтаар)`,
                meta: { action: 'landing_page_backfill', landing_page: patch.landing_page, from: 'website', to: patch.source },
            })));
            if (activityError) console.error(`Timeline бичигдсэнгүй (${patch.landing_page}): ${activityError.message}`);
        }
    }
    const { error: auditError } = await db.from('admin_audit_log').insert({
        actor_id: null, action: 'leads.landing_page_backfill', target_id: projectId, meta: { updated, source_changed: sourceChanged, unrecognised },
    });
    console.log(JSON.stringify({ ...summary, updated, source_changed: sourceChanged,
        ...(auditError ? { warning: `Audit бичигдсэнгүй: ${auditError.message}` } : {}) }, null, 2));
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Нөхөлтийн тодорхойгүй алдаа');
    process.exitCode = 1;
});
