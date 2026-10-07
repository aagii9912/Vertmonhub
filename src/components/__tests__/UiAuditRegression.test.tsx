import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LeadsPage } from '../leads/LeadsPage';
import InboxMessagesPage from '@/app/dashboard/inbox/messages/page';
import { FeedbackWidget } from '../feedback/FeedbackWidget';

const mocks = vi.hoisted(() => ({
    params: '', push: vi.fn(), fetch: vi.fn(), refetch: vi.fn(),
    conversations: [] as unknown[], readError: false,
    listParams: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-a' }, loading: false, user: { permissions: { modules: ['leads', 'inbox'], canWrite: true, canDelete: false } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: (...args: unknown[]) => mocks.fetch(...args) }));
vi.mock('@/hooks/useConversations', () => ({ useConversations: () => ({ data: mocks.readError ? undefined : mocks.conversations, isLoading: false, isError: mocks.readError, isFetching: false, refetch: mocks.refetch }) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadsList: (params: unknown) => { mocks.listParams(params); return { data: { leads: [], pagination: { total: 0, totalPages: 1 } }, isLoading: false }; },
    useLeadSummary: () => ({ data: {} }), useManagers: () => ({ data: [] }), useUpdateLead: () => ({ mutate: vi.fn() }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }, { id: 'elysium', name: 'Elysium' }] }),
    useLeadCategories: () => ({ data: [
        { id: 'investor', name: 'Хөрөнгө оруулагч', tone: 'success', is_active: true },
        { id: 'barter', name: 'Бартер', tone: 'neutral', is_active: false },
    ] }),
}));
vi.mock('../leads/pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null, CategoryPicker: () => null }));
vi.mock('../leads/LeadCard', () => ({ LeadCard: ({ leadId, onClose }: { leadId: string; onClose: () => void }) => <div><h2>{leadId}</h2><button onClick={onClose}>Хаах</button></div> }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = '';
    mocks.readError = false;
    mocks.conversations = ['a', 'b'].map(id => ({ id, customer_name: `Харилцагч ${id}`, messages: [{ id: `message-${id}`, role: 'user', content: `Яриа ${id}`, created_at: '2026-09-13T00:00:00Z' }] }));
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Серверийн алдаа' }, { status: 500 }));
    mocks.refetch.mockResolvedValue({});
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
});

describe('UI audit regressions', () => {
    it('filters the list by project and resets it with the other filters', () => {
        render(<LeadsPage />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
        expect(mocks.listParams).toHaveBeenLastCalledWith(expect.objectContaining({ project: 'elysium', page: 1 }));
        fireEvent.click(screen.getByRole('button', { name: 'Цэвэрлэх' }));
        expect(mocks.listParams).toHaveBeenLastCalledWith(expect.objectContaining({ project: 'all' }));
    });
    it('filters the list by lead category (archived labelled, uncategorized included) and resets it', () => {
        render(<LeadsPage />);
        const chip = screen.getByRole('combobox', { name: 'Ангилал' });
        expect([...chip.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Бүгд', 'Ангилалгүй', 'Хөрөнгө оруулагч', 'Бартер (архив)']);
        fireEvent.change(chip, { target: { value: 'none' } });
        expect(mocks.listParams).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'none', page: 1 }));
        fireEvent.change(chip, { target: { value: 'barter' } });
        expect(mocks.listParams).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'barter' }));
        fireEvent.click(screen.getByRole('button', { name: 'Цэвэрлэх' }));
        expect(mocks.listParams).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'all' }));
    });
    it('opens the lead from the URL in the customer card beside the list and closes it', () => {
        mocks.params = 'lead=split-lead';
        render(<LeadsPage />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        const card = screen.getByRole('complementary', { name: 'Харилцагчийн карт' });
        expect(within(card).getByRole('heading', { name: 'split-lead' })).toBeInTheDocument();
        expect(within(card).getAllByRole('button', { name: 'Хаах' })).toHaveLength(1);
        fireEvent.click(within(card).getByRole('button', { name: 'Хаах' }));
        expect(screen.queryByRole('complementary', { name: 'Харилцагчийн карт' })).not.toBeInTheDocument();
        expect(window.location.search).toBe('');
    });

    it('opens the exact conversation in the URL beside the list and switches conversations without losing other parameters', () => {
        mocks.params = 'conversation=b&source=inbox';
        render(<InboxMessagesPage />);
        const selected = screen.getByRole('region', { name: 'Сонгосон яриа' });
        expect(within(selected).getByRole('heading', { name: 'Харилцагч b' })).toBeInTheDocument();
        expect(screen.getByRole('log')).toHaveTextContent('Яриа b');
        expect(screen.getByRole('log')).not.toHaveTextContent('Яриа a');
        const list = screen.getByRole('region', { name: 'Ярианы жагсаалт' });
        expect(within(list).getByRole('button', { name: /Харилцагч b/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(list).getByRole('button', { name: /Харилцагч a/ }));
        expect(mocks.push).toHaveBeenCalledWith('/dashboard/inbox/messages?conversation=a&source=inbox', { scroll: false });
    });

    it('preserves an unsent reply and shows the failure when the server rejects it', async () => {
        mocks.params = 'conversation=b';
        render(<InboxMessagesPage />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Хариу мессеж' }), { target: { value: 'Тест хариу' } });
        fireEvent.click(screen.getByRole('button', { name: 'Мессеж илгээх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Серверийн алдаа');
        expect(screen.getByRole('textbox', { name: 'Хариу мессеж' })).toHaveValue('Тест хариу');
        expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ customerId: 'b', message: 'Тест хариу' });
        expect(mocks.refetch).not.toHaveBeenCalled();
    });

    it('reports an unavailable conversation instead of showing an unrelated person', () => {
        mocks.params = 'conversation=missing';
        render(<InboxMessagesPage />);
        expect(screen.getByText('Сонгосон яриа энэ жагсаалтад олдсонгүй.')).toBeInTheDocument();
        expect(screen.queryByRole('log')).not.toBeInTheDocument();
    });

    it('offers retry after the inbox cannot load', () => {
        mocks.readError = true;
        render(<InboxMessagesPage />);
        expect(screen.getByRole('alert')).toHaveTextContent('Яриаг ачаалж чадсангүй');
        fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetch).toHaveBeenCalledOnce();
    });

    it('does not claim feedback was sent after an HTTP error and retains the text', async () => {
        render(<FeedbackWidget />);
        fireEvent.click(screen.getByRole('button', { name: 'Тусламж, санал хүсэлт' }));
        fireEvent.change(screen.getByLabelText('Дэлгэрэнгүй'), { target: { value: 'Тест санал' } });
        fireEvent.click(screen.getByRole('button', { name: 'Илгээх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Илгээж чадсангүй');
        expect(screen.getByLabelText('Дэлгэрэнгүй')).toHaveValue('Тест санал');
        expect(screen.queryByText('Таны санал хүсэлт илгээгдлээ.')).not.toBeInTheDocument();
    });
});
