// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({ json: vi.fn(), fetch: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'viewer', permissions: { modules: ['erp-imports'], canWrite: false } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ErpPage from './page';

afterEach(() => { vi.clearAllMocks(); });

it('opens the saved Elysium source and shows baseline rows on the first visit', async () => {
    const imported = { id: 'import-1', source: 'Elysium ERP', report_date: '2026-09-26', file_name: 'Elysium ERP.xlsx', created_at: '2026-10-01T02:49:40Z' };
    transport.json.mockImplementation(async (url: string) => {
        if (url.includes('sources=1')) return { sources: ['Elysium ERP'] };
        if (url.includes('source=')) return { imports: [imported], total: 1 };
        return { import: imported, previousDate: null, totalChanges: 1, totals: { total: 1, baseline: 1, added: 0, changed: 0, missing: 0, unchanged: 0 },
            datasets: [{ name: 'Sheet1', total: 1, baseline: 1, added: 0, changed: 0, missing: 0, unchanged: 0, addedColumns: [], missingColumns: [] }],
            changes: [{ dataset: 'Sheet1', key: '["Б1-46"]', kind: 'baseline', before: null, after: { Код: 'Б1-46' }, fields: ['Код'] }] };
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><ErpPage /></QueryClientProvider>);

    expect(await screen.findByLabelText('Хадгалсан тайлангийн багц')).toHaveValue('Elysium ERP');
    expect(await screen.findAllByText('Б1-46')).toHaveLength(2);
    expect(screen.getByLabelText('Зөвхөн өөрчлөлт')).not.toBeChecked();
    expect(transport.json).toHaveBeenCalledWith(expect.stringContaining('source=Elysium+ERP'), { shopId: 'shop-1' });
    expect(transport.json).toHaveBeenCalledWith(expect.stringContaining('changesOnly=0'), { shopId: 'shop-1' });
    expect(screen.queryByText('ERP файл импортлох')).not.toBeInTheDocument();
    cache.clear();
});
