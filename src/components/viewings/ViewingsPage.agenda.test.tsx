import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewingsPage } from './ViewingsPage';

/**
 * «Уулзалт» v3: 7 хоногийн мөр, УБ өдрөөр бүлэглэсэн хуваарь, цагийн бүсийн засвар.
 * Хөтөч UTC бүст (TZ=UTC), одоо = 2026-10-06 09:00 УБ (Мягмар) = 01:00 UTC.
 */

type Row = {
    id: string; scheduled_at: string; status: string; meeting_type: string | null; interest_level: number | null;
    sales_manager_name: string | null; agent_notes: string | null;
    lead: { id: string; customer_name: string | null; customer_phone: string | null; status: string } | null;
    property: { id: string; name: string; district: string | null } | null;
};

const NOW = new Date('2026-10-06T01:00:00Z');
const START = Date.parse('2026-10-05T16:00:00Z'); // УБ 10-06 00:00
const END = START + 86_400_000;

const mocks = vi.hoisted(() => ({
    viewings: [] as Row[], params: [] as { range: string; status?: string; manager?: string }[],
    search: '', canWrite: true,
    create: vi.fn(), mutate: vi.fn(), mutateAsync: vi.fn(), replace: vi.fn(), error: vi.fn(), success: vi.fn(),
}));

function viewing(id: string, scheduled_at: string, name: string | null, extra: Partial<Row> = {}): Row {
    return {
        id, scheduled_at, status: 'scheduled', meeting_type: 'new_customer', interest_level: null, sales_manager_name: 'Номин', agent_notes: null,
        lead: { id: `lead-${id}`, customer_name: name, customer_phone: '99112230', status: 'contacted' },
        property: { id: 'p-1', name: 'Мандала · B блок · 1204', district: 'Хан-Уул' },
        ...extra,
    };
}

function result(range: string) {
    const at = (v: Row) => Date.parse(v.scheduled_at);
    const rows = mocks.viewings.filter((v) => range === 'today' ? at(v) >= START && at(v) < END : range === 'upcoming' ? at(v) >= START : range === 'past' ? at(v) < START : true);
    const scheduled = (from: number, to = Infinity) => mocks.viewings.filter((v) => v.status === 'scheduled' && at(v) >= from && at(v) < to).length;
    return { viewings: rows, counts: { today: scheduled(START, END), upcoming: scheduled(START), past: mocks.viewings.filter((v) => at(v) < START).length } };
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'sales_manager', permissions: { modules: ['viewings'], canWrite: mocks.canWrite } } }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, warning: vi.fn(), error: mocks.error } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadDetail: (id: string | null) => ({ data: id ? { lead: { id, customer_name: 'Б. Энхжин', customer_phone: '99112230', status: 'contacted', project_id: 'mandala' } } : undefined, isLoading: false }),
    useManagers: () => ({ data: [] }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }], isLoading: false }),
}));
vi.mock('@/hooks/useViewings', () => ({
    useViewings: (params: { range: string; status?: string; manager?: string }) => {
        mocks.params.push(params);
        return { data: result(params.range), isLoading: false };
    },
    useCreateViewing: () => ({ mutateAsync: mocks.create, isPending: false }),
    useUpdateViewing: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync, isPending: false }),
    usePropertySearch: () => ({ data: [], isFetching: false }),
}));

const originalTz = process.env.TZ;
beforeEach(() => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.clearAllMocks();
    mocks.params.length = 0;
    mocks.search = '';
    mocks.canWrite = true;
    mocks.create.mockResolvedValue({ viewing: { id: 'new' } });
    mocks.mutateAsync.mockResolvedValue({ viewing: { id: 'v-today' } });
    mocks.viewings = [
        viewing('v-early', '2026-10-05T23:30:00Z', 'Н. Оюун'), // УБ өнөөдөр 07:30 — хоцорсон
        viewing('v-today', '2026-10-06T02:00:00Z', 'Б. Энхжин', { agent_notes: '3 өрөөний зохион байгуулалт' }), // УБ өнөөдөр 10:00
        viewing('v-midnight', '2026-10-06T16:30:00Z', 'Г. Тэмүүлэн', { meeting_type: 'repeat_customer' }), // УБ маргааш 00:30 (UTC-ээр өнөөдөр)
        viewing('v-thu', '2026-10-08T03:00:00Z', null, { sales_manager_name: null, property: null }), // нэргүй лид, УБ пүрэв 11:00
        viewing('v-thu-cancelled', '2026-10-08T05:00:00Z', 'А. Сараа', { status: 'cancelled' }),
        viewing('v-past', '2026-10-03T03:00:00Z', 'О. Бат', { status: 'completed', interest_level: 4 }),
    ];
});
afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
});

const strip = () => screen.getByRole('region', { name: 'Ойрын 7 хоног' });
const ranges = () => screen.getByRole('group', { name: 'Хугацаа' });

describe('Уулзалт — өдрийн хуваарь ба ойрын 7 хоног', () => {
    it('shows today in Ulaanbaatar time, the 7-day strip with scheduled counts and one agenda group per day', () => {
        render(<ViewingsPage />);
        expect(screen.getByRole('heading', { level: 1, name: 'Уулзалт' })).toBeInTheDocument();
        expect(screen.getByText('10-р сарын 6, Мягмар · 2 уулзалт өнөөдөр')).toBeInTheDocument();

        const days = within(strip()).getAllByRole('button');
        expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
            'Өнөөдөр · Мягмар, 10-р сарын 6: 2 уулзалт',
            'Маргааш · Лхагва, 10-р сарын 7: 1 уулзалт',
            'Пүрэв, 10-р сарын 8: 1 уулзалт', // цуцалсан уулзалт тоологдохгүй
            'Баасан, 10-р сарын 9: уулзалтгүй',
            'Бямба, 10-р сарын 10: уулзалтгүй',
            'Ням, 10-р сарын 11: уулзалтгүй',
            'Даваа, 10-р сарын 12: уулзалтгүй',
        ]);
        expect(days[0]).toHaveAttribute('aria-current', 'date');
        expect(days.every((d) => d.getAttribute('aria-pressed') === 'false')).toBe(true);

        // Анхдагч «Удахгүй»: өдрийн бүлэг «Өнөөдөр», «Маргааш», гараг + огноо. Шөнө дундын (UTC-ээр өмнөх өдөр) уулзалт маргаашид.
        expect(within(ranges()).getByRole('button', { name: /Удахгүй/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
            'Өнөөдөр · Мягмар, 10-р сарын 6', 'Маргааш · Лхагва, 10-р сарын 7', 'Пүрэв, 10-р сарын 8',
        ]);
        const tomorrow = screen.getByRole('region', { name: /^Маргааш/ });
        expect(within(tomorrow).getByRole('link', { name: 'Г. Тэмүүлэн' })).toHaveAttribute('href', '/dashboard/leads?lead=lead-v-midnight');
        expect(within(tomorrow).getByText('00:30')).toBeInTheDocument();

        // Уулзалт бүр нэг л удаа.
        for (const name of ['Н. Оюун', 'Б. Энхжин', 'Г. Тэмүүлэн', 'А. Сараа', 'Нэргүй харилцагч']) expect(screen.getAllByText(name)).toHaveLength(1);
        expect(screen.queryByText('О. Бат')).not.toBeInTheDocument();
    });

    it('lists time, customer card link, phone, property, manager, meeting type and status on each row', () => {
        render(<ViewingsPage />);
        const row = screen.getByRole('link', { name: 'Б. Энхжин' }).closest('li')!;
        expect(within(row).getByText('10:00')).toBeInTheDocument();
        expect(within(row).getByRole('link', { name: 'Б. Энхжин' })).toHaveAttribute('href', '/dashboard/leads?lead=lead-v-today');
        expect(within(row).getByRole('link', { name: '99112230' })).toHaveAttribute('href', 'tel:99112230');
        expect(row).toHaveTextContent('Шинэ харилцагч');
        expect(row).toHaveTextContent('Мандала · B блок · 1204 · Хан-Уул');
        expect(row).toHaveTextContent('Номин');
        expect(within(row).getByText('Товлосон')).toBeInTheDocument();
        expect(row).toHaveTextContent('3 өрөөний зохион байгуулалт');
        expect(within(row).getByRole('button', { name: 'Ирсэн' })).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: 'Б. Энхжин: уулзалтын бусад үйлдэл' })).toBeInTheDocument();

        const early = screen.getByRole('link', { name: 'Н. Оюун' }).closest('li')!;
        expect(early).toHaveTextContent('07:30');
        expect(early).toHaveTextContent('Хоцорсон');
        const anonymous = screen.getByText('Нэргүй харилцагч').closest('li')!;
        expect(anonymous).toHaveTextContent('Байр сонгоогүй');
        expect(anonymous).toHaveTextContent('Хариуцагчгүй');
        expect(within(screen.getByRole('link', { name: 'А. Сараа' }).closest('li')!).queryByRole('button', { name: 'Ирсэн' })).not.toBeInTheDocument();
    });

    it('selects a day to show only its agenda and returns to the full range when pressed again', () => {
        render(<ViewingsPage />);
        const tomorrow = within(strip()).getByRole('button', { name: /^Маргааш/ });
        fireEvent.click(tomorrow);
        expect(tomorrow).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('link', { name: 'Г. Тэмүүлэн' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Б. Энхжин' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);

        fireEvent.click(tomorrow);
        expect(tomorrow).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('link', { name: 'Б. Энхжин' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);

        fireEvent.click(within(strip()).getByRole('button', { name: /^Баасан/ }));
        expect(screen.getByRole('heading', { name: 'Баасан, 10-р сарын 9 — уулзалт алга' })).toBeInTheDocument();
    });

    it('moves from the past range to upcoming when a day is chosen, and a range clears the day', () => {
        render(<ViewingsPage />);
        // Анхдагч үед жагсаалт ба 7 хоног ижил хүсэлт (нэг query түлхүүр).
        expect(mocks.params[0]).toEqual(mocks.params[1]);
        fireEvent.click(within(ranges()).getByRole('button', { name: /Өнгөрсөн/ }));
        expect(screen.getByRole('link', { name: 'О. Бат' })).toBeInTheDocument();
        expect(screen.getByLabelText('Сонирхол 4/5')).toBeInTheDocument();

        fireEvent.click(within(strip()).getByRole('button', { name: /^Пүрэв/ }));
        expect(within(ranges()).getByRole('button', { name: /Удахгүй/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Нэргүй харилцагч')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'О. Бат' })).not.toBeInTheDocument();

        fireEvent.click(within(ranges()).getByRole('button', { name: /Бүгд/ }));
        expect(within(strip()).getByRole('button', { name: /^Пүрэв/ })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('link', { name: 'О. Бат' })).toBeInTheDocument();
    });

    it('postpones by exactly 24 hours and plans the follow-up at 10:00 Ulaanbaatar time', async () => {
        render(<ViewingsPage />);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Б. Энхжин: уулзалтын бусад үйлдэл' }), { key: 'Enter' });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Маргааш руу хойшлуулах' }));
        expect(mocks.mutate).toHaveBeenCalledWith({ id: 'v-today', patch: { scheduled_at: '2026-10-07T02:00:00.000Z' } }, expect.anything());

        fireEvent.click(within(screen.getByRole('link', { name: 'Б. Энхжин' }).closest('li')!).getByRole('button', { name: 'Ирсэн' }));
        const dialog = within(screen.getByRole('dialog', { name: 'Уулзалтын үр дүн' }));
        fireEvent.click(dialog.getByRole('button', { name: 'Маргааш залгах' }));
        fireEvent.click(dialog.getByRole('button', { name: 'Дууссан' }));
        await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({
            id: 'v-today',
            patch: { status: 'completed', interest_level: null, customer_feedback: null, next_followup_at: '2026-10-07T02:00:00.000Z' },
        }));
    });

    it('schedules in Ulaanbaatar time even when the browser runs in UTC', async () => {
        render(<ViewingsPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
        const dialog = screen.getByRole('dialog', { name: 'Уулзалт товлох' });
        const when = dialog.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
        expect(document.querySelectorAll('input[type="datetime-local"]')).toHaveLength(1);
        expect(when).toHaveValue('2026-10-06T10:00'); // УБ 09:00 → дараагийн бүтэн цаг (UTC-ээр 02:00 биш)
        fireEvent.change(within(dialog).getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
        fireEvent.change(when, { target: { value: '2027-01-10T11:00' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Товлох' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'mandala', customer_name: 'Болд', scheduled_at: '2027-01-10T03:00:00.000Z' })));
        expect(mocks.success).toHaveBeenCalledWith('Уулзалт товлогдлоо');
    });

    it('prefills 10:00 on the day chosen in the strip', () => {
        render(<ViewingsPage />);
        fireEvent.click(within(strip()).getByRole('button', { name: /^Пүрэв/ }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
        expect(screen.getByRole('dialog', { name: 'Уулзалт товлох' }).querySelector('input[type="datetime-local"]')).toHaveValue('2026-10-08T10:00');
    });

    it('opens scheduling for the lead from ?new=1&lead= and cleans the URL', () => {
        mocks.search = 'new=1&lead=lead-1';
        render(<ViewingsPage />);
        const dialog = within(screen.getByRole('dialog', { name: 'Уулзалт товлох' }));
        expect(dialog.getByText('Б. Энхжин')).toBeInTheDocument();
        expect(dialog.queryByPlaceholderText('Б. Болд')).not.toBeInTheDocument();
        expect(mocks.replace).toHaveBeenCalledWith('/dashboard/viewings');
    });

    it('shows read-only users the agenda without scheduling or outcome actions', () => {
        mocks.canWrite = false;
        render(<ViewingsPage />);
        expect(screen.getByRole('link', { name: 'Б. Энхжин' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ирсэн' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Уулзалт товлох' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /уулзалтын бусад үйлдэл/ })).not.toBeInTheDocument();
    });
});
