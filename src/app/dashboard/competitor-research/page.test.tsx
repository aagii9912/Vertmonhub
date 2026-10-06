// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({ json: vi.fn(), fetch: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1', name: 'Elysium Residence' }, user: { id: 'user-1', role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true, canDelete: false } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('@/components/marketing/MarketIndicators', () => ({ MarketIndicators: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CompetitorResearchPage from './page';

afterEach(() => { vi.clearAllMocks(); });

it('shows our price as unavailable with the reason and gives no above/below-average verdict', async () => {
    transport.json.mockResolvedValue({ competitors: [
        { id: 'c1', name: 'Skyline Residence', price_per_sqm: 4_000_000 },
        { id: 'c2', name: 'River Garden', price_per_sqm: 5_000_000 },
        { id: 'c3', name: 'Үнэгүй төсөл', price_per_sqm: null },
    ] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CompetitorResearchPage /></QueryClientProvider>);

    expect(await screen.findByText('Elysium Residence (м.кв)')).toBeInTheDocument();
    expect(screen.getByText('Нэгжийн бүртгэлд худалдааны үнэ хадгалагддаггүй тул тооцох боломжгүй')).toBeInTheDocument();
    expect(screen.getByText('4,500,000₮')).toBeInTheDocument();
    expect(screen.getByText('2 өрсөлдөгчийн бүртгэсэн м.кв үнээр')).toBeInTheDocument();
    expect(screen.getByText('Манай м.кв үнэ тодорхойгүй тул харьцуулаагүй')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/4,850,000|Мандала|Дунджаас|ДУНДАЖ/);
});
