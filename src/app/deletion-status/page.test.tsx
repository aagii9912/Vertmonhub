// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
    status: 'completed' as string | null,
    error: null as Error | null,
    adminThrows: false,
    queried: [] as string[],
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => {
        if (state.adminThrows) throw new Error('Supabase env missing');
        const query = {
            select: () => query,
            eq: (_key: string, value: string) => { state.queried.push(value); return query; },
            order: () => query,
            limit: () => query,
            maybeSingle: async () => ({ data: state.status ? { status: state.status } : null, error: state.error }),
        };
        return { from: () => query };
    },
}));

import DeletionStatusPage from './page';

const code = '0123456789abcdef0123456789abcdef';
const renderPage = async (id?: string) => render(await DeletionStatusPage({ searchParams: Promise.resolve(id === undefined ? {} : { id }) }));

beforeEach(() => {
    state.status = 'completed';
    state.error = null;
    state.adminThrows = false;
    state.queried = [];
});

describe('/deletion-status', () => {
    it('shows completion only when the recorded request is completed', async () => {
        await renderPage(code);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Өгөгдөл устгагдсан');
        expect(screen.getByText('Устгасан')).toBeInTheDocument();
        expect(screen.getByText(code)).toBeInTheDocument();
        expect(state.queried).toEqual([code]);
    });

    it('shows a received, unfinished request without claiming deletion', async () => {
        state.status = 'pending';
        await renderPage(code);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Хүсэлтийг хүлээн авлаа');
        expect(screen.getByText('Хүлээн авсан')).toBeInTheDocument();
        expect(screen.queryByText(/устгагдсан/i)).not.toBeInTheDocument();
    });

    it('reports unknown or missing codes as not found', async () => {
        state.status = null;
        const { unmount } = await renderPage(code);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Хүсэлт олдсонгүй');
        unmount();

        await renderPage();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Хүсэлт олдсонгүй');
        expect(screen.queryByText('Баталгаажуулах код:')).not.toBeInTheDocument();
        expect(state.queried).toEqual([code]);
    });

    it('says the status is unavailable when it cannot be read', async () => {
        state.error = new Error('db down');
        const { unmount } = await renderPage(code);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Төлөвийг шалгаж чадсангүй');
        unmount();

        state.adminThrows = true;
        await renderPage(code);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Төлөвийг шалгаж чадсангүй');
    });

    it('lists what the CRM stores instead of the removed e-commerce data', async () => {
        await renderPage(code);
        expect(screen.getByText(/Facebook Messenger, Instagram-аар бидэнд бичсэн мессежүүд/)).toBeInTheDocument();
        expect(screen.getByText(/Холбоо барих мэдээлэл/)).toBeInTheDocument();
        expect(screen.queryByText(/Захиалгын түүх/)).not.toBeInTheDocument();
        expect(screen.queryByText(/AI-тай харилцсан/)).not.toBeInTheDocument();
    });
});
