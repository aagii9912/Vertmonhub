import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Wave 3 (docs/REVIEW-2026-09-11.md): API route бүр өөрөө auth шалгадаг байх ёстой —
 * middleware /api/*-г хамгаалдаггүй. 2026-09 review-д `analyze-messages` шиг auth-гүй,
 * service-role route олдсон тул статик хамгаалалт: route.ts бүрт дор хаяж нэг auth/gate
 * дуудлага байх ёстой (нийтийн/гарын үсэгтэй route-уудыг ил allow-list-ээр).
 *
 * Шинэ нийтийн route нэмбэл ЗААВАЛ энд бүртгэж, шалтгааныг нь бичнэ.
 */
const API_ROOT = path.join(process.cwd(), 'src', 'app', 'api');

/** Нийтэд нээлттэй (эсвэл өөрийн гарын үсэг/токеноор хамгаалагдсан) route-ууд. */
const PUBLIC_ROUTES: Record<string, string> = {
    'auth': 'нэвтрэх урсгал (login/callback/…)',
    'health': 'health probe (нууц мэдээлэлгүй)',
    'docs': 'нийтийн API баримт',
    'push/vapid': 'VAPID public key',
    'admin/import/templates': 'Excel загвар татах (өгөгдөлгүй)',
    'webhook': 'Meta X-Hub-Signature-256 гарын үсэг (verifyWebhookSignature)',
    'meta/data-deletion': 'Meta signed_request HMAC',
    'marketing/facebook/leadgen': 'Meta leadgen signature',
    'leads': 'гадаад landing page-ийн лид intake (Turnstile + origin + rate limit)',
    'feedback': 'нийтийн feedback widget',
    'surveys/[id]': 'судалгааны нийтийн хариулт (anon client + RLS)',
};

const GATE = /\b(requireModule|requireAnyModule|requireModuleWrite|requireModuleDelete|requireWrite|requireDelete|resolvePermissions|getUserShop|getUserId|getAuthUser|resolveApiUser|prepareAssistantRequest|getAuthUserShop|getAdminUser|requireAdmin|isAuthorizedCron|verifyWebhookSignature|assertShopAccess)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name === 'route.ts') out.push(p);
    }
    return out;
}

function isPublic(rel: string): boolean {
    return Object.keys(PUBLIC_ROUTES).some((pub) => rel === pub || rel.startsWith(pub + '/'));
}

describe('API route auth guard', () => {
    const routes = walk(API_ROOT).map((p) => ({
        abs: p,
        rel: path.relative(API_ROOT, path.dirname(p)).split(path.sep).join('/'),
    }));

    it('finds the API routes', () => {
        expect(routes.length).toBeGreaterThan(50);
    });

    it('every non-public route.ts calls an auth gate', () => {
        const unguarded = routes
            .filter((r) => !isPublic(r.rel))
            .filter((r) => !GATE.test(readFileSync(r.abs, 'utf8')))
            .map((r) => r.rel);
        expect(unguarded, `auth gate-гүй route: ${unguarded.join(', ')}`).toEqual([]);
    });

    it('public allow-list entries still exist (устгасан бол жагсаалтаас хас)', () => {
        const rels = new Set(routes.map((r) => r.rel));
        const stale = Object.keys(PUBLIC_ROUTES).filter((pub) => ![...rels].some((r) => r === pub || r.startsWith(pub + '/')));
        expect(stale).toEqual([]);
    });
});
