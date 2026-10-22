// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PricingSheet, PricingSheetVersion, PricingVersionSummary } from '@/lib/sales/pricing-history';

const api = vi.hoisted(() => ({ dashboardJson: vi.fn(), role: 'sales_manager' }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: api.dashboardJson }));
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ shop: { id: 'shop-1', name: 'Elysium Residence' }, user: { id: 'user-1', role: api.role, permissions: { modules: ['properties'], canWrite: true } } }),
}));
vi.mock('@/components/admin/ProjectPricingSettings', () => ({ ProjectPricingSettings: () => <p>Үнийн засварлагч</p> }));

import PricingPage from './page';

const rule = { block: 'Б1', model: 'E3', floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_200_000, advance_percent: 30 };
const summary = (version: number, status: 'active' | 'archived', archived_at: string | null): PricingVersionSummary => ({
    id: `c${version}`, version, status, source: `Үнэ ${version}`, valid_from: '2026-10-01', valid_until: '2026-12-31',
    activated_at: '2026-10-01T02:00:00Z', activated_by: 'Болд', archived_at,
});
const detail = (base: PricingVersionSummary, price: number): PricingSheetVersion => ({
    ...base, validity: 'valid', previous_version: base.version > 1 ? 1 : null, removed: [],
    rows: [{ rule: { ...rule, price_per_sqm: price }, change: base.version > 1 ? 'changed' : null, previous: base.version > 1 ? { price_per_sqm: 4_000_000, advance_percent: 30 } : null }],
});
const history = [summary(2, 'active', null), summary(1, 'archived', '2026-10-20T02:00:00Z')];
const sheet = (selected: PricingSheetVersion | null): PricingSheet => ({ as_of: '2026-10-22', history: selected ? history : [], selected });

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PricingPage /></QueryClientProvider>);

beforeEach(() => {
    api.dashboardJson.mockReset();
    api.role = 'sales_manager';
    api.dashboardJson.mockImplementation(async (url: string) => url.endsWith('version=1')
        ? sheet(detail(history[1], 4_000_000)) : sheet(detail(history[0], 4_200_000)));
});

it('shows the valid price first and opens an archived version from the archive tab', async () => {
    renderPage();
    expect(await screen.findByText('4,200,000₮')).toBeInTheDocument();
    expect(api.dashboardJson).toHaveBeenCalledWith('/api/dashboard/pricing');
    expect(screen.queryByRole('tab', { name: /Засах/ })).not.toBeInTheDocument();
    const archive = screen.getByRole('tab', { name: 'Архив (1)' });
    fireEvent.mouseDown(archive); fireEvent.click(archive);
    fireEvent.click(await screen.findByRole('button', { name: 'Хувилбар 1-ийг харах' }));
    expect(await screen.findByText('Хувилбар 1')).toBeInTheDocument();
    expect(api.dashboardJson).toHaveBeenCalledWith('/api/dashboard/pricing?version=1');
    expect(screen.getByText('4,000,000₮')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Архивын жагсаалт/ }));
    expect(await screen.findByRole('button', { name: 'Хувилбар 1-ийг харах' })).toBeInTheDocument();
});

it('explains an empty price list and gives the editor tab only to super admins', async () => {
    api.role = 'super_admin';
    api.dashboardJson.mockResolvedValue(sheet(null));
    renderPage();
    expect(await screen.findByText('Баталсан үнэ байхгүй')).toBeInTheDocument();
    const edit = screen.getByRole('tab', { name: /Засах/ });
    fireEvent.mouseDown(edit); fireEvent.click(edit);
    expect(await screen.findByText('Үнийн засварлагч')).toBeInTheDocument();
});
