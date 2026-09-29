import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { getUserShop, getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { NewsletterActionSchema, newsletterHtml } from '@/lib/marketing/newsletter';

export const maxDuration = 60;
const noCache = { 'Cache-Control': 'no-store' };
const dbError = () => NextResponse.json({ error: 'Newsletter хадгалалт амжилтгүй. Migration болон холболтыг шалгана уу.' }, { status: 503 });
const configuration = (settings: { from_email?: string; from_name?: string } | null) => ({ key: process.env.RESEND_API_KEY?.trim(), from: settings?.from_email && settings?.from_name ? `${settings.from_name} <${settings.from_email}>` : undefined });
function provider<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error || !result.data) throw new Error(`Resend: ${result.error?.message || 'Хариу ирсэнгүй'}`);
    return result.data;
}

export async function GET(req: NextRequest) {
    const denied = await requireModule('marketing-roi'); if (denied) return denied;
    const shop = await getUserShop(); if (!shop) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    const db = supabaseAdmin();
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) {
        const projects = await db.from('projects').select('id,name').eq('shop_id',shop.id).order('name');
        if (projects.error) return dbError();
        return NextResponse.json({ projects: projects.data }, { headers: noCache });
    }
    if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Төсөл сонгоно уу' }, { status: 400 });
    const project = await db.from('projects').select('id').eq('shop_id',shop.id).eq('id', projectId).maybeSingle();
    if (project.error) return dbError();
    if (!project.data) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    const settings = await db.from('newsletter_project_settings').select('segment_id,from_email,from_name').eq('shop_id', shop.id).eq('project_id', projectId).maybeSingle();
    if (settings.error) return dbError();
    const { key, from } = configuration(settings.data);
    if (req.nextUrl.searchParams.get('contacts') === '1') {
        if (!settings.data?.segment_id) return NextResponse.json({ data: [], has_more: false }, { headers: noCache });
        if (!key) return NextResponse.json({ error: 'Resend холболт тохируулаагүй' }, { status: 503 });
        const after = req.nextUrl.searchParams.get('after');
        if (after && !z.string().uuid().safeParse(after).success) return NextResponse.json({ error: 'Хуудасны ID буруу' }, { status: 400 });
        try { return NextResponse.json(provider(await new Resend(key).contacts.list({ segmentId: settings.data.segment_id, limit: 100, ...(after ? { after } : {}) })), { headers: noCache }); }
        catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Resend алдаа' }, { status: 502 }); }
    }
    const page = Math.max(0, Math.min(10000, Number(req.nextUrl.searchParams.get('page')) || 0));
    const result = await db.from('newsletters').select('*', { count: 'exact' }).eq('shop_id', shop.id).eq('project_id', projectId).order('created_at', { ascending: false }).order('id').range(page * 25, page * 25 + 24);
    if (result.error) return dbError();
    return NextResponse.json({ newsletters: result.data, total: result.count, connected: !!settings.data?.segment_id, configured: !!key && !!from, from: from ?? null, sender: settings.data ? { fromEmail: settings.data.from_email, fromName: settings.data.from_name } : null }, { headers: noCache });
}

export async function POST(req: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi'); if (denied) return denied;
    const shop = await getUserShop(); const userId = await getUserId();
    if (!shop || !userId) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    let input: z.infer<typeof NewsletterActionSchema>;
    let projectId: string;
    try { const raw = await req.json(); input = NewsletterActionSchema.parse(raw); projectId = z.string().uuid().parse(raw.projectId); }
    catch { return NextResponse.json({ error: 'Мэдээллээ шалгана уу. Захиалагч нэмэхэд зөвшөөрөл шаардлагатай.' }, { status: 400 }); }
    const db = supabaseAdmin();
    const project = await db.from('projects').select('id').eq('shop_id',shop.id).eq('id', projectId).maybeSingle();
    if (project.error) return dbError();
    if (!project.data) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    if (input.action === 'configure') {
        const result = await db.from('newsletter_project_settings').upsert({ project_id: projectId, shop_id: shop.id, from_email: input.fromEmail, from_name: input.fromName }, { onConflict: 'project_id' });
        return result.error ? dbError() : NextResponse.json({ saved: true });
    }
    if (input.action === 'save') {
        const old = await db.from('newsletters').select('id,status,broadcast_id').eq('shop_id', shop.id).eq('project_id', projectId).eq('id', input.id).maybeSingle();
        if (old.error) return dbError();
        if (old.data && (old.data.status !== 'draft' || old.data.broadcast_id)) return NextResponse.json({ error: 'Resend-д бэлтгэсэн хувилбарыг өөрчлөхгүй. Шинэ ноорог үүсгэнэ үү.' }, { status: 409 });
        const values = { subject: input.subject, body: input.body, ...(input.design !== undefined ? { design: input.design } : {}) };
        const result = old.data
            ? await db.from('newsletters').update(values).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', input.id).eq('status', 'draft').is('broadcast_id', null).select('id').maybeSingle()
            : await db.from('newsletters').insert({ ...values, id: input.id, shop_id: shop.id, project_id: projectId, created_by: userId }).select('id').single();
        if (result.error) return dbError();
        if (!result.data) return NextResponse.json({ error: 'Ноорог өөрчлөгдсөн. Дахин уншина уу.' }, { status: 409 });
        return NextResponse.json(result.data);
    }
    const settings = await db.from('newsletter_project_settings').select('segment_id,from_email,from_name').eq('shop_id', shop.id).eq('project_id', projectId).maybeSingle();
    if (settings.error) return dbError();
    const { key, from } = configuration(settings.data);
    if (!key || !from) return NextResponse.json({ error: 'Төслийн илгээгч болон Resend холболтыг тохируулна уу.' }, { status: 503 });
    const resend = new Resend(key);
    try {
        if (input.action === 'setup') {
            if (settings.data?.segment_id) return NextResponse.json({ connected: true });
            const segment = provider(await resend.segments.create({ name: `Vertmon ${projectId}` }));
            const saved = await db.from('newsletter_project_settings').update({ segment_id: segment.id }).eq('shop_id', shop.id).eq('project_id', projectId).is('segment_id', null);
            if (saved.error) return dbError();
            return NextResponse.json({ connected: true });
        }
        if (!settings.data?.segment_id) return NextResponse.json({ error: 'Эхлээд Newsletter холболтыг үүсгэнэ үү' }, { status: 409 });
        const segmentId = settings.data.segment_id;
        if (input.action === 'subscribe') {
            const existing = await resend.contacts.get(input.email);
            if (existing.error && existing.error.name !== 'not_found') provider(existing);
            if (existing.data?.unsubscribed) return NextResponse.json({ error: 'Энэ хаяг newsletter-ээс татгалзсан байна. Дахин идэвхжүүлэхгүй.' }, { status: 409 });
            const contact = existing.data ?? provider(await resend.contacts.create({ email: input.email }));
            provider(await resend.contacts.segments.add({ contactId: contact.id, segmentId }));
            return NextResponse.json({ id: contact.id });
        }
        if (input.action === 'remove') {
            // Only remove this shop's segment membership. Never alter global subscription preferences.
            provider(await resend.contacts.segments.remove({ contactId: input.contactId, segmentId }));
            return NextResponse.json({ removed: true });
        }
        const stored = await db.from('newsletters').select('*').eq('shop_id', shop.id).eq('project_id', projectId).eq('id', input.id).maybeSingle();
        if (stored.error) return dbError();
        if (!stored.data) return NextResponse.json({ error: 'Newsletter олдсонгүй' }, { status: 404 });
        const newsletter = stored.data;
        const html = newsletterHtml(newsletter.subject, newsletter.body, newsletter.design);
        const updateStatus = async (status: string) => {
            const result = await db.from('newsletters').update({ status }).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', newsletter.id);
            if (result.error) throw new Error('Төлөв хадгалж чадсангүй. Resend төлөвийг шалгана уу.');
        };
        if (input.action === 'prepare') {
            if (newsletter.broadcast_id) return NextResponse.json({ prepared: true });
            let preparing = db.from('newsletters').update({ status: 'preparing' }).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', newsletter.id).eq('status', 'draft').eq('subject', newsletter.subject).eq('body', newsletter.body);
            preparing = newsletter.design ? preparing.eq('design', JSON.stringify(newsletter.design)) : preparing.is('design', null);
            const lock = await preparing.select('id').maybeSingle();
            if (lock.error) return dbError();
            if (!lock.data) return NextResponse.json({ error: 'Бэлтгэж байна. Төлөвийг шинэчилнэ үү.' }, { status: 409 });
            try {
                const draft = provider(await resend.broadcasts.create({ segmentId, from, subject: newsletter.subject, name: `Vertmon ${newsletter.id}`, html }));
                const saved = await db.from('newsletters').update({ broadcast_id: draft.id, status: 'draft' }).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', newsletter.id);
                if (saved.error) throw new Error('Resend ноорог үүссэн боловч холбоос хадгалагдсангүй. Имэйл илгээгээгүй. Дахин бэлтгэнэ үү.');
                return NextResponse.json({ prepared: true });
            } catch (e) { await updateStatus('draft'); throw e; }
        }
        if (!newsletter.broadcast_id) {
            // A crashed prepare can only have created an unsent draft, never sent mail.
            if (input.action === 'refresh' && newsletter.status === 'preparing') {
                return NextResponse.json({ error: 'Бэлтгэл дуусаагүй. Resend дээрх нооргийг шалгаж, шинэ ноорог үүсгэнэ үү.' }, { status: 409 });
            }
            return NextResponse.json({ error: 'Эхлээд Resend ноорог бэлтгэнэ үү' }, { status: 409 });
        }
        const remote = provider(await resend.broadcasts.get(newsletter.broadcast_id));
        if ((remote.segment_id ?? remote.audience_id) !== segmentId) return NextResponse.json({ error: 'Resend хүлээн авагчийн бүлэг зөрсөн байна' }, { status: 409 });
        if (input.action === 'refresh') {
            // A remote draft cannot prove an in-flight/unknown send did not get accepted.
            if (remote.status !== 'draft') await updateStatus(remote.status === 'sent' ? 'sent' : 'queued');
            return NextResponse.json({ status: remote.status === 'draft' ? newsletter.status : remote.status });
        }
        if (remote.status !== 'draft') { await updateStatus(remote.status === 'sent' ? 'sent' : 'queued'); return NextResponse.json({ status: remote.status }); }
        if (remote.from !== from || remote.subject !== newsletter.subject || remote.html !== html) return NextResponse.json({ error: 'Resend дээрх илгээгч эсвэл агуулга өөрчлөгдсөн. Шинэ ноорог үүсгэнэ үү.' }, { status: 409 });
        const lock = await db.from('newsletters').update({ status: 'sending' }).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', newsletter.id).eq('status', 'draft').select('id').maybeSingle();
        if (lock.error) return dbError();
        if (!lock.data) return NextResponse.json({ error: 'Илгээх хүсэлт өмнө нь эхэлсэн. Төлөвийг шалгана уу.' }, { status: 409 });
        try {
            const result = await resend.broadcasts.send(newsletter.broadcast_id);
            if (result.error) {
                // A definite 4xx rejection is retryable; network/5xx outcomes are ambiguous.
                const rejected = !!result.error.statusCode && result.error.statusCode >= 400 && result.error.statusCode < 500;
                await updateStatus(rejected ? 'draft' : 'unknown');
                provider(result);
            }
            provider(result);
            await updateStatus('queued');
            return NextResponse.json({ status: 'queued' });
        } catch (e) {
            await db.from('newsletters').update({ status: 'unknown' }).eq('shop_id', shop.id).eq('project_id', projectId).eq('id', newsletter.id).eq('status', 'sending');
            throw e;
        }
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Resend хүсэлт амжилтгүй. Төлөвийг шалгана уу.' }, { status: 502 }); }
}
