import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BlocksPage from './page';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'admin' } }) }));

const fetchMock = vi.mocked(fetch);
let client: QueryClient;

function renderPage() {
    return render(<QueryClientProvider client={client}><BlocksPage /></QueryClientProvider>);
}

const summary = {
    phases: ['Elysium', 'Mandala'],
    summary: [
        { phase: 'Elysium', block: 'A', category: 'residential', total_units: 1, available_units: 1, sold_units: 0, pending_units: 0, total_area: 50 },
        { phase: 'Elysium', block: 'B', category: 'residential', total_units: 1, available_units: 1, sold_units: 0, pending_units: 0, total_area: 50 },
        { phase: 'Elysium', block: 'A', category: 'parking', total_units: 1, available_units: 1, sold_units: 0, pending_units: 0, total_area: 12 },
        { phase: 'Mandala', block: 'A', category: 'residential', total_units: 1, available_units: 1, sold_units: 0, pending_units: 0, total_area: 50 },
    ],
};

function unit(code: string, block: string, phase = 'Elysium', category = 'residential') {
    return {
        id: code, code, phase, block, category, building_number: null, floor: '1',
        unit_type: null, model: null, window_view: null, rooms: category === 'residential' ? 2 : null,
        sale_area: 50, contracted_area: null, status: 'available', raw_status: null,
        sales_channel: null, sales_manager: null, buyer_name: null, buyer_registration: null,
        contract_total_price: null, contract_status: null,
    };
}

function deferredResponse() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((done) => { resolve = done; });
    return { promise, resolve };
}

beforeEach(() => {
    fetchMock.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('блокийн мэдээлэл ачаалах', () => {
    it('shows a rejected summary request and retries instead of reporting an empty inventory', async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json({ error: 'Байр харах эрх хүрэлцэхгүй' }, { status: 403 }))
            .mockResolvedValueOnce(Response.json(summary));

        renderPage();
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Блокийн мэдээллийг ачаалж чадсангүй')).toBeInTheDocument();
        expect(within(alert).getByText('Байр харах эрх хүрэлцэхгүй')).toBeInTheDocument();
        expect(screen.queryByText('Энэ ангилалд блок алга')).not.toBeInTheDocument();

        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByRole('button', { name: /^A/ })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows a failed block request and loads its units after retry', async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json(summary))
            .mockResolvedValueOnce(Response.json({ error: 'Мэдээллийн сан түр ажиллахгүй байна' }, { status: 503 }))
            .mockResolvedValueOnce(Response.json({ units: [unit('ELY-A-1', 'A')] }));

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /^A/ }));
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Нэгжийн мэдээллийг ачаалж чадсангүй')).toBeInTheDocument();
        expect(within(alert).getByText('Мэдээллийн сан түр ажиллахгүй байна')).toBeInTheDocument();
        expect(screen.queryByText('Нэгж алга')).not.toBeInTheDocument();

        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByRole('button', { name: /^ELY-A-1 ·/ })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
    });

    it('keeps the latest block when an earlier request completes last', async () => {
        const first = deferredResponse();
        const second = deferredResponse();
        fetchMock
            .mockResolvedValueOnce(Response.json(summary))
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /^A/ }));
        const firstSignal = fetchMock.mock.calls[1][1]?.signal;
        fireEvent.click(screen.getByRole('button', { name: /^B/ }));
        expect(firstSignal?.aborted).toBe(true);

        await act(async () => second.resolve(Response.json({ units: [unit('ELY-B-1', 'B')] })));
        expect(await screen.findByRole('button', { name: /^ELY-B-1 ·/ })).toBeInTheDocument();
        await act(async () => first.resolve(Response.json({ units: [unit('OLD-A-1', 'A')] })));
        expect(screen.getByRole('button', { name: /^ELY-B-1 ·/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^OLD-A-1 ·/ })).not.toBeInTheDocument();
    });

    it('shows a retryable error when a block request receives a summary payload', async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json(summary))
            .mockResolvedValueOnce(Response.json({ mode: 'summary', phases: [], summary: [] }))
            .mockResolvedValueOnce(Response.json({ units: [unit('ELY-A-1', 'A')] }));

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /^A/ }));
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Нэгжийн мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.')).toBeInTheDocument();
        expect(screen.queryByText('Нэгж алга')).not.toBeInTheDocument();
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByRole('button', { name: /^ELY-A-1 ·/ })).toBeInTheDocument();
    });

    it.each(['phase', 'category'])('ignores the old block response after changing %s', async (filter) => {
        const old = deferredResponse();
        fetchMock
            .mockResolvedValueOnce(Response.json(summary))
            .mockReturnValueOnce(old.promise)
            .mockResolvedValueOnce(Response.json({ units: [unit('CURRENT-A-1', 'A', filter === 'phase' ? 'Mandala' : 'Elysium', filter === 'category' ? 'parking' : 'residential')] }));

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /^A/ }));
        const oldSignal = fetchMock.mock.calls[1][1]?.signal;
        fireEvent.click(screen.getByRole('button', { name: filter === 'phase' ? /^Mandala/ : /^Зогсоол / }));
        expect(oldSignal?.aborted).toBe(true);
        expect(screen.queryByRole('heading', { name: /Блок A/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^A/ }));
        expect(await screen.findByRole('button', { name: /^CURRENT-A-1 ·/ })).toBeInTheDocument();
        await act(async () => old.resolve(Response.json({ units: [unit('OLD-A-1', 'A')] })));
        expect(screen.getByRole('button', { name: /^CURRENT-A-1 ·/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^OLD-A-1 ·/ })).not.toBeInTheDocument();
    });
});
