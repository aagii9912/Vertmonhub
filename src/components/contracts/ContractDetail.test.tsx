import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContractDetail } from './ContractDetail';
import { DashboardApiError } from '@/lib/api/dashboardFetch';

type TestUser = { role: string; permissions: { modules: string[]; canWrite: boolean } };
const mocks = vi.hoisted(() => ({
    user: null as unknown as TestUser,
    contract: {} as Record<string, unknown>,
    payments: {} as Record<string, unknown>,
    refetchContract: vi.fn(), refetchPayments: vi.fn(),
    update: vi.fn(), add: vi.fn(), confirm: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, shop: { id: 'shop-a' } }) }));
vi.mock('@/hooks/useContracts', () => ({
    useContract: () => ({ ...mocks.contract, refetch: mocks.refetchContract }),
    usePayments: () => ({ ...mocks.payments, refetch: mocks.refetchPayments }),
    useAddPayment: () => ({ mutateAsync: mocks.add, isPending: false }),
    useUpdatePayment: () => ({ mutate: mocks.update, isPending: false }),
}));
vi.mock('@/hooks/useLeads', () => ({ useLeadDetail: () => ({ data: undefined }) }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('@/components/dashboard/EntityAttachments', () => ({ EntityAttachments: () => null }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: (...args: unknown[]) => mocks.confirm(...args) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));

const writer: TestUser = { role: 'sales_manager', permissions: { modules: ['contracts'], canWrite: true } };
const reader: TestUser = { role: 'viewer', permissions: { modules: ['contracts'], canWrite: false } };
const contract = { id: 'contract-1', contract_number: 'VM-2026-001', contract_status: 'active', customer_name: 'Б. Болд', total_price: 300_000_000, paid_amount: 100_000_000, balance: 200_000_000, lead_id: null };
const unpaid = { id: 'pay-1', contract_id: 'contract-1', installment_number: 2, label: '2-р төлөлт', due_date: '2026-11-01', amount: 50_000_000, paid_amount: 0, paid_date: null, payment_method: null, receipt_kind: null, status: 'pending', notes: null };
const loaded = (data: unknown) => ({ data, isLoading: false, isPending: false, isError: false, error: null, isFetching: false });
const failed = (error: Error) => ({ data: undefined, isLoading: false, isPending: false, isError: true, error, isFetching: false });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = writer;
    mocks.contract = loaded({ contract });
    mocks.payments = loaded({ payments: [unpaid] });
    mocks.confirm.mockResolvedValue(true);
});

describe('ContractDetail load states', () => {
    it('shows a retryable error instead of an endless skeleton when the contract fails to load', () => {
        mocks.contract = failed(new DashboardApiError('Алдаа гарлаа', 500));
        render(<ContractDetail id="contract-1" />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Гэрээг уншиж чадсангүй');
        expect(alert).toHaveTextContent('Алдаа гарлаа');
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetchContract).toHaveBeenCalledOnce();
    });

    it('tells the user a missing contract was not found', () => {
        mocks.contract = failed(new DashboardApiError('Гэрээ олдсонгүй', 404));
        render(<ContractDetail id="missing" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Гэрээ олдсонгүй');
        expect(screen.getByRole('button', { name: 'Дахин оролдох' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Гэрээ/ })).toHaveAttribute('href', '/dashboard/contracts');
    });

    it('does not offer to re-enter payments when the schedule failed to load', () => {
        mocks.payments = failed(new DashboardApiError('Төлбөрийн хуваарь татахад алдаа гарлаа', 500));
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Төлбөрийн графикийг ачаалж чадсангүй');
        expect(screen.queryByText('Төлбөрийн график оруулаагүй')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлбөр бүртгэх/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetchPayments).toHaveBeenCalledOnce();
    });

    it('shows a skeleton while the schedule loads and the empty state only after an empty success', () => {
        mocks.payments = { data: undefined, isLoading: true, isPending: true, isError: false, error: null, isFetching: true };
        const { unmount } = render(<ContractDetail id="contract-1" />);
        expect(screen.getByLabelText('Төлбөрийн график ачаалж байна')).toBeInTheDocument();
        expect(screen.queryByText('Төлбөрийн график оруулаагүй')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлбөр бүртгэх/ })).not.toBeInTheDocument();
        unmount();

        mocks.payments = loaded({ payments: [] });
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByText('Төлбөрийн график оруулаагүй')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /Төлбөр бүртгэх/ })).toHaveLength(2);
    });
});

describe('ContractDetail payment writes', () => {
    it('hides every payment write action from a read-only user', () => {
        mocks.user = reader;
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByText('VM-2026-001')).toBeInTheDocument();
        expect(screen.getByText('2-р төлөлт')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлбөр бүртгэх/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлсөн/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Төлбөрийн төрөл' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Төлсөн огноо')).not.toBeInTheDocument();
    });

    it('hides the empty-schedule add button from a read-only user', () => {
        mocks.user = reader;
        mocks.payments = loaded({ payments: [] });
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByText('Төлбөрийн график оруулаагүй')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлбөр бүртгэх/ })).not.toBeInTheDocument();
    });

    it('confirms the amount and receipt kind before marking a payment paid', async () => {
        render(<ContractDetail id="contract-1" />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Төлбөрийн хэлбэр' }), { target: { value: 'bank_transfer' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Төлбөрийн төрөл' }), { target: { value: 'installment' } });

        mocks.confirm.mockResolvedValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: /Төлсөн/ }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
        const [options] = mocks.confirm.mock.calls[0] as [{ title: string; description: string }];
        expect(options.title).toContain('50,000,000₮');
        expect(options.description).toContain('Хуваарьт төлөлт');
        expect(options.description).toContain('Банк шилжүүлэг');
        expect(mocks.update).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Төлсөн/ }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(mocks.update).toHaveBeenCalledWith({
            payment_id: 'pay-1', paid_amount: 50_000_000, amount: 50_000_000,
            paid_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), payment_method: 'bank_transfer', receipt_kind: 'installment',
        }, expect.any(Object));
    });

    it('states only the remaining amount as the receipt for a partly paid installment', async () => {
        mocks.payments = loaded({ payments: [{ ...unpaid, paid_amount: 20_000_000, paid_date: '2026-10-01', payment_method: 'cash', receipt_kind: 'installment', status: 'partial' }] });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Төлсөн/ }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
        const [options] = mocks.confirm.mock.calls[0] as [{ title: string; description: string }];
        expect(options.title).toContain('30,000,000₮');
        expect(options.description).toContain('өмнө 20,000,000₮ төлсөн');
    });

    it('starts a new payment row with an empty, required amount instead of a guess', () => {
        mocks.payments = loaded({ payments: [] });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getAllByRole('button', { name: /Төлбөр бүртгэх/ })[0]);
        const amount = screen.getByRole('spinbutton', { name: 'Дүн' });
        expect(amount).toHaveValue(null);
        expect(amount).toBeRequired();
        fireEvent.change(screen.getByRole('combobox', { name: 'Төлбөрийн төрөл' }), { target: { value: 'advance' } });
        fireEvent.click(screen.getByRole('button', { name: 'Төлбөр хадгалах' }));
        expect(mocks.toastError).toHaveBeenCalledWith('Зөв төлөх дүн оруулна уу');
        expect(mocks.add).not.toHaveBeenCalled();
    });
});
