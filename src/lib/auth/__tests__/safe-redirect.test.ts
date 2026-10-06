import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../safe-redirect';

describe('safeRedirectPath — accepted staff-app paths', () => {
    it.each([
        ['/dashboard', '/dashboard'],
        ['/dashboard/leads', '/dashboard/leads'],
        ['/dashboard/leads?status=new', '/dashboard/leads?status=new'],
        ['/dashboard/leads?status=new&page=2#notes', '/dashboard/leads?status=new&page=2#notes'],
        ['/marketing', '/marketing'],
        ['/marketing/budget?year=2026', '/marketing/budget?year=2026'],
        ['/admin', '/admin'],
        ['/admin/users', '/admin/users'],
        ['/admin/dashboard', '/admin/dashboard'],
        // Only the exact retired page and its sub-paths are blocked, not look-alike names.
        ['/admin/login-history', '/admin/login-history'],
        ['/dashboard/?q=1', '/dashboard/?q=1'],
    ])('keeps %s', (value, expected) => {
        expect(safeRedirectPath(value)).toBe(expected);
    });

    it('returns the normalised path, query and hash of the parsed URL', () => {
        expect(safeRedirectPath('/dashboard/./leads/../contracts?id=7#pay')).toBe('/dashboard/contracts?id=7#pay');
        expect(safeRedirectPath('/dashboard/leads?name=Бат')).toBe('/dashboard/leads?name=%D0%91%D0%B0%D1%82');
    });

    it('keeps a same-origin query that itself contains a URL (it is never followed)', () => {
        expect(safeRedirectPath('/dashboard?next=https://evil.example')).toBe('/dashboard?next=https://evil.example');
    });
});

describe('safeRedirectPath — rejected values fall back', () => {
    it.each([null, undefined, ''])('falls back for an empty value (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it('falls back for non-string runtime values', () => {
        expect(safeRedirectPath(42 as unknown as string)).toBe('/dashboard');
        expect(safeRedirectPath({} as unknown as string)).toBe('/dashboard');
    });

    it.each([
        'dashboard',
        'dashboard/leads',
        ' /dashboard',
        '.',
        '?redirect=/dashboard',
    ])('rejects a path that does not start with a single slash (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        '//evil.example',
        '//evil.example/dashboard',
        '///evil.example',
        '/\\evil.example',
        '/\\/evil.example',
        '/dashboard\\..\\..\\evil',
        '/dashboard/leads\\',
    ])('rejects protocol-relative and backslash tricks (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        'https://evil.example',
        'https://evil.example/dashboard',
        'http://localhost/dashboard',
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'mailto:admin@example.invalid',
    ])('rejects absolute URLs and schemes (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        '/\t/evil.example',
        '/\n/evil.example',
        '/dashboard\r\n',
        '/dashboard\u0000',
        '/dashboard\u001b',
        '/dashboard\u007f',
        '/dashboard\u0085',
    ])('rejects control characters the URL parser would strip or hide (%j)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        '/auth',
        '/auth/login',
        '/auth/login?redirect_url=/dashboard',
        '/auth/callback?next=/dashboard',
        '/admin/login',
        '/admin/login/',
        '/admin/login?redirect_url=/admin',
        '/admin/login/sign-in',
        '/admin/LOGIN',
        '/admin/%6Cogin',
    ])('rejects login and auth pages (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        '/dashboard/../auth/login',
        '/dashboard/%2e%2e/auth/login',
        '/admin/../admin/login',
        '/marketing/../../api/admin/users',
    ])('rejects dot-segment escapes after normalisation (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it.each([
        '/',
        '/help',
        '/privacy',
        '/contact',
        '/api/admin/users',
        '/dashboardevil',
        '/marketing-evil',
        '/administrator',
        '/%2F%2Fevil.example',
        '/Dashboard',
    ])('rejects paths outside the staff app (%s)', (value) => {
        expect(safeRedirectPath(value)).toBe('/dashboard');
    });

    it('rejects malformed percent-encoding', () => {
        expect(safeRedirectPath('/dashboard/%E0%A4%A')).toBe('/dashboard');
    });

    it('uses the caller fallback', () => {
        expect(safeRedirectPath('//evil.example', '/admin/dashboard')).toBe('/admin/dashboard');
        expect(safeRedirectPath(null, '/marketing')).toBe('/marketing');
    });
});
