// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const state = vi.hoisted(() => ({
    userId: null as string | null,
    shop: { id: 'shop-1' } as { id: string } | null,
    access: null as { role: string; permissions: { modules: string[]; canWrite: boolean } } | null,
    adminThrows: false,
    db: { kind: 'service-role' },
}));
const intakeProjectName = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => 'Mandala Garden' as string | null));

vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'www.vertmon.mn', 'x-forwarded-proto': 'https' }) }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.userId,
    getUserShop: async () => state.shop,
    supabaseAdmin: () => { if (state.adminThrows) throw new Error('Supabase env missing'); return state.db; },
}));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => state.access }));
vi.mock('@/lib/leads/intake-project', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/leads/intake-project')>(),
    intakeProjectName,
}));

import ContactPage from './page';
import { ContactForm } from './ContactForm';

type Props = { projectName: string | null; canQuickEntry: boolean };
const renderPage = async () => (await ContactPage()) as ReactElement<Props>;

beforeEach(() => {
    state.userId = null;
    state.shop = { id: 'shop-1' };
    state.access = null;
    state.adminThrows = false;
    intakeProjectName.mockClear();
});

describe('/contact server context', () => {
    it('gives the public the configured site project and no quick entry', async () => {
        const element = await renderPage();
        expect(element.type).toBe(ContactForm);
        expect(element.props).toEqual({ projectName: 'Mandala Garden', canQuickEntry: false });
        expect(intakeProjectName).toHaveBeenCalledWith(state.db, 'https://www.vertmon.mn', null);
    });

    it("opens quick entry only for lead writers and names the staff member's shop project", async () => {
        state.userId = 'user-1';
        state.access = { role: 'sales_manager', permissions: { modules: ['leads'], canWrite: true } };
        expect((await renderPage()).props.canQuickEntry).toBe(true);
        expect(intakeProjectName).toHaveBeenLastCalledWith(state.db, 'https://www.vertmon.mn', 'shop-1');

        state.access = { role: 'viewer', permissions: { modules: ['leads'], canWrite: false } };
        expect((await renderPage()).props.canQuickEntry).toBe(false);
        state.access = { role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true } };
        expect((await renderPage()).props.canQuickEntry).toBe(false);
        state.access = { role: 'super_admin', permissions: { modules: [], canWrite: false } };
        expect((await renderPage()).props.canQuickEntry).toBe(true);
        state.access = null; // эрх уншиж чадаагүй → хаалттай
        expect((await renderPage()).props.canQuickEntry).toBe(false);
    });

    it('falls back to neutral branding when the project cannot be resolved', async () => {
        state.adminThrows = true;
        expect((await renderPage()).props).toEqual({ projectName: null, canQuickEntry: false });
        state.adminThrows = false;
        intakeProjectName.mockResolvedValueOnce(null);
        expect((await renderPage()).props.projectName).toBeNull();
    });
});
