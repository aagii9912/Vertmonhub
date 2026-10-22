// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ canViewTeam: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'sales_manager', permissions: { modules: ['reports', 'contracts'] } } }) }));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => ({ data: { mode: state.canViewTeam ? 'org' : 'personal', isManager: !state.canViewTeam, canViewTeam: state.canViewTeam } }) }));

import ReportsPage from './page';

afterEach(() => { cleanup(); state.canViewTeam = true; });

it('hides the team plan tile from a restricted (personal-mode) manager the plan API refuses', () => {
    state.canViewTeam = false;
    render(<ReportsPage />);
    expect(screen.queryByRole('link', { name: /Төлөвлөгөөний биелэлт/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Сарын KPI тайлан/ })).toHaveAttribute('href', '/dashboard/reports/kpi');
});

it('shows the plan tile to team viewers', () => {
    render(<ReportsPage />);
    expect(screen.getByRole('link', { name: /Төлөвлөгөөний биелэлт/ })).toHaveAttribute('href', '/dashboard/reports/plan');
});
