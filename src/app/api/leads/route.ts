import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CreateLeadSchema, validateBody } from '@/lib/validations/schemas';
import {
    checkRateLimit,
    getClientIdentifier,
    createRateLimitResponse,
} from '@/lib/utils/rate-limiter';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const LEAD_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 5 };

function isAllowedOrigin(request: NextRequest): boolean {
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL;
    if (!allowedOrigin) return true;

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const source = origin || referer;
    if (!source) return false;

    try {
        const sourceHost = new URL(source).host;
        const allowedHost = new URL(allowedOrigin).host;
        return sourceHost === allowedHost;
    } catch {
        return false;
    }
}

async function verifyTurnstile(token: string | null | undefined, clientIp: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true;
    if (!token) return false;

    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, response: token, remoteip: clientIp }),
        });
        const data = (await res.json()) as { success?: boolean };
        return Boolean(data.success);
    } catch (err) {
        logger.warn('Turnstile verification failed', { error: err });
        return false;
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!isAllowedOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const clientIp = getClientIdentifier(request);
        const rl = await checkRateLimit(`leads:${clientIp}`, LEAD_RATE_LIMIT);
        if (!rl.allowed) {
            return createRateLimitResponse(rl.resetAt);
        }

        const { supabase } = await import('@/lib/supabase');
        const body = await request.json();

        const validation = validateBody(CreateLeadSchema, body);
        if (!validation.success) return validation.response;

        const {
            name, phone, email, company, message, website, turnstileToken,
            fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            facebook_campaign_id, facebook_adset_id, facebook_ad_id,
        } = validation.data;

        if (website && website.length > 0) {
            logger.warn('Honeypot triggered on /api/leads', { clientIp });
            return NextResponse.json({ success: true });
        }

        const captchaOk = await verifyTurnstile(turnstileToken, clientIp);
        if (!captchaOk) {
            return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
        }

        let aiResponse = '';
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            const prompt = `Чи Vertmon компанийн найрсаг менежер шүү! 😊

Одоо ${name}${company ? ` (${company}-с)` : ''} Odoo ERP-ийн талаар сонирхож байна. Түүнд ээлтэй, хүн шиг хариулт өг.

${message ? `Түүний хэлсэн зүйл: "${message}"` : 'Ерөнхий сонирхол илэрхийлж байна.'}

Ингэж хариул:
✓ Хүн шиг, найрсаг (AI биш шиг!)
✓ 2-3 өгүүлбэр (богино л хангалттай)
✓ Дараа нь яах талаар санаа өг
✓ Emoji зөв хэрэглэ (хэтрүүлэхгүй)
✓ ${name}-ийн нэрийг ашигла

❌ Бүү хэл: "Танд тусалж чадахдаа баяртай байна", "Манай компани", "Бид таньд үйлчилнэ"
✅ Хэл: Товч, ойлгомжтой, найрсаг!

Хариулт:`;

            const result = await model.generateContent(prompt);
            aiResponse = result.response.text();
        } catch (aiError) {
            logger.error('AI response error', { error: aiError });
            aiResponse = `Сайн байна уу ${name}! 😊

Таны хүсэлтийг хүлээн авлаа. Бид тантай удахгүй холбогдоно.

Яаралтай байвал ${phone} руу залгаарай!`;
        }

        const inferredSource = facebook_campaign_id || utm_source === 'facebook' || fbclid
            ? 'facebook_ads'
            : utm_source || undefined;

        const { data, error } = await supabase
            .from('leads')
            .insert([{
                name,
                phone,
                email,
                company,
                message,
                ai_response: aiResponse,
                fbclid: fbclid || null,
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null,
                facebook_campaign_id: facebook_campaign_id || null,
                facebook_adset_id: facebook_adset_id || null,
                facebook_ad_id: facebook_ad_id || null,
                ...(inferredSource ? { source: inferredSource } : {}),
            }])
            .select()
            .single();

        if (error) {
            logger.error('Lead insert error', { error });
            return NextResponse.json(
                { error: 'Хүсэлт илгээхэд алдаа гарлаа' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data,
            aiResponse,
        });

    } catch (error) {
        return safeErrorResponse(error, 'Хүсэлт илгээхэд алдаа гарлаа');
    }
}
