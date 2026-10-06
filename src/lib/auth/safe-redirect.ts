/**
 * Нэвтэрсний дараа буцах зам (`?redirect_url=`, `?next=`) — open redirect-ээс хамгаална.
 *
 * Зөвхөн ажилтны аппын ижил origin-ий замыг зөвшөөрнө: `/dashboard`, `/marketing`, `/admin`
 * болон тэдгээрийн доорх зам. `//host`, `/\host`, backslash, удирдлагын тэмдэгт, схем
 * (`javascript:`, `https:`), нэвтрэх хуудсууд (`/auth/*`, хуучин `/admin/login`) татгалзагдаж
 * `fallback` буцна. Үр дүн нь задалсан URL-ийн `pathname + search + hash` (`..` шийдэгдсэн).
 */
const APP_ROOTS = ['/dashboard', '/marketing', '/admin'] as const;
const BLOCKED_ROOTS = ['/auth', '/admin/login'] as const;
const BASE_ORIGIN = 'http://localhost';

const isUnder = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** C0 (таб, мөр шилжилт гэх мэт), DEL, C1 удирдлагын тэмдэгт. URL задлагч таб/мөр шилжилтийг чимээгүй устгадаг. */
function hasControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
    }
    return false;
}

export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
    // Хөтөч `\`-г `/` гэж уншдаг: `/\evil.example` нь `//evil.example` болно.
    if (value.includes('\\') || hasControlCharacter(value)) return fallback;

    let url: URL;
    let decodedPath: string;
    try {
        url = new URL(value, BASE_ORIGIN);
        decodedPath = decodeURIComponent(url.pathname).toLowerCase();
    } catch {
        return fallback;
    }
    if (url.origin !== BASE_ORIGIN) return fallback;
    // `/admin/%6Cogin`, `/admin/LOGIN` зэрэг хувилбарыг ч нэвтрэх хуудас гэж үзнэ.
    if (BLOCKED_ROOTS.some(root => isUnder(decodedPath, root))) return fallback;
    if (!APP_ROOTS.some(root => isUnder(url.pathname, root))) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
}
