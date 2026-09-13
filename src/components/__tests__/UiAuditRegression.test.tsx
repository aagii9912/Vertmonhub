import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { LeadsPage } from '../leads/LeadsPage';
import InboxMessagesPage from '@/app/dashboard/inbox/messages/page';
import { FeedbackWidget } from '../feedback/FeedbackWidget';

const mocks = vi.hoisted(() => ({
    params: '', push: vi.fn(), fetch: vi.fn(), refetch: vi.fn(),
    conversations: [] as unknown[], readError: false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-a' }, loading: false, user: { permissions: { modules: ['leads', 'inbox'], canWrite: true, canDelete: false } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: (...args: unknown[]) => mocks.fetch(...args) }));
vi.mock('@/hooks/useConversations', () => ({ useConversations: () => ({ data: mocks.readError ? undefined : mocks.conversations, isLoading: false, isError: mocks.readError, isFetching: false, refetch: mocks.refetch }) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadsList: () => ({ data: { leads: [], pagination: { total: 0, totalPages: 1 } }, isLoading: false }),
    useLeadSummary: () => ({ data: {} }), useManagers: () => ({ data: [] }), useUpdateLead: () => ({ mutate: vi.fn() }),
}));
vi.mock('../leads/pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null }));
vi.mock('../leads/LeadPanel', () => ({ LeadPanel: ({ leadId, onClose }: { leadId: string; onClose: () => void }) => <div><h2>{leadId}</h2><button onClick={onClose}>Хаах</button></div>, nextStep: () => '' }));

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
    it('keeps the selected lead accessible when a saved desktop split layout is opened on a tablet, then resized', () => {
        localStorage.setItem('vertmonhub_leads_mode', 'split');
        mocks.params = 'lead=tablet-lead';
        Object.defineProperty(window, 'innerWidth', { value: 900, writable: true, configurable: true });
        render(<LeadsPage />);
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'tablet-lead' })).toBeInTheDocument();
        expect(within(dialog).getAllByRole('button', { name: 'Хаах' })).toHaveLength(1);
        act(() => { window.innerWidth = 1280; window.dispatchEvent(new Event('resize')); });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(screen.getByRole('complementary', { name: 'Сонгосон лид' })).getByRole('heading', { name: 'tablet-lead' })).toBeInTheDocument();
        act(() => { window.innerWidth = 390; window.dispatchEvent(new Event('resize')); });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Хаах' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the exact conversation in the URL and returns to the list without losing other parameters', () => {
        mocks.params = 'conversation=b&source=inbox';
        render(<InboxMessagesPage />);
        const selected = screen.getByRole('region', { name: 'Сонгосон яриа' });
        expect(within(selected).getByRole('heading', { name: 'Харилцагч b' })).toBeInTheDocument();
        expect(screen.getByRole('log')).toHaveTextContent('Яриа b');
        expect(screen.getByRole('log')).not.toHaveTextContent('Яриа a');
        fireEvent.click(screen.getByRole('button', { name: 'Ярианы жагсаалт руу буцах' }));
        expect(mocks.push).toHaveBeenCalledWith('/dashboard/inbox/messages?source=inbox', { scroll: false });
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
