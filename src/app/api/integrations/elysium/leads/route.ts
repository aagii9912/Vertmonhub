import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { safeEqual } from '@/lib/crypto/safe-equal';
import { supabaseAdmin } from '@/lib/supabase';
import { insertLeadOnce } from '@/lib/services/LeadService';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const LeadSchema = z.object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(1).max(50).nullish(),
    email: z.email().max(255).nullish(),
    message: z.string().trim().max(2000).nullish(),
    source: z.string().trim().max(500).nullish(),
    event: z.string().trim().max(255).nullish(),
}).refine((lead) => Boolean(lead.phone || lead.email), {
    message: 'Утас эсвэл и-мэйл шаардлагатай',
    path: ['phone'],
});

/** Elysium серверээс ирсэн маягтыг тохируулсан төсөлд бүртгэнэ. */
export async function POST(request: NextRequest) {
    const secret = process.env.ELYSIUM_LEAD_SYNC_SECRET;
    const projectId = process.env.ELYSIUM_LEAD_PROJECT_ID;
    if (!secret || !projectId) {
        logger.error('Elysium lead intake is not configured');
        return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!safeEqual(token, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = LeadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Буруу өгөгдөл', details: parsed.error.flatten() }, { status: 400 });
    }

    try {
        const db = supabaseAdmin();
        const { data: project, error: projectError } = await db
            .from('projects')
            .select('id, shop_id')
            .eq('id', projectId)
            .maybeSingle();
        if (projectError || !project) {
            logger.error('Elysium lead project is unavailable', { error: projectError });
            return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
        }

        const lead = parsed.data;
        const notes = [
            lead.message || null,
            lead.event ? `Арга хэмжээ: ${lead.event}` : null,
            lead.source ? `Сайтын эх сурвалж: ${lead.source}` : null,
        ].filter(Boolean).join('\n\n') || null;
        const result = await insertLeadOnce(db, {
            shop_id: project.shop_id,
            project_id: project.id,
            client_request_id: lead.requestId,
            customer_name: lead.name,
            customer_phone: lead.phone || null,
            customer_email: lead.email || null,
            source: 'website',
            notes,
        }, { select: 'id, project_id' });
        if (result.ok) return NextResponse.json({ ok: true, leadId: result.lead.id, duplicate: result.duplicate });
        if (result.conflict) return NextResponse.json({ error: 'Request ID conflict' }, { status: 409 });
        throw result.error;
    } catch (error) {
        logger.error('Elysium lead intake failed', { error });
        return NextResponse.json({ error: 'Хүсэлт бүртгэхэд алдаа гарлаа' }, { status: 500 });
    }
}
