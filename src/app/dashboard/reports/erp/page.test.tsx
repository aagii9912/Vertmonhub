// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({ json: vi.fn(), fetch: vi.fn() }));
const auth = vi.hoisted(() => ({ canWrite: false, isManager: false, modules: ['erp-imports'] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'viewer', permissions: { modules: auth.modules, canWrite: auth.canWrite } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => ({ data: { mode: auth.isManager ? 'personal' : 'org', isManager: auth.isManager, canViewTeam: !auth.isManager } }) }));

import ErpPage from './page';
import { CONTRACT_LIST_COLUMNS } from '@/lib/contracts/list-format';

afterEach(() => { vi.clearAllMocks(); auth.canWrite = false; auth.isManager = false; auth.modules = ['erp-imports']; });

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

async function inspectHubFile() {
    transport.json.mockImplementation(async (url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') return { previousId: null, previousDate: null, sheets: [{ name: 'Sheet1', columns: [...CONTRACT_LIST_COLUMNS], count: 83, sample: [], keyColumns: [], contractList: true }] };
        if (url.includes('sources=1')) return { sources: [] };
        return { imports: [], total: 0 };
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><ErpPage /></QueryClientProvider>);

    await screen.findByText('ERP файл импортлох');
    fireEvent.change(screen.getByLabelText('Файл'), { target: { files: [new File(['x'], 'HUB data.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    expect(await screen.findByText(/Энэ бол гэрээний HUB жагсаалт/)).toBeInTheDocument();
    return cache;
}

it('recognises a HUB contract list on inspect and sends it to the contract import instead of a snapshot', async () => {
    auth.canWrite = true;
    const cache = await inspectHubFile();
    expect(screen.getByRole('link', { name: 'Гэрээний Excel импорт руу' })).toHaveAttribute('href', '/dashboard/contracts/import');
    expect(screen.queryByRole('button', { name: 'Өөрчлөлтийг урьдчилан харах' })).not.toBeInTheDocument();
    cache.clear();
});

it('does not send a restricted sales manager to the contract import the server refuses them', async () => {
    auth.canWrite = true; auth.isManager = true;
    const cache = await inspectHubFile();
    expect(screen.getByText(/удирдлага импортлоно/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Гэрээний Excel импорт руу' })).not.toBeInTheDocument();
    cache.clear();
});

it('after saving a snapshot refreshes the Wednesday report and offers the way back to its first step', async () => {
    auth.canWrite = true; auth.modules = ['erp-imports', 'reports'];
    const columns = ['Код', 'Бүтээгдэхүүний төрөл', 'Бүтээгдэхүүний төлөв'];
    const totals = { total: 1, baseline: 1, added: 0, changed: 0, missing: 0, unchanged: 0 };
    const imported = { id: 'import-2', source: 'ERP', report_date: '2026-11-10', file_name: 'products.xlsx', created_at: '2026-11-10T02:00:00Z' };
    let saved = false;
    transport.json.mockImplementation(async (url: string, init?: { method?: string; body?: FormData }) => {
        if (init?.method === 'POST') {
            const action = init.body?.get('action');
            if (action === 'inspect') return { previousId: null, previousDate: null, sheets: [{ name: 'Sheet1', columns, count: 1, sample: [], keyColumns: ['Код'] }] };
            if (action === 'preview') return { totals, datasets: [], changes: [] };
            saved = true;
            return { id: 'import-2' };
        }
        if (url.includes('sources=1')) return { sources: saved ? ['ERP'] : [] };
        if (url.includes('source=')) return { imports: saved ? [imported] : [], total: saved ? 1 : 0 };
        return { import: imported, previousDate: null, totalChanges: 0, totals, datasets: [], changes: [] };
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    render(<QueryClientProvider client={cache}><ErpPage /></QueryClientProvider>);

    await screen.findByText('ERP файл импортлох');
    expect(screen.queryByRole('link', { name: 'Лхагвын тайлан руу буцах' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Файл'), { target: { files: [new File(['x'], 'products.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Өөрчлөлтийг урьдчилан харах' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Импорт хадгалж, тайлан гаргах' }));

    expect(await screen.findByRole('link', { name: 'Лхагвын тайлан руу буцах' })).toHaveAttribute('href', '/dashboard/weekly?track=sales&step=files');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weekly-sales'] });
    cache.clear();
});
