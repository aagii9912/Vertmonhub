import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickCreateSheet } from '../QuickCreateSheet';
import { openQuickCreate } from '@/lib/navigation/commandPalette';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-a', role: 'sales_manager' }, shop: { id: 'shop-a' } }) }));
vi.mock('@/hooks/useLeads', () => ({ useLeadProjects: () => ({ data: [], isLoading: false }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({
    dashboardFetch: (...args: unknown[]) => mocks.fetch(...args),
    dashboardMutate: (...args: unknown[]) => mocks.mutate(...args),
}));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: (...args: unknown[]) => mocks.error(...args) } }));

function renderSheet() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><QuickCreateSheet /></QueryClientProvider>);
    act(() => openQuickCreate('task'));
    return { invalidate };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ task: { id: 'task-1' } }) });
});

describe('«Ажил нэмэх» quick create', () => {
    it('opens the personal task form, not the new-lead form', async () => {
        renderSheet();
        expect(await screen.findByRole('heading', { name: 'Шинэ ажил' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Гарчиг' })).toHaveFocus();
        expect(screen.queryByRole('heading', { name: 'Шинэ лид' })).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Ж: Г. Энхжин')).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Сануулга' })).toBeDisabled();
    });

    it('shows an inline error instead of posting an empty title', async () => {
        renderSheet();
        fireEvent.click(await screen.findByRole('button', { name: /^Хадгалах/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Гарчиг хоосон байна');
        expect(screen.getByRole('textbox', { name: 'Гарчиг' })).toHaveAttribute('aria-invalid', 'true');
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('posts to the personal tasks API with the due time read in Ulaanbaatar time', async () => {
        const { invalidate } = renderSheet();
        fireEvent.change(await screen.findByRole('textbox', { name: 'Гарчиг' }), { target: { value: '  Болдод үнийн санал илгээх ' } });
        fireEvent.change(screen.getByLabelText('Дуусах хугацаа'), { target: { value: '2026-10-06T09:30' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Сануулга' }), { target: { value: '15' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Тэмдэглэл' }), { target: { value: 'Үнийн жагсаалт хавсаргах' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));

        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
        const [url, init] = mocks.fetch.mock.calls[0];
        expect(url).toBe('/api/dashboard/tasks');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
            title: 'Болдод үнийн санал илгээх',
            note: 'Үнийн жагсаалт хавсаргах',
            dueAt: '2026-10-06T01:30:00.000Z',
            remindAt: '2026-10-06T01:15:00.000Z',
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mocks.success).toHaveBeenCalledWith('Ажил нэмэгдлээ');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-tasks'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-stats'] });
        expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('keeps the form and shows the server error inline when saving fails', async () => {
        mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Ажлын жагсаалтын хүснэгт үүсээгүй байна' }) });
        renderSheet();
        fireEvent.change(await screen.findByRole('textbox', { name: 'Гарчиг' }), { target: { value: 'Гэрээ шалгах' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Ажлын жагсаалтын хүснэгт үүсээгүй байна');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Гарчиг' })).toHaveValue('Гэрээ шалгах');
        expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ title: 'Гэрээ шалгах', note: null, dueAt: null, remindAt: null });
    });
});
