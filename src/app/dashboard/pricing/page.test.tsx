// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PricingPhase, PricingSheet, PricingSheetVersion, PricingVersionSummary } from '@/lib/sales/pricing-history';

const api = vi.hoisted(() => ({ dashboardJson: vi.fn(), role: 'sales_manager' }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: api.dashboardJson }));
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ shop: { id: 'shop-1', name: 'Elysium Residence' }, user: { id: 'user-1', role: api.role, permissions: { modules: ['properties'], canWrite: true } } }),
}));
vi.mock('@/components/admin/ProjectPricingSettings', () => ({ ProjectPricingSettings: () => <p>Үнийн засварлагч</p> }));
vi.mock('@/components/admin/UnitPriceSettings', () => ({ UnitPriceSettings: () => <p>Тоотын үнийн засварлагч</p> }));

import PricingPage from './page';

const rule = { block: 'Б1', model: 'E3', floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_200_000, advance_percent: 30 };
const summary = (version: number, status: 'active' | 'archived', archived_at: string | null): PricingVersionSummary => ({
    id: `c${version}`, list_key: 'main', list_name: 'Үндсэн үнэ', version, status, source: `Үнэ ${version}`, valid_from: '2026-10-01', valid_until: '2026-12-31',
    activated_at: '2026-10-01T02:00:00Z', activated_by: 'Болд', archived_at,
});
const detail = (base: PricingVersionSummary, price: number): PricingSheetVersion => ({
    ...base, validity: 'valid', previous_version: base.version > 1 ? 1 : null, removed: [],
    rows: [{ rule: { ...rule, price_per_sqm: price }, change: base.version > 1 ? 'changed' : null, previous: base.version > 1 ? { price_per_sqm: 4_000_000, advance_percent: 30 } : null }],
});
const history = [summary(2, 'active', null), summary(1, 'archived', '2026-10-20T02:00:00Z')];
const mainList = { key: 'main', name: 'Үндсэн үнэ', active_version: 2, valid_from: '2026-10-01', valid_until: '2026-12-31', validity: 'valid' as const, archived: 1 };
const price = { list_key: 'main', list_name: 'Үндсэн үнэ', version: 2, validity: 'valid' as const, valid_from: '2026-10-01', valid_until: '2026-12-31' };
const phases: PricingPhase[] = [{ name: 'Elysium Residence', blocks: [
    { block: 'Б1', kinds: [{ category: 'residential', units: 110, available: 40, price }, { category: 'parking', units: 193, available: 100, price: null }] },
    { block: 'Б2', kinds: [{ category: 'residential', units: 132, available: 60, price: null }] },
] }];
/** Default request: the block map with every list's active version; an archive request: that version only. */
const sheet = (selected: PricingSheetVersion | null, archived = false): PricingSheet => ({
    as_of: '2026-10-22', lists: selected ? [mainList] : [], history: selected ? history : [], selected,
    active: selected && !archived ? [selected] : [], phases: selected && !archived ? phases : [], unit_prices: [],
});

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PricingPage /></QueryClientProvider>);

beforeEach(() => {
    api.dashboardJson.mockReset();
    api.role = 'sales_manager';
    api.dashboardJson.mockImplementation(async (url: string) => url.endsWith('version=1')
        ? sheet(detail(history[1], 4_000_000), true) : sheet(detail(history[0], 4_200_000)));
});

it('shows the project by block with each kind price state, opens a block price and an archived version', async () => {
    renderPage();
    const block = await screen.findByRole('button', { name: 'Б1 блок' });
    expect(api.dashboardJson).toHaveBeenCalledWith('/api/dashboard/pricing');
    expect(screen.queryByRole('tab', { name: /Засах/ })).not.toBeInTheDocument();
    // The map: phase, blocks, each kind with its count and whether it has a price. No price table yet.
    expect(screen.getByRole('heading', { name: /Elysium Residence/ })).toHaveTextContent('2 блок');
    expect(block).toHaveTextContent('Орон сууц · 110Хүчинтэй');
    expect(block).toHaveTextContent('Зогсоол · 193Үнэ ороогүй');
    expect(screen.getByRole('button', { name: 'Б2 блок' })).toHaveTextContent('Орон сууц · 132Үнэ ороогүй');
    expect(screen.queryByText('4,200,000₮')).not.toBeInTheDocument();

    fireEvent.click(block);
    expect(await screen.findByText('4,200,000₮')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Б1 блок/ })).toHaveTextContent('Elysium Residence');
    expect(screen.getByRole('region', { name: 'Б1 блокийн үнэ' })).toHaveTextContent('110 орон сууц · 40 чөлөөтэй');
    // One price list: the list is never named. One block: no block column.
    expect(screen.getByText('Хувилбар 2')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Блок' })).not.toBeInTheDocument();
    // Parking has no price in the system yet: said plainly, not shown as 0.
    fireEvent.click(within(screen.getByRole('group', { name: 'Төрөл' })).getByRole('button', { name: /Зогсоол/ }));
    expect(screen.getByText('Зогсоолын үнэ энд хараахан ороогүй')).toBeInTheDocument();
    expect(screen.queryByText('4,200,000₮')).not.toBeInTheDocument();
    // The other block of the phase is one click away; it has no approved price.
    fireEvent.click(within(screen.getByRole('group', { name: /блок солих/ })).getByRole('button', { name: 'Б2' }));
    expect(screen.getByText('Б2 блокийн орон сууцны баталсан үнэ алга')).toBeInTheDocument();
    expect(screen.getByText('Удирдлага үнийг баталж идэвхжүүлсний дараа энд харагдана.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Бүх блок' }));
    expect(await screen.findByRole('button', { name: 'Б1 блок' })).toBeInTheDocument();

    const archive = screen.getByRole('tab', { name: 'Архив (1)' });
    fireEvent.mouseDown(archive); fireEvent.click(archive);
    fireEvent.click(await screen.findByRole('button', { name: 'Хувилбар 1-ийг харах' }));
    expect(await screen.findByText('Хувилбар 1')).toBeInTheDocument();
    expect(api.dashboardJson).toHaveBeenCalledWith('/api/dashboard/pricing?list=main&version=1');
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

it('with several price lists names the list beside a block price, and shows an administrator the drafted blocks', async () => {
    api.role = 'super_admin';
    const forest: PricingVersionSummary = { ...summary(1, 'active', null), id: 'f1', list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', valid_until: '2026-10-15' };
    const forestVersion: PricingSheetVersion = { ...detail(forest, 5_000_000), validity: 'expired', rows: [{ rule: { ...rule, block: '503', price_per_sqm: 5_000_000 }, change: null, previous: null }] };
    const forestPrice = { list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', version: 1, validity: 'expired' as const, valid_from: '2026-10-01', valid_until: '2026-10-15' };
    const draftRule = { ...rule, block: '504' };
    api.dashboardJson.mockImplementation(async (url: string) => url === '/api/admin/pricing'
        ? { lists: [{ key: 'main', name: 'Үндсэн үнэ', latest: { status: 'draft', rules: [draftRule, { ...rule, block: 'Б2' }] }, active: null }] }
        : { as_of: '2026-10-22', lists: [mainList, { ...mainList, key: 'forest', name: 'Forest Garden тусгай үнэ', active_version: 1, validity: 'expired' as const, archived: 0 }],
            history: [...history, forest], selected: detail(history[0], 4_200_000), active: [detail(history[0], 4_200_000), forestVersion],
            phases: [...phases, { name: null, blocks: [{ block: '503', kinds: [{ category: 'residential', units: 0, available: 0, price: forestPrice }] }] }], unit_prices: [] } satisfies PricingSheet);
    renderPage();
    // Priced but not in the register yet, and a block that only has a draft: both are on the administrator's map.
    const unregistered = await screen.findByRole('region', { name: 'Тоот бүртгэгдээгүй блок' });
    expect(within(unregistered).getByRole('button', { name: '503-р блок' })).toHaveTextContent('Хугацаа дууссан');
    expect(await within(unregistered).findByRole('button', { name: '504-р блок' })).toHaveTextContent('Ноорог');
    expect(screen.getByRole('button', { name: 'Б2 блок' })).toHaveTextContent('Орон сууц · 132Ноорог');

    fireEvent.click(within(unregistered).getByRole('button', { name: '503-р блок' }));
    expect(await screen.findByText('Forest Garden тусгай үнэ · Хувилбар 1')).toBeInTheDocument();
    expect(screen.getByText('5,000,000₮')).toBeInTheDocument();
    expect(screen.getByText('Тоотын бүртгэлд хараахан ороогүй')).toBeInTheDocument();
    expect(screen.getByText(/энэ жагсаалтын байранд уулзалтын үнийн санал тооцогдохгүй/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: /блок солих/ })).getByRole('button', { name: '504' }));
    expect(screen.getByText('Ноорог хадгалагдсан байна. «Засах» табаас хянаад идэвхжүүлнэ.')).toBeInTheDocument();

    const archive = screen.getByRole('tab', { name: 'Архив (1)' });
    fireEvent.mouseDown(archive); fireEvent.click(archive);
    expect(await screen.findByRole('columnheader', { name: 'Жагсаалт' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '«Үндсэн үнэ» хувилбар 1-ийг харах' }));
    expect(api.dashboardJson).toHaveBeenCalledWith('/api/dashboard/pricing?list=main&version=1');
});
