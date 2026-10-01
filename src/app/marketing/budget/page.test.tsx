import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildBudgetOverview } from '@/lib/marketing/budget';
import { ubParts } from '@/lib/utils/date';
import type { DashboardFetchInit } from '@/lib/api/dashboardFetch';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), auth: { shop: { id: 'shop-a' }, user: { id: 'user-a', role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true, canDelete: false } } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: mocks.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import Page from './page';

const project = '00000000-0000-4000-8000-000000000001';
const body = (budget = 0) => ({ year: ubParts().year, available: true,
    projects: [{ id: project, name: 'Elysium' }], channels: { board: 'Билборд' }, entries: [],
    overview: buildBudgetOverview(Array(12).fill(budget), Array(12).fill(0), Array(12).fill(0)) });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.shop.id = 'shop-a'; mocks.auth.user.id = 'user-a';
    mocks.auth.user.permissions = { modules: ['marketing-roi'], canWrite: true, canDelete: false };
    mocks.fetch.mockResolvedValue(response(body()));
});

it('previews exact annual allocation before saving once to the selected project and explicit shop', async () => {
    const writes: Array<DashboardFetchInit> = [];
    mocks.fetch.mockImplementation(async (_url: string, init?: DashboardFetchInit) => {
        if (init?.method === 'PUT') { writes.push(init); return response({ success: true }); }
        return response(body());
    });
    render(<QueryClientProvider client={client()}><Page /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Төсөв засах' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Төсвийн хамрах хүрээ' }), { target: { value: project } });
    await screen.findByRole('button', { name: 'Төсөв засах' });
    fireEvent.click(screen.getByRole('button', { name: 'Төсөв засах' }));
    fireEvent.change(screen.getByLabelText('Жилийн төсөв (₮)'), { target: { value: '120001' } });
    expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '12 сард тэнцүү хуваарилах' }));
    expect(screen.getByLabelText('1-р сарын төсөв')).toHaveValue(10001);
    expect(screen.getByLabelText('12-р сарын төсөв')).toHaveValue(10000);
    expect(writes).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Төсвийн хамрах хүрээ' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const saved = JSON.parse(String(writes[0].body));
    expect(writes[0].shopId).toBe('shop-a');
    expect(saved).toMatchObject({ year: ubParts().year, project_id: project, annualAmount: 120001 });
    expect(saved.months.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0)).toBe(120001);
});

it('resets unsaved plans and hides previous-account cached finance while the new account loads', async () => {
    const queryClient = client();
    mocks.fetch.mockImplementation(async () => response(body(1500)));
    const page = render(<QueryClientProvider client={queryClient}><Page /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Төсөв засах' });
    fireEvent.click(screen.getByRole('button', { name: 'Төсөв засах' }));
    fireEvent.change(screen.getByLabelText('1-р сарын төсөв'), { target: { value: '999999' } });
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    mocks.auth.user.id = 'user-b';
    page.rerender(<QueryClientProvider client={queryClient}><Page /></QueryClientProvider>);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(screen.queryByLabelText('1-р сарын төсөв')).not.toBeInTheDocument();
    expect(screen.queryByText('Гэрээний нийт дүн')).not.toBeInTheDocument();
    await act(async () => finish(response({ error: 'Хандах эрх алга' }, 403)));
    expect(await screen.findByText('Хандах эрх алга')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Төсөв засах' })).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.any(String), { shopId: 'shop-a' });
});

it('removes financial content when module access is revoked', async () => {
    const queryClient = client();
    const page = render(<QueryClientProvider client={queryClient}><Page /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Төсөв засах' });
    mocks.auth.user.permissions.modules = [];
    page.rerender(<QueryClientProvider client={queryClient}><Page /></QueryClientProvider>);
    expect(screen.getByText('Маркетингийн төсөв харах эрх алга.')).toBeInTheDocument();
    expect(screen.queryByText('Гэрээний нийт дүн')).not.toBeInTheDocument();
});
