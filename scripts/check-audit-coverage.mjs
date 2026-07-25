#!/usr/bin/env node
/**
 * Аудит ба эрхийн хамрах хүрээний регрессийн хаалга.
 *
 * Дотоод аудитаар илэрсэн үндсэн шалтгаан нь эрх ба аудит хоёр route бүрийн
 * «сайн дурын» ажил байсанд оршино — хөгжүүлэгч санавал нэмнэ, санахгүй бол
 * алгасна. Энэ скрипт нь ШИНЭ mutating route хамгаалалт эсвэл аудитгүйгээр
 * нэмэгдвэл CI-г унагаж, дефолтыг «хамгаалалттай» тал руу шилжүүлнэ.
 *
 * Одоо байгаа цоорхойг ALLOWLIST-д зориуд, шалтгаантайгаар бүртгэсэн.
 * Шинэ route нэмэхдээ allowlist-д бичихээс илүү apiContext/auditFor
 * хэрэглэх нь зөв — allowlist нь зөвхөн бодитоор аудит шаардахгүй
 * (эзлэхүүн их, эсвэл өөрийн аудит сувагтай) route-уудад зориулагдсан.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_DIR = 'src/app/api';

/** Аудит бичих шаардлагагүй route-ууд — шалтгаан бүртэй. */
const AUDIT_ALLOWLIST = new Map([
    ['webhook', 'DM эзлэхүүн их; chat_history нь өөрөө бүртгэл'],
    ['cron/ads-insights-sync', 'зөвхөн гадаад дата синк, бизнес өгөгдөл өөрчлөхгүй'],
    ['cron/social-insights-sync', 'зөвхөн гадаад дата синк'],
    ['cron/ai-digest', 'зөвхөн уншиж мэдэгдэл илгээнэ'],
    ['cron/director-digest', 'зөвхөн уншиж мэдэгдэл илгээнэ'],
    ['cron/morning-leads', 'зөвхөн уншиж мэдэгдэл илгээнэ'],
    ['cron/weekly-report', 'зөвхөн уншиж мэдэгдэл илгээнэ'],
    ['cron/channel-expiry', 'зөвхөн уншиж мэдэгдэл илгээнэ'],
    ['cron/task-reminders', 'зөвхөн сануулга илгээнэ'],
    ['cron/customer-followups', 'зөвхөн сануулга илгээнэ'],
    ['cron/process-webhook-jobs', 'webhook дараалал; webhook_jobs нь өөрөө бүртгэл'],
    ['cron/overdue-check', 'системийн тооцоолол; хариунд алдаа тайлагнана'],
    ['ai-assistant', 'ai_audit_log + ai_messages/trace сувагтай'],
    ['ai-assistant/action', 'ai_audit_log сувагтай (logAiAudit бодит гүйцэтгэлд)'],
    ['ai-assistant/conversations', 'чатын метадата'],
    ['ai-assistant/conversations/[id]', 'чатын метадата'],
    ['ai-assistant/analyze-messages', 'уншилт, өгөгдөл өөрчлөхгүй'],
    ['push/subscribe', 'төхөөрөмжийн бүртгэл'],
    ['user/shops', 'уншилт'],
    ['dashboard/prefs', 'хувийн UI тохиргоо'],
    ['auth/facebook/pages', 'OAuth уншилт'],
    ['auth/instagram/accounts', 'OAuth уншилт'],
    ['auth/login', 'logActivity-аар шууд бүртгэдэг (session entity)'],
    ['dashboard/customers/recompute-scores', 'дериватив оноо дахин тооцоолол'],
    ['dashboard/competitors/analyze', 'AI шинжилгээ, уншилт'],
    ['dashboard/inbox/remind', 'мессеж илгээлт; chat_history бүртгэнэ'],
    ['dashboard/connect-instagram', 'OAuth холболт; shop аудитаар тусгагдана'],
    ['dashboard/customers/import/hubspot', 'гадаад импорт (дараагийн шатанд)'],
    ['integrations/hubspot/sync', 'гадаад синк (дараагийн шатанд)'],
    ['marketing/facebook/publish', 'FB нийтлэл; social_posts бүртгэнэ'],
    ['marketing/facebook/ads/accounts', 'гадаад уншилт'],
    ['meta/data-deletion', 'Meta-ийн шаардлагатай устгалт (дараагийн шатанд)'],
    ['shop/disconnect', 'холболт салгах (дараагийн шатанд)'],
    ['shop/import', 'shop өгөгдөл импорт (дараагийн шатанд)'],
    ['admin/invoices', 'платформын нэхэмжлэх (дараагийн шатанд)'],
    ['admin/settings', 'статик тохиргооны уншилт'],
    ['admin/setup', 'нэг удаагийн тохируулга'],
    ['properties/upload', 'зураг байршуулалт; property аудитаар тусгагдана'],
]);

/**
 * Зориудаар нээлттэй route-ууд — шалтгаан бүртэй.
 * Шинэ route-ыг энд нэмэхээсээ өмнө ЗААВАЛ дахин бодох: нээлттэй байх
 * шаардлага нь бодит эсэх, өөр хамгаалалт (гарын үсэг, нууц түлхүүр)
 * байгаа эсэхийг тодорхой бич.
 */
const AUTH_ALLOWLIST = new Map([
    ['webhook', 'Meta webhook — X-Hub-Signature-256 гарын үсгээр хамгаалагдсан'],
    ['marketing/facebook/leadgen', 'Meta Lead Ads webhook — гарын үсгээр хамгаалагдсан'],
    ['meta/data-deletion', 'Meta-ийн шаардлагатай endpoint — signed_request-аар шалгагдана'],
    ['auth/login', 'нэвтрэлтийн endpoint — өөрөө auth үүсгэдэг'],
    ['auth/facebook', 'OAuth эхлэл'],
    ['auth/facebook/callback', 'OAuth callback — state параметрээр хамгаалагдана'],
    ['auth/facebook/pages', 'OAuth-ийн үр дүнг уншина (хэрэглэгчийн өөрийн cookie)'],
    ['auth/instagram', 'OAuth эхлэл'],
    ['auth/instagram/callback', 'OAuth callback'],
    ['health', 'мониторингийн probe — нээлттэй байх ёстой'],
    ['docs', 'нийтийн API баримт'],
    ['push/vapid', 'зөвхөн НИЙТИЙН VAPID түлхүүрийг буцаана'],
    ['surveys/[id]', 'нийтийн судалгааны хариулт — RLS + Zod-оор хамгаалагдсан'],
    ['leads', 'гадаад landing page-ээс лид — CORS + origin allowlist'],
    ['feedback', 'нийтийн санал хүсэлтийн виджет'],
    ['features', 'нийтийн feature flag'],
    ['properties', 'нийтийн үл хөдлөхийн жагсаалт (landing page)'],
]);

const AUTH_PATTERNS = [
    'apiContext', 'requireModule', 'requireWrite', 'requireDelete',
    'requireAdmin', 'getAdminUser', 'getUserShop', 'getAuthUserShop',
    'resolveApiUser', 'getAuthUser', 'getUserId', 'isAuthorizedCron',
    'verifyRequestSignature', 'resolvePermissions',
];

const AUDIT_PATTERNS = [
    'auditFor', 'ctx.audit', 'logActivity', 'recordAudit',
    'logAdminAudit', 'logAiAudit', 'logFinanceAudit',
];

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (name === 'route.ts') out.push(full);
    }
    return out;
}

const routes = walk(API_DIR);
const missingAuth = [];
const missingAudit = [];

for (const file of routes) {
    const src = readFileSync(file, 'utf8');
    const id = relative(API_DIR, file).replace(/\/route\.ts$/, '');
    const isMutating = /export async function (POST|PATCH|PUT|DELETE)\b/.test(src);

    const hasAuth = AUTH_PATTERNS.some(p => src.includes(p));
    const hasAudit = AUDIT_PATTERNS.some(p => src.includes(p));

    if (!hasAuth && !AUTH_ALLOWLIST.has(id)) missingAuth.push(id);
    if (isMutating && !hasAudit && !AUDIT_ALLOWLIST.has(id)) missingAudit.push(id);
}

const mutating = routes.filter(f =>
    /export async function (POST|PATCH|PUT|DELETE)\b/.test(readFileSync(f, 'utf8')),
).length;
const audited = mutating - missingAudit.length
    - [...AUDIT_ALLOWLIST.keys()].filter(k => {
        const f = join(API_DIR, k, 'route.ts');
        try {
            const src = readFileSync(f, 'utf8');
            return /export async function (POST|PATCH|PUT|DELETE)\b/.test(src)
                && !AUDIT_PATTERNS.some(p => src.includes(p));
        } catch { return false; }
    }).length;

console.log(`Route: ${routes.length} | Mutating: ${mutating} | Аудиттай: ${audited}`);

let failed = false;

if (missingAuth.length) {
    failed = true;
    console.error(`\n✖ Нэвтрэлт/эрхийн шалгалтгүй ${missingAuth.length} route:`);
    for (const r of missingAuth) console.error(`    ${r}`);
    console.error('  → apiContext() эсвэл тохирох require*() нэмнэ үү.');
}

if (missingAudit.length) {
    failed = true;
    console.error(`\n✖ Аудит бичдэггүй ${missingAudit.length} mutating route:`);
    for (const r of missingAudit) console.error(`    ${r}`);
    console.error('  → ctx.audit() / auditFor() нэмнэ үү. Бодитоор шаардлагагүй бол');
    console.error('    scripts/check-audit-coverage.mjs-ийн ALLOWLIST-д ШАЛТГААНТАЙ бүртгэнэ.');
}

if (failed) process.exit(1);
console.log('✓ Аудит ба эрхийн хамрах хүрээ бүрэн.');
