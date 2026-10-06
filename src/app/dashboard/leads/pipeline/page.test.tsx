// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({
    json: vi.fn(), fetch: vi.fn(),
    list: {} as Record<string, unknown>,
    summary: {} as Record<string, unknown>,
    failSummary: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'admin', permissions: { modules: ['leads'], canWrite: true } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PipelinePage from './page';

const investor = '00000000-0000-4000-8000-0000000000a1';
const card = { id: 'lead-1', customer_name: 'Энхжин', customer_phone: '88112233', status: 'new', source: 'facebook', budget_min: null, budget_max: 300_000_000,
    preferred_type: null, urgency: 'normal', next_followup_at: null, stage_changed_at: '2026-10-02T02:00:00Z', lost_reason: null, category_id: investor, created_at: '2026-10-02T02:00:00Z' };
const stage = (status: string, count = 0, value = 0, stalled = 0, noNextStep = 0) => ({ status, count, value, stalled, noNextStep });

beforeEach(() => {
    transport.failSummary = false;
    transport.list = { leads: [card], pagination: { total: 2345 } };
    transport.summary = { stages: [
        stage('new', 1234, 2_000_000_000, 40, 300), stage('contacted'), stage('viewing_scheduled'), stage('offered'),
        stage('negotiating', 11, 1_000_000_000, 2, 3), stage('closed_won', 1000, 5_000_000_000), stage('closed_lost', 100),
    ] };
    transport.json.mockImplementation(async (url: string) => {
        if (url.startsWith('/api/dashboard/lead-categories')) return { categories: [{ id: investor, name: 'Хөрөнгө оруулагч', description: null, tone: 'success', sort_order: 10, is_active: true }] };
        if (url.startsWith('/api/dashboard/leads/pipeline-summary')) {
            if (transport.failSummary) throw new Error('Pipeline-ийн тоог гаргаж чадсангүй. Дахин оролдоно уу.');
            return transport.summary;
        }
        if (url.startsWith('/api/dashboard/leads?')) return transport.list;
        throw new Error(`unexpected ${url}`);
    });
});
afterEach(() => { vi.clearAllMocks(); });

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PipelinePage /></QueryClientProvider>);

it('takes column counts, values and hygiene from every lead and says the cards are only the newest 1,000', async () => {
    renderPage();
    expect(await screen.findByText('Картын жагсаалт бүрэн биш: 2,345 лидээс хамгийн сүүлд бүртгэгдсэн 1 лидийн карт харагдаж байна')).toBeInTheDocument();
    expect(screen.getByText('2,345 лийд • Чирж зөөнө үү')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('1 / 1,234 карт харагдаж байна')).toBeInTheDocument();
    expect(screen.getByText('0 / 1,000 карт харагдаж байна')).toBeInTheDocument();
    // Нээлттэй = 3 тэрбум, жинлэсэн = 2 тэрбум×0.1 + 1 тэрбум×0.8, хаасан = 5 тэрбум.
    expect(screen.getByText('3 тэрбум ₮')).toBeInTheDocument();
    expect(screen.getByText('1 тэрбум ₮', { selector: '.text-brand-strong' })).toBeInTheDocument();
    expect(screen.getByText('5 тэрбум ₮', { selector: '.text-status-success' })).toBeInTheDocument();
    expect(screen.getByText('42 зогссон лийд')).toBeInTheDocument();
    expect(screen.getByText('303 дараагийн алхамгүй')).toBeInTheDocument();
    expect(screen.getByText('Энхжин')).toBeInTheDocument();
});

it('does not warn when every card is loaded', async () => {
    transport.list = { leads: [card], pagination: { total: 1 } };
    transport.summary = { stages: [stage('new', 1, 300_000_000, 0, 1), ...['contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'].map(s => stage(s))] };
    renderPage();
    expect(await screen.findByText('Энхжин')).toBeInTheDocument();
    expect(screen.queryByText(/Картын жагсаалт бүрэн биш/)).not.toBeInTheDocument();
    expect(screen.queryByText(/карт харагдаж байна/)).not.toBeInTheDocument();
});

it('filters both the cards and the counts by category on the server', async () => {
    renderPage();
    await screen.findByText('Энхжин');
    fireEvent.change(screen.getByRole('combobox', { name: 'Ангилал' }), { target: { value: investor } });
    await waitFor(() => {
        const urls = transport.json.mock.calls.map(([url]) => url);
        expect(urls).toContain(`/api/dashboard/leads?pageSize=1000&category=${investor}`);
        expect(urls).toContain(`/api/dashboard/leads/pipeline-summary?category=${investor}`);
    });
});

it('shows an error with retry instead of a board without counts when the summary fails', async () => {
    transport.failSummary = true;
    renderPage();
    expect(await screen.findByText('Лийд татахад алдаа')).toBeInTheDocument();
    expect(screen.getByText('Pipeline-ийн тоог гаргаж чадсангүй. Дахин оролдоно уу.')).toBeInTheDocument();
    expect(screen.queryByText('Энхжин')).not.toBeInTheDocument();
    transport.failSummary = false;
    fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
    expect(await screen.findByText('Энхжин')).toBeInTheDocument();
});
