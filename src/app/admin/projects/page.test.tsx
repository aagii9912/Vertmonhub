// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminProjectsPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'admin-1', role: 'super_admin' } }) }));

const renderPage = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><AdminProjectsPage /></QueryClientProvider>);
};

const shopId = 'd8d5f05f-3288-477f-bba1-3aa98c89192d';
const savedBodies: unknown[] = [];

afterEach(() => {
    vi.unstubAllGlobals();
    savedBodies.length = 0;
});

describe('admin project management', () => {
    it('shows linked project records, unassigned organization totals and the separate ERP report entry', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: string) => ({ ok: true, json: async () => input === '/api/admin/shops'
            ? { shops: [{ id: shopId, name: 'Мандала' }] }
            : { projects: [{ id: 'elysium', shop_id: shopId, name: 'Elysium Residence', status: 'active', counts: { leads: 114, units: 0, contracts: 0 } }], unassigned: [{ shop_id: shopId, leads: 30, units: 2544, contracts: 1617 }] } })));
        renderPage();
        expect(await screen.findByText('Лид 114 · Нэгж 0 · Гэрээ 0')).toBeInTheDocument();
        expect(screen.getByText('Мандала: лид 30 · нэгж 2,544 · гэрээ 1,617')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'ERP тайлан харах →' })).toHaveAttribute('href', '/dashboard/reports/erp');
        expect(screen.getByText(/Энэ төсөлд нэгж, гэрээ холбогдоогүй/)).toBeInTheDocument();
    });

    it('creates a project in the selected shop and reloads the list', async () => {
        let projects: object[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
            if (input === '/api/admin/shops') return { ok: true, json: async () => ({ shops: [{ id: shopId, name: 'Мандала' }] }) };
            if (input === '/api/admin/projects' && init?.method === 'POST') {
                const body = JSON.parse(String(init.body));
                savedBodies.push(body);
                projects = [{ id: 'project-1', ...body, shops: { name: 'Мандала' } }];
                return { ok: true, json: async () => ({ project: projects[0] }) };
            }
            if (input === '/api/admin/projects') return { ok: true, json: async () => ({ projects }) };
            throw new Error(`Unexpected request: ${input}`);
        }));

        renderPage();
        const createButton = await screen.findByRole('button', { name: 'Шинэ төсөл' });
        await waitFor(() => expect(createButton).toBeEnabled());
        fireEvent.click(createButton);
        fireEvent.change(screen.getByLabelText('Төслийн нэр'), { target: { value: 'Шинэ хотхон' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));

        await waitFor(() => expect(savedBodies).toMatchObject([{ shop_id: shopId, name: 'Шинэ хотхон' }]));
        expect(await screen.findByText('Шинэ хотхон')).toBeInTheDocument();
    });
});
