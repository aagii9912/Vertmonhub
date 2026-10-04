import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
    path: '/dashboard/customers',
    auth: { isLoaded: true, user: { role: 'viewer', permissions: { modules: ['dashboard', 'reports'] } } },
    mounted: vi.fn(),
    unmounted: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: vi.fn() }));
vi.mock('@/components/dashboard/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/dashboard/Header', () => ({ Header: () => null }));
vi.mock('@/components/dashboard/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('@/components/dashboard/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/dashboard/QuickCreateSheet', () => ({ QuickCreateSheet: () => null }));
vi.mock('@/components/dashboard/OutboxSync', () => ({ OutboxSync: () => null }));
vi.mock('@/components/ai/AiPanel', () => ({ AiPanel: () => null }));
import { AppShell } from '../AppShell';

function ProtectedPage() {
    useEffect(() => { state.mounted(); return () => { state.unmounted(); }; }, []);
    return <div>Protected content</div>;
}
beforeEach(() => {
    state.path = '/dashboard/customers';
    state.auth = { isLoaded: true, user: { role: 'viewer', permissions: { modules: ['dashboard', 'reports'] } } };
    vi.clearAllMocks();
});

describe('direct URL authorization', () => {
    it('does not mount protected page effects while loading or denied', () => {
        state.auth.isLoaded = false;
        const view = render(<AppShell><ProtectedPage /></AppShell>);
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(state.mounted).not.toHaveBeenCalled();
        state.auth.isLoaded = true;
        view.rerender(<AppShell><ProtectedPage /></AppShell>);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(state.mounted).not.toHaveBeenCalled();
    });
    it('allows the required module then unmounts content when permission is revoked', () => {
        state.auth.user.permissions.modules = ['customers'];
        const view = render(<AppShell><ProtectedPage /></AppShell>);
        expect(screen.getByText('Protected content')).toBeInTheDocument();
        expect(state.mounted).toHaveBeenCalledOnce();
        state.auth.user.permissions.modules = ['dashboard'];
        view.rerender(<AppShell><ProtectedPage /></AppShell>);
        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
        expect(state.unmounted).toHaveBeenCalledOnce();
    });
    it('reports access does not grant the narrower ERP import route', () => {
        state.path = '/dashboard/reports/erp';
        render(<AppShell><ProtectedPage /></AppShell>);
        expect(state.mounted).not.toHaveBeenCalled();
    });
    it('super_admin retains access even without a database module list', () => {
        state.auth.user = { role: 'super_admin', permissions: { modules: [] } };
        render(<AppShell><ProtectedPage /></AppShell>);
        expect(state.mounted).toHaveBeenCalledOnce();
    });
});
