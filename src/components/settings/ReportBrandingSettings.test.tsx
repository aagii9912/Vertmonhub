// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const shop = '20000000-0000-4000-8000-000000000001';
const cover = `branding/${shop}/30000000-0000-4000-8000-000000000001.png`;
const mocks = vi.hoisted(() => ({
    role: 'admin', permissions: { modules: ['settings'], canWrite: true, canDelete: false },
    json: vi.fn(), mutate: vi.fn(), success: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: '20000000-0000-4000-8000-000000000001' }, user: { id: 'u1', role: mocks.role, permissions: mocks.permissions } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: vi.fn() } }));
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(), dashboardJson: mocks.json, dashboardMutate: mocks.mutate,
}));

import { ReportBrandingSettings } from './ReportBrandingSettings';

const saved = { available: true, branding: { displayName: 'ЭЛИЗИУМ', footerText: null, coverImagePath: cover, logoPath: null, updatedAt: '2026-10-23T02:00:00.123456+00:00' } };
function open() {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><ReportBrandingSettings /></QueryClientProvider>);
    return cache;
}

beforeEach(() => {
    mocks.role = 'admin';
    mocks.permissions = { modules: ['settings'], canWrite: true, canDelete: false };
    mocks.json.mockResolvedValue(saved);
});
afterEach(() => { vi.clearAllMocks(); });

describe('report branding settings', () => {
    it('shows the saved branding and saves every field with the read version', async () => {
        mocks.mutate.mockResolvedValue({ ...saved, branding: { ...saved.branding, footerText: 'ВЕРТМОН ПРОПЕРТИС', updatedAt: '2026-10-23T03:00:00+00:00' } });
        const cache = open();
        expect(await screen.findByDisplayValue('ЭЛИЗИУМ')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Нүүрний зураг' })).toHaveAttribute('src', `/api/dashboard/report-branding/media?path=${encodeURIComponent(cover)}`);
        const save = screen.getByRole('button', { name: /Хадгалах/ });
        expect(save).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Хөл бичвэр'), { target: { value: 'ВЕРТМОН ПРОПЕРТИС' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хасах' }));
        fireEvent.click(save);
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
        expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/report-branding', 'PUT', {
            displayName: 'ЭЛИЗИУМ', footerText: 'ВЕРТМОН ПРОПЕРТИС', coverImagePath: null, logoPath: null, expectedUpdatedAt: '2026-10-23T02:00:00.123456+00:00',
        }, { shopId: shop });
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Тайлангийн брэнд хадгалагдлаа'));
        cache.clear();
    });

    it('after a conflict keeps only the user\'s own edits and takes a colleague\'s new image from the server', async () => {
        const logo = (n: number) => `branding/${shop}/40000000-0000-4000-8000-00000000000${n}.png`;
        const opened = { available: true, branding: { ...saved.branding, logoPath: logo(1) } };
        // B хадгалсны дараах серверийн утга: лого image 2, шинэ хувилбар.
        const afterColleague = { available: true, branding: { ...saved.branding, logoPath: logo(2), updatedAt: '2026-10-23T04:00:00+00:00' } };
        mocks.json.mockResolvedValueOnce(opened).mockResolvedValue(afterColleague);
        mocks.mutate.mockRejectedValueOnce(new Error('Брэндийг өөр хүн өөрчилсөн байна. Шинэчлээд дахин оролдоно уу.'))
            .mockResolvedValueOnce({ available: true, branding: { ...afterColleague.branding, footerText: 'А', updatedAt: '2026-10-23T05:00:00+00:00' } });
        const cache = open();
        await screen.findByDisplayValue('ЭЛИЗИУМ');
        fireEvent.change(screen.getByLabelText('Хөл бичвэр'), { target: { value: 'А' } });
        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));
        expect(await screen.findByText(/өөр хүн өөрчилсөн/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('img', { name: 'Лого' })).toHaveAttribute('src', `/api/dashboard/report-branding/media?path=${encodeURIComponent(logo(2))}`));
        expect(screen.getByLabelText('Хөл бичвэр')).toHaveValue('А');
        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
        expect(mocks.mutate).toHaveBeenLastCalledWith('/api/dashboard/report-branding', 'PUT', {
            displayName: 'ЭЛИЗИУМ', footerText: 'А', coverImagePath: cover, logoPath: logo(2), expectedUpdatedAt: '2026-10-23T04:00:00+00:00',
        }, { shopId: shop });
        cache.clear();
    });

    it('is read-only without settings write and explains a missing table', async () => {
        mocks.permissions = { modules: ['settings', 'reports'], canWrite: false, canDelete: false };
        const cache = open();
        expect(await screen.findByDisplayValue('ЭЛИЗИУМ')).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Хадгалах/ })).not.toBeInTheDocument();
        expect(screen.getByText('Засахад «Тохиргоо»-ны бичих эрх шаардлагатай.')).toBeInTheDocument();
        cache.clear();

        mocks.permissions = { modules: ['settings'], canWrite: true, canDelete: false };
        mocks.json.mockResolvedValue({ available: false, branding: { displayName: null, footerText: null, coverImagePath: null, logoPath: null, updatedAt: null } });
        const second = open();
        expect(await screen.findByText(/хараахан идэвхжээгүй/)).toBeInTheDocument();
        second.clear();
    });

    it('stays hidden for users without reports or settings', () => {
        mocks.permissions = { modules: ['leads'], canWrite: true, canDelete: false };
        const cache = open();
        expect(screen.queryByText('Тайлангийн брэнд')).not.toBeInTheDocument();
        expect(mocks.json).not.toHaveBeenCalled();
        cache.clear();
    });
});
