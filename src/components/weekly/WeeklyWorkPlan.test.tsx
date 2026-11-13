// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkPlanData } from '@/lib/sales/work-plan';

const mocks = vi.hoisted(() => ({ json: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: (...args: unknown[]) => mocks.error(...args) } }));
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(), dashboardJson: mocks.json, dashboardMutate: mocks.mutate,
}));

import { WeeklyWorkPlan } from './WeeklyWorkPlan';

const chantsal = { id: '00000000-0000-4000-8000-0000000000a3', name: 'Чанцалдулам.Раднаа' };
const khongor = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Хонгорзул.Мөнхгэрэл' };
const item = (n: number, over: Partial<WorkPlanData['items'][number]>): WorkPlanData['items'][number] => ({
    id: `00000000-0000-4000-8000-0000000000b${n}`, month: '2026-11', title: `Ажил ${n}`, assignees: [], done: false, done_at: null, done_by_name: null,
    created_by: 'user-1', created_by_name: 'Чанцал', sort_order: n * 10, ...over,
});
const plan = (over: Partial<WorkPlanData> = {}): WorkPlanData => ({
    month: '2026-11', available: true, roster: [khongor, chantsal],
    items: [
        item(1, { title: 'Showroom тохижуулах', assignees: [chantsal, khongor], done: true, done_at: '2026-11-12T03:00:00Z', done_by_name: 'Чанцал' }),
        item(2, { title: 'Төлөвлөлтийн санал өгөх', created_by: 'user-2' }),
    ],
    ...over,
});

function open(data: WorkPlanData, props: Partial<{ canWrite: boolean; canDeleteOthers: boolean }> = {}) {
    mocks.json.mockResolvedValue(data);
    mocks.mutate.mockResolvedValue({ item: data.items[0] ?? null, ok: true });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><WeeklyWorkPlan month="2026-11" canWrite={props.canWrite ?? true} canDeleteOthers={props.canDeleteOthers ?? false} /></QueryClientProvider>);
    return cache;
}

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('сарын ажлын төлөвлөгөө (хурлын хуудас)', () => {
    it('shows the month\'s items with progress, assignee initials and who checked a done item', async () => {
        open(plan());
        expect(await screen.findByText('Showroom тохижуулах')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/work-plan?month=2026-11', expect.objectContaining({ shopId: 'shop-1' }));
        expect(screen.getByText('1/2')).toBeInTheDocument();
        const done = screen.getByText('Showroom тохижуулах').closest('li')!;
        expect(within(done).getByRole('checkbox', { name: 'Showroom тохижуулах: хийгдсэн' })).toBeChecked();
        expect(within(done).getByText('Ч')).toBeInTheDocument();
        expect(within(done).getByText('Х')).toBeInTheDocument();
        expect(within(done).getByText('· ✓ Чанцал')).toBeInTheDocument();
        expect(within(screen.getByText('Төлөвлөлтийн санал өгөх').closest('li')!).getByText('Хариуцагчгүй')).toBeInTheDocument();
    });

    it('checks an item off and changes its assignees through PATCH', async () => {
        open(plan());
        const row = (await screen.findByText('Төлөвлөлтийн санал өгөх')).closest('li')!;
        fireEvent.click(within(row).getByRole('checkbox', { name: 'Төлөвлөлтийн санал өгөх: хийгдсэн' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/work-plan/00000000-0000-4000-8000-0000000000b2', 'PATCH', { done: true }, { shopId: 'shop-1' }));
        fireEvent.click(within(row).getByRole('button', { name: 'Хариуцагч' }));
        const picker = within(row).getByRole('group', { name: 'Төлөвлөлтийн санал өгөх: хариуцагч' });
        fireEvent.click(within(picker).getByRole('button', { name: 'Бүх баг' }));
        expect(within(picker).getByRole('button', { name: 'Чанцалдулам' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(picker).getByRole('button', { name: 'Хонгорзул' }));
        fireEvent.click(within(row).getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/work-plan/00000000-0000-4000-8000-0000000000b2', 'PATCH', { assigneeIds: [chantsal.id] }, { shopId: 'shop-1' }));
    });

    it('adds an item with the chosen assignees and clears the form', async () => {
        open(plan({ items: [] }));
        expect(await screen.findByText('Энэ сарын ажил хараахан нэмэгдээгүй.')).toBeInTheDocument();
        const add = screen.getByRole('button', { name: 'Ажил нэмэх' });
        expect(add).toBeDisabled();
        const input = screen.getByRole('textbox', { name: 'Шинэ ажлын нэр' });
        fireEvent.change(input, { target: { value: 'Борлуулалтын оффис' } });
        fireEvent.click(within(screen.getByRole('group', { name: 'Шинэ ажлын хариуцагч' })).getByRole('button', { name: 'Хонгорзул' }));
        fireEvent.click(add);
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/work-plan', 'POST', { month: '2026-11', title: 'Борлуулалтын оффис', assigneeIds: [khongor.id] }, { shopId: 'shop-1' }));
        await waitFor(() => expect(input).toHaveValue(''));
        expect(mocks.success).toHaveBeenCalledWith('Ажил нэмэгдлээ');
    });

    it('lets a writer delete only their own items unless they hold the delete permission; a reader changes nothing', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const cache = open(plan());
        await screen.findByText('Showroom тохижуулах');
        expect(screen.getByRole('button', { name: 'Showroom тохижуулах: устгах' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Төлөвлөлтийн санал өгөх: устгах' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Showroom тохижуулах: устгах' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/work-plan/00000000-0000-4000-8000-0000000000b1', 'DELETE', undefined, { shopId: 'shop-1' }));
        cache.clear();
    });

    it('is read-only without write access and says so when the table is not installed', async () => {
        open(plan(), { canWrite: false });
        expect(await screen.findByRole('checkbox', { name: 'Showroom тохижуулах: хийгдсэн' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Ажил нэмэх' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Хариуцагч' })).not.toBeInTheDocument();
    });

    it('explains a missing table instead of showing an empty plan', async () => {
        open(plan({ available: false, items: [] }));
        expect(await screen.findByText(/хараахан идэвхжээгүй байна/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ажил нэмэх' })).not.toBeInTheDocument();
    });
});
