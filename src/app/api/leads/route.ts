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
import { sendMetaCapiEvent, buildFbc } from '@/lib/marketing/meta-capi';
import { sendLeadWelcomeEmail } from '@/lib/email/email';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { assertProjectManager, canAccessProject, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const LEAD_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 5 };
const IntakeLeadSchema = CreateLeadSchema.extend({ project_id: z.uuid().optional() });

/** Нийтийн form төсөл сонгохгүй; серверийн баталсан UUID холбоос ашиглана. */
function configuredProjectId(request: NextRequest): string {
    const originMap = process.env.LEAD_PROJECT_ORIGINS?.trim();
    if (originMap) {
        let configured: Record<string, string>;
        try {
            configured = z.record(z.string(), z.uuid()).parse(JSON.parse(originMap));
            for (const origin of Object.keys(configured)) {
                if (new URL(origin).origin !== origin) throw new Error('Non-canonical origin');
            }
        } catch {
            throw new ProjectScopeError(503, 'Лид хүлээн авах төслийн тохиргоо буруу байна');
        }
        const source = request.headers.get('origin') || request.headers.get('referer');
        let origin = '';
        try { origin = source ? new URL(source).origin : ''; } catch { /* баталгаагүй origin */ }
        if (!Object.hasOwn(configured, origin)) throw new ProjectScopeError(503, 'Энэ сайтын лид хүлээн авах төсөл тохируулаагүй байна');
        return configured[origin];
    }
    const configured = z.uuid().safeParse(process.env.LEAD_PROJECT_ID?.trim());
    if (!configured.success) throw new ProjectScopeError(503, 'Лид хүлээн авах төсөл тохируулаагүй байна');
    return configured.data;
}

/**
 * Зөвшөөрөгдсөн origin-ы host-ууд: NEXT_PUBLIC_APP_URL дээр нэмээд
 * LEAD_ALLOWED_ORIGINS (таслалаар тусгаарлагдсан, ж:
 * "https://mandala-garden.mn,https://www.mandala-garden.mn") — гадаад landing
 * page-ээс лид хүлээн авахад ашиглана. Аль нь ч тохируулагдаагүй бол бүгдийг
 * зөвшөөрнө (dev горим).
 */
function allowedHosts(): string[] {
    const raw = [process.env.NEXT_PUBLIC_APP_URL, process.env.LEAD_ALLOWED_ORIGINS]
        .filter(Boolean)
        .join(',');
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((u) => {
            try {
                return new URL(u).host;
            } catch {
                return '';
            }
        })
        .filter(Boolean);
}

function isAllowedOrigin(request: NextRequest): boolean {
    const hosts = allowedHosts();
    if (hosts.length === 0) return true;

    const source = request.headers.get('origin') || request.headers.get('referer');
    if (!source) return false;

    try {
        return hosts.includes(new URL(source).host);
    } catch {
        return false;
    }
}

/**
 * CORS толгойнууд — зөвшөөрөгдсөн гадаад origin-д (mandala-garden.mn г.м)
 * браузерын preflight/fetch хариуг нээнэ.
 */
function corsHeaders(request: NextRequest): Record<string, string> {
    const origin = request.headers.get('origin');
    if (!origin) return {};

    const hosts = allowedHosts();
    let allowed = hosts.length === 0;
    if (!allowed) {
        try {
            allowed = hosts.includes(new URL(origin).host);
        } catch {
            allowed = false;
        }
    }
    if (!allowed) return {};

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
    };
}

/** Гадаад landing page-ийн fetch preflight (Content-Type: application/json). */
export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

async function verifyTurnstile(token: string | null | undefined, clientIp: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    // TURNSTILE_SECRET_KEY тохируулаагүй бол captcha-гүй өнгөрнө (origin allowlist + rate limit +
    // honeypot л хамгаална). 2026-09-11: prod Vercel env-д энэ түлхүүр байхгүй тул заавал болговол
    // mandala-garden.mn-ийн лид маягт бүхэлдээ тасрах байсан — тохируулмагц автоматаар заавал болно.
    // instrumentation.ts дутуу env-ийг серверийн эхлэлд анхааруулна.
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
    const res = await handleLeadPost(request);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
        res.headers.set(key, value);
    }
    return res;
}

async function handleLeadPost(request: NextRequest): Promise<NextResponse> {
    try {
        if (!isAllowedOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Нэвтэрсэн ажилтан уу? (таблет дээр газар дээр нь бүртгэж буй менежер)
        // Байвал rate limit + captcha алгасна — нэг IP-ээс олон харилцагч
        // дараалан бүртгэхэд 5/цаг хязгаар саад болдог байсан.
        let staffUserId: string | null = null;
        try {
            staffUserId = await getUserId();
        } catch {
            staffUserId = null;
        }
        if (staffUserId) {
            const denied = await requireModuleWrite('leads');
            if (denied) return denied;
        }

        const clientIp = getClientIdentifier(request);
        if (!staffUserId) {
            const rl = await checkRateLimit(`leads:${clientIp}`, LEAD_RATE_LIMIT);
            if (!rl.allowed) {
                return createRateLimitResponse(rl.resetAt);
            }
        }

        const { supabaseAdmin } = await import('@/lib/supabase');
        const supabase = supabaseAdmin();
        const body = await request.json();

        const validation = validateBody(IntakeLeadSchema, body);
        if (!validation.success) return validation.response;

        const {
            name, phone, email, company, message, website, turnstileToken,
            fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            facebook_campaign_id, facebook_adset_id, facebook_ad_id,
            preferred_type, preferred_rooms, financing_intent, interested_phase, advance_percent, source,
        } = validation.data;

        if (website && website.length > 0) {
            logger.warn('Honeypot triggered on /api/leads', { clientIp });
            return NextResponse.json({ success: true });
        }

        if (!staffUserId) {
            const captchaOk = await verifyTurnstile(turnstileToken, clientIp);
            if (!captchaOk) {
                return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
            }
        }

        const projectId = staffUserId && validation.data.project_id
            ? validation.data.project_id : configuredProjectId(request);
        const { data: project, error: projectError } = await supabase.from('projects')
            .select('id, shop_id').eq('id', projectId).maybeSingle();
        if (projectError) throw new ProjectScopeError(503, 'Лидийн төслийг шалгаж чадсангүй');
        if (!project) throw new ProjectScopeError(staffUserId ? 400 : 503, 'Лид хүлээн авах төсөл олдсонгүй');

        let salesManagerName: string | null = null;
        if (staffUserId) {
            const [shop, permissions] = await Promise.all([getUserShop(), resolvePermissions()]);
            if (!shop || !permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
            if (project.shop_id !== shop.id) return NextResponse.json({ error: 'Төсөл энэ байгууллагад харьяалагдахгүй байна' }, { status: 403 });
            const scope = await resolveSalesProjectScope(supabase, shop.id, { userId: staffUserId, role: permissions.role });
            if (!canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төсөлд лид бүртгэх эрхгүй' }, { status: 403 });
            salesManagerName = scope.managerName;
            if (salesManagerName) await assertProjectManager(supabase, shop.id, projectId, salesManagerName);
        } else {
            const configuredShop = process.env.LEAD_SHOP_ID?.trim();
            if (configuredShop && (!z.uuid().safeParse(configuredShop).success || configuredShop !== project.shop_id)) {
                throw new ProjectScopeError(503, 'Лид хүлээн авах байгууллага болон төсөл зөрж байна');
            }
        }
        const { data: primaryShop, error: shopError } = await supabase.from('shops')
            .select('id, name, phone').eq('id', project.shop_id).maybeSingle();
        if (shopError || !primaryShop) throw new ProjectScopeError(503, 'Лид хүлээн авах байгууллага олдсонгүй');

        // Менежерийн түргэн бүртгэлд (staffUserId) AI хариу шаардлагагүй —
        // дараалсан бүртгэлийн хурдыг хадгална.
        let aiResponse = '';
        if (!staffUserId) {
            try {
                const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

                const prompt = `Чи Vertmon компанийн найрсаг менежер шүү! 😊

Одоо ${name}${company ? ` (${company}-с)` : ''} Vertmon-ий шийдлийн талаар сонирхож байна. Түүнд ээлтэй, хүн шиг хариулт өг.

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
        }

        const inferredSource = source
            || (facebook_campaign_id || utm_source === 'facebook' || fbclid
                ? 'facebook_ads'
                : utm_source || 'website');

        // Анкетын нэмэлт талбаруудыг (ээлж, урьдчилгаа %) тэмдэглэлд нэгтгэнэ
        const notesComposed = [
            message || null,
            interested_phase ? `Сонирхсон ээлж: ${interested_phase}` : null,
            advance_percent != null ? `Урьдчилгаа: ${advance_percent}%` : null,
        ].filter(Boolean).join('\n') || null;

        // company / AI хариуг тусдаа багана байхгүй тул internal_notes-д хадгална
        const internalNotes = [
            company ? `Компани: ${company}` : null,
            aiResponse ? `AI хариу: ${aiResponse}` : null,
        ].filter(Boolean).join('\n\n') || null;

        const { data, error } = await supabase
            .from('leads')
            .insert([{
                shop_id: primaryShop.id,
                project_id: projectId,
                sales_manager_name: salesManagerName,
                customer_name: name,
                customer_phone: phone,
                customer_email: email || null,
                notes: notesComposed,
                internal_notes: internalNotes,
                source: inferredSource,
                preferred_type: preferred_type || null,
                preferred_rooms: preferred_rooms ?? null,
                financing_intent: financing_intent || null,
                fbclid: fbclid || null,
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null,
                facebook_campaign_id: facebook_campaign_id || null,
                facebook_adset_id: facebook_adset_id || null,
                facebook_ad_id: facebook_ad_id || null,
            }])
            .select('id')
            .single();

        if (error) {
            logger.error('Lead insert error', { error });
            return NextResponse.json(
                { error: 'Хүсэлт илгээхэд алдаа гарлаа' },
                { status: 500 }
            );
        }

        // Угталтын имэйл (Resend, EMAIL_FROM домэйнээс) — best-effort,
        // алдаа гарсан ч лидийн бүртгэлийг унагахгүй.
        if (email) {
            try {
                await sendLeadWelcomeEmail({
                    to: email,
                    name,
                    shopName: primaryShop.name || undefined,
                    phone: primaryShop.phone || null,
                    websiteUrl: process.env.LEAD_WELCOME_SITE_URL || null,
                });
            } catch (emailError) {
                logger.warn('Lead welcome email failed', { error: emailError });
            }
        }

        // Meta Conversions API — сервер талаас Lead event (best-effort)
        await sendMetaCapiEvent({
            eventName: 'Lead',
            eventId: data?.id,
            eventSourceUrl: request.headers.get('referer'),
            userData: {
                email,
                phone,
                fbc: buildFbc(fbclid),
                clientIp,
                userAgent: request.headers.get('user-agent'),
            },
            customData: { lead_source: inferredSource || 'website' },
        });

        return NextResponse.json({
            success: true,
            receipt_id: data?.id,
        });

    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Хүсэлт илгээхэд алдаа гарлаа');
    }
}
