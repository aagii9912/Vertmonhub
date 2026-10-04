// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminProjectsPage from './page';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const refreshShops = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'admin-1', role: 'super_admin' }, refreshShops }) }));

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

    it('creates a project as its own workspace with management access and reloads the list', async () => {
        let projects: object[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
            if (input === '/api/admin/shops') return { ok: true, json: async () => ({ shops: [{ id: shopId, name: 'Мандала' }] }) };
            if (input === '/api/admin/users') return { ok: true, json: async () => ({ actor_id: 'admin-1', users: [
                { id: 'admin-1', email: 'me@example.mn', full_name: 'Би', role: 'super_admin' },
                { id: 'director', email: 'd@example.mn', full_name: 'Батаа', role: 'super_admin' },
                { id: 'marketer', email: 'm@example.mn', full_name: 'Анужин', role: 'marketing' },
                { id: 'seller', email: 's@example.mn', full_name: 'Номин', role: 'sales_manager' },
            ] }) };
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
        expect(screen.queryByLabelText('Байгууллага')).not.toBeInTheDocument();
        // Удирдлага, маркетинг анхнаасаа сонгогдсон; борлуулалтын менежерийг тусад нь нэмнэ.
        expect(screen.getByRole('checkbox', { name: /Батаа/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Анужин/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Номин/ })).not.toBeChecked();
        expect(screen.queryByRole('checkbox', { name: /Би/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /Номин/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));

        await waitFor(() => expect(savedBodies).toEqual([expect.objectContaining({ name: 'Шинэ хотхон', member_ids: ['director', 'marketer', 'seller'] })]));
        expect(savedBodies[0]).not.toHaveProperty('shop_id');
        expect(await screen.findByText('Шинэ хотхон')).toBeInTheDocument();
        expect(refreshShops).toHaveBeenCalled();
    });
});
