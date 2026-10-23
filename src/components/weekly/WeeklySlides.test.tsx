// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WeeklySlide } from '@/lib/dashboard/weekly-slides';

const mocks = vi.hoisted(() => ({ json: vi.fn(), mutate: vi.fn(), success: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: vi.fn() } }));
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(), dashboardJson: mocks.json, dashboardMutate: mocks.mutate,
}));

import { WeeklySlides } from './WeeklySlides';

const meetingDate = '2026-10-21';
const previous: WeeklySlide = {
    id: '00000000-0000-4000-8000-000000000101', meeting_date: '2026-10-14', part: 'sales', section: 'plan', title: '10-р сарын бусад ажлын төлөвлөгөө',
    note: 'Showroom тохижуулах\nБорлуулалтын оффис', image_paths: [], position: 0, author_id: 'user-2', author_name: 'Бат', updated_at: '2026-10-13T00:00:00Z',
};

function open() {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = { data: { slides: [], parts: ['sales'] }, isPending: false, isError: false } as never;
    render(<QueryClientProvider client={cache}><WeeklySlides part="sales" meetingDate={meetingDate} query={query} canWrite canDelete={false} /></QueryClientProvider>);
    return cache;
}

afterEach(() => { vi.clearAllMocks(); });

describe('weekly slides (sales part)', () => {
    it('lets a slide carry up to nine photos', async () => {
        const cache = open();
        fireEvent.click(screen.getByRole('button', { name: /Слайд нэмэх/ }));
        expect(await screen.findByText('Зураг (0/9)')).toBeInTheDocument();
        cache.clear();
    });

    it('previews and copies the previous meeting\'s text slides of the plan section', async () => {
        mocks.json.mockResolvedValue({ from: '2026-10-14', slides: [previous] });
        mocks.mutate.mockResolvedValue({ copied: [{ ...previous, meeting_date: meetingDate }], skipped: 0, from: '2026-10-14' });
        const cache = open();
        fireEvent.click(screen.getByRole('button', { name: /Өмнөх хурлаас хуулах/ }));
        expect(await screen.findByText('10-р сарын бусад ажлын төлөвлөгөө')).toBeInTheDocument();
        expect(screen.getByText(/2026-10-14-ны хурлаас 1 слайд/)).toBeInTheDocument();
        expect(mocks.json).toHaveBeenCalledWith(`/api/dashboard/weekly-slides/copy?meetingDate=${meetingDate}&part=sales&section=plan`, expect.objectContaining({ shopId: 'shop-1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Хуулах' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/weekly-slides/copy', 'POST', { meetingDate, part: 'sales', section: 'plan' }, { shopId: 'shop-1' }));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('1 слайд хуулагдлаа'));
        cache.clear();
    });

    it('says when there is nothing to copy', async () => {
        mocks.json.mockResolvedValue({ from: null, slides: [] });
        const cache = open();
        fireEvent.click(screen.getByRole('button', { name: /Өмнөх хурлаас хуулах/ }));
        expect(await screen.findByText('Өмнөх хурлуудад энэ сэдвийн зураггүй слайд алга.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Хуулах' })).toBeDisabled();
        cache.clear();
    });
});
