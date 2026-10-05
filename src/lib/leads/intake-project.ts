import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectScopeError } from '@/lib/sales/project-scope';
import { soleShopProjectId } from '@/lib/projects/shop-project';

/**
 * Нийтийн лидийн маягт төсөл сонгохгүй — серверийн баталсан UUID холбоос:
 * LEAD_PROJECT_ORIGINS (яг origin → төсөл) эсвэл LEAD_PROJECT_ID. POST /api/leads ба
 * /contact-ийн толгой хоёулаа энэ ганц дүрмийг ашиглана.
 */
export function intakeProjectId(origin: string): string {
    const originMap = process.env.LEAD_PROJECT_ORIGINS?.trim();
    if (originMap) {
        let configured: Record<string, string>;
        try {
            configured = z.record(z.string(), z.uuid()).parse(JSON.parse(originMap));
            for (const key of Object.keys(configured)) {
                if (new URL(key).origin !== key) throw new Error('Non-canonical origin');
            }
        } catch {
            throw new ProjectScopeError(503, 'Лид хүлээн авах төслийн тохиргоо буруу байна');
        }
        if (!Object.hasOwn(configured, origin)) throw new ProjectScopeError(503, 'Энэ сайтын лид хүлээн авах төсөл тохируулаагүй байна');
        return configured[origin];
    }
    const configured = z.uuid().safeParse(process.env.LEAD_PROJECT_ID?.trim());
    if (!configured.success) throw new ProjectScopeError(503, 'Лид хүлээн авах төсөл тохируулаагүй байна');
    return configured.data;
}

function originOf(value: string | null | undefined): string {
    if (!value) return '';
    try {
        return new URL(value).origin;
    } catch {
        return ''; // баталгаагүй origin
    }
}

/** Лид илгээсэн хүсэлтийн Origin (байхгүй бол Referer) — canonical origin эсвэл ''. */
export function requestOrigin(headers: Headers): string {
    return originOf(headers.get('origin') || headers.get('referer'));
}

/**
 * Хуудасны (GET) өөрийн origin. Тэр хуудаснаас илгээсэн fetch-ийн Origin толгой үүнтэй
 * ижил тул /contact-ийн толгой POST /api/leads-тэй ижил төслийг олно.
 */
export function pageOrigin(headers: Headers): string {
    const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host')?.trim();
    if (!host) return '';
    const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
        || (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? 'http' : 'https');
    return originOf(`${proto}://${host}`);
}

/**
 * /contact-ийн толгойд харуулах төслийн нэр — POST /api/leads лидийг холбох дарааллаар:
 * нэвтэрсэн ажилтан бол түүний shop-ийн ганц төсөл, эс бөгөөс сайтын тохиргоо.
 * Тохиргоогүй, олдоогүй эсвэл алдаатай бол null (хуудас «Vertmon» гэж харуулна).
 */
export async function intakeProjectName(db: SupabaseClient, origin: string, staffShopId: string | null): Promise<string | null> {
    try {
        const projectId = (staffShopId ? await soleShopProjectId(db, staffShopId) : null) ?? intakeProjectId(origin);
        const { data, error } = await db.from('projects').select('name').eq('id', projectId).maybeSingle();
        if (error) return null;
        const name = typeof data?.name === 'string' ? data.name.trim() : '';
        return name || null;
    } catch {
        return null;
    }
}
