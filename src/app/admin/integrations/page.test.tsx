// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminIntegrationsPage from './page';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const renderPage = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><AdminIntegrationsPage /></QueryClientProvider>);
};

const status = (patch: Record<string, unknown> = {}) => ({
    config: { pushConfigured: true, pullConfigured: true },
    project: { id: 'p1', name: 'Elysium Residence' },
    storageReady: true,
    state: {
        enabled: false, cursor_at: '2026-10-04T03:45:00.000Z', last_attempt_at: '2026-10-04T04:00:00.000Z',
        last_success_at: '2026-10-04T04:00:00.000Z', last_error: null, last_result: { sourceTotal: 214 }, updated_at: null,
    },
    totals: { imported: 12, matched: 198, invalid: 4 },
    recent: [
        { source_id: 's1', outcome: 'imported', lead_id: 'l1', source_name: 'Бат', source_created_at: '2026-10-04T02:00:00.000Z', detail: null, processed_at: '2026-10-04T04:00:00.000Z' },
        { source_id: 's2', outcome: 'matched', lead_id: 'l2', source_name: 'Сараа', source_created_at: '2026-10-04T01:00:00.000Z', detail: 'Дахин хүсэлтийг лидийн түүхэнд нэмсэн', processed_at: '2026-10-04T04:00:00.000Z' },
    ],
    invalid: [
        { source_id: 's3', outcome: 'invalid', lead_id: null, source_name: 'Нэргүй', source_created_at: '2026-10-03T01:00:00.000Z', detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу', processed_at: '2026-10-04T04:00:00.000Z' },
    ],
    settleMinutes: 15,
    ...patch,
});
const result = (patch: Record<string, unknown> = {}) => ({
    status: 'ok', dryRun: false, since: null, until: '2026-10-04T03:45:00.000Z', sourceTotal: 214, read: 3, pending: 3,
    imported: 1, matched: 1, invalid: 1, failed: 0, remaining: 0, repeats: 0,
    sample: [{ sourceId: 'x1', createdAt: '2026-10-04T02:00:00.000Z', name: 'Дорж', outcome: 'imported', detail: null }],
    ...patch,
});

const calls: Array<{ method: string; body: unknown }> = [];
let current = status();
beforeEach(() => {
    calls.length = 0;
    current = status();
    toast.success.mockClear();
    toast.error.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
        if (input !== '/api/admin/integrations/elysium') throw new Error(`Unexpected request: ${input}`);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, body });
        if (method === 'GET') return { ok: true, json: async () => current };
        if (method === 'POST') return { ok: true, json: async () => ({ result: result({ dryRun: body.dryRun }) }) };
        if (method === 'PATCH') {
            current = status({ state: { ...current.state, enabled: body.enabled } });
            return { ok: true, json: async () => ({ enabled: body.enabled }) };
        }
        throw new Error(`Unexpected method ${method}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

describe('admin integrations: Elysium', () => {
    it('shows configuration, totals, recent and invalid requests', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: 'Elysium сайт (elysium.mn)' })).toBeInTheDocument();
        expect(screen.getByText('Elysium Residence')).toBeInTheDocument();
        expect(screen.getByText('Унтраалттай')).toBeInTheDocument();
        expect(screen.getByText('214')).toBeInTheDocument();
        expect(screen.getByText('198')).toBeInTheDocument();
        const recent = screen.getByRole('table', { name: 'Сүүлийн хүсэлтүүд' });
        expect(within(recent).getByText('Шинээр орсон')).toBeInTheDocument();
        expect(within(recent).getByText('CRM-д байсан')).toBeInTheDocument();
        expect(within(recent).getByText('2026-10-04 10:00')).toBeInTheDocument();
        const invalid = screen.getByRole('table', { name: 'Шалгах шаардлагатай хүсэлтүүд' });
        expect(within(invalid).getByText('Утас, и-мэйл хоёул хоосон эсвэл буруу')).toBeInTheDocument();
    });

    it('previews with a dry run, then pulls and reloads the status', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Шалгах/ }));
        expect(await screen.findByText('Шалгалтын үр дүн (юу ч хадгалаагүй)')).toBeInTheDocument();
        expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ dryRun: true });
        expect(toast.success).toHaveBeenCalledWith('Шалгалт: шинээр 1 · CRM-д байсан 1 · алдаатай 1. Юу ч хадгалаагүй.');
        expect(within(screen.getByRole('table', { name: 'Шалгалтын жишээ' })).getByText('Дорж')).toBeInTheDocument();

        const loads = calls.filter((call) => call.method === 'GET').length;
        fireEvent.click(screen.getByRole('button', { name: /Одоо татах/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Татаж дууслаа: шинээр 1 · CRM-д байсан 1 · алдаатай 1'));
        expect(calls.filter((call) => call.method === 'POST').map((call) => call.body)).toEqual([{ dryRun: true }, { dryRun: false }]);
        await waitFor(() => expect(calls.filter((call) => call.method === 'GET').length).toBeGreaterThan(loads));
        expect(screen.queryByText('Шалгалтын үр дүн (юу ч хадгалаагүй)')).not.toBeInTheDocument();
    });

    it('turns the 15-minute schedule on', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('switch', { name: 'Автомат татах (15 минут тутам)' }));
        await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ enabled: true }));
        expect(await screen.findByText('Идэвхтэй')).toBeInTheDocument();
        expect(toast.success).toHaveBeenCalledWith('Автомат татах асаалаа');
    });

    it('explains missing credentials and disables the actions', async () => {
        current = status({ config: { pushConfigured: true, pullConfigured: false }, state: null, totals: { imported: 0, matched: 0, invalid: 0 }, recent: [], invalid: [] });
        renderPage();
        expect(await screen.findByText(/ELYSIUM_SUPABASE_URL, ELYSIUM_SUPABASE_SERVICE_KEY/)).toBeInTheDocument();
        expect(screen.getByText('Тохируулаагүй', { selector: '[data-slot="status-pill"]' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Шалгах/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Одоо татах/ })).toBeDisabled();
        expect(screen.getByRole('switch', { name: 'Автомат татах (15 минут тутам)' })).toBeDisabled();
        expect(screen.getByText('Одоогоор тулгасан хүсэлт алга.')).toBeInTheDocument();
    });
});
