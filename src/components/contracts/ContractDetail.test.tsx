import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContractDetail } from './ContractDetail';
import { DashboardApiError } from '@/lib/api/dashboardFetch';

type TestUser = { role: string; permissions: { modules: string[]; canWrite: boolean } };
const mocks = vi.hoisted(() => ({
    user: null as unknown as TestUser,
    contract: {} as Record<string, unknown>,
    payments: {} as Record<string, unknown>,
    refetchContract: vi.fn(), refetchPayments: vi.fn(),
    update: vi.fn(), add: vi.fn(), confirm: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), setOrderDate: vi.fn(), setManager: vi.fn(),
    mode: { isManager: false } as { isManager: boolean; managerName?: string | null } | undefined,
    managerOptions: [] as Array<{ name: string; roster: boolean; contracts: number }>,
    referrals: { sources: [] as Array<{ id: string; name: string; sort_order: number; archived_at: string | null }>, available: true } as
        { sources: Array<{ id: string; name: string; sort_order: number; archived_at: string | null }>; available: boolean } | undefined,
    setReferral: vi.fn(),
    mutate: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, shop: { id: 'shop-a' } }) }));
vi.mock('@/hooks/useContracts', () => ({
    useContract: () => ({ ...mocks.contract, refetch: mocks.refetchContract }),
    usePayments: () => ({ ...mocks.payments, refetch: mocks.refetchPayments }),
    useContractTransfers: () => ({ data: { transfers: [] }, isError: false }),
    useAddPayment: () => ({ mutateAsync: mocks.add, isPending: false }),
    useUpdatePayment: () => ({ mutate: mocks.update, isPending: false }),
    useSetContractOrderDate: () => ({ mutate: mocks.setOrderDate, isPending: false }),
    useContractManagerOptions: () => ({ data: mocks.managerOptions, isLoading: false, isError: false }),
    useSetContractManager: () => ({ mutate: mocks.setManager, isPending: false }),
}));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => ({ data: mocks.mode }) }));
vi.mock('@/hooks/useReferralSources', () => ({
    useReferralSources: () => ({ data: mocks.referrals, isError: false }),
    useSetContractReferral: () => ({ mutate: mocks.setReferral, isPending: false }),
}));
vi.mock('@/hooks/useLeads', () => ({ useLeadDetail: () => ({ data: undefined }) }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('@/components/dashboard/EntityAttachments', () => ({ EntityAttachments: () => null }));
vi.mock('@/components/contracts/ContractTransferDialog', () => ({ ContractTransferDialog: () => null }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: (...args: unknown[]) => mocks.confirm(...args) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
// «Цуцлах» / «Сэргээх»: бодит react-query мутаци, зөвхөн API дуудлагыг барина (x-shop-id-г dashboardFetch өөрөө нэмдэг).
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(),
    dashboardMutate: (...args: unknown[]) => mocks.mutate(...args),
}));

let queryClient: QueryClient;
const render = (ui: React.ReactElement) => renderUi(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
});

const writer: TestUser = { role: 'sales_manager', permissions: { modules: ['contracts'], canWrite: true } };
const reader: TestUser = { role: 'viewer', permissions: { modules: ['contracts'], canWrite: false } };
const contract = { id: 'contract-1', contract_number: 'VM-2026-001', contract_status: 'active', customer_name: 'Б. Болд', total_price: 300_000_000, paid_amount: 100_000_000, balance: 200_000_000, lead_id: null };
const unpaid = { id: 'pay-1', contract_id: 'contract-1', installment_number: 2, label: '2-р төлөлт', due_date: '2026-11-01', amount: 50_000_000, paid_amount: 0, paid_date: null, payment_method: null, receipt_kind: null, status: 'pending', notes: null };
const loaded = (data: unknown) => ({ data, isLoading: false, isPending: false, isError: false, error: null, isFetching: false });
const failed = (error: Error) => ({ data: undefined, isLoading: false, isPending: false, isError: true, error, isFetching: false });

beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mocks.user = writer;
    mocks.contract = loaded({ contract });
    mocks.payments = loaded({ payments: [unpaid] });
    mocks.confirm.mockResolvedValue(true);
    mocks.mode = { isManager: false };
    mocks.managerOptions = [];
    mocks.referrals = { sources: [], available: true };
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

    it('never offers payment entry for an ERP product-export contract whose paid amount is unknown', () => {
        mocks.contract = loaded({ contract: { ...contract, paid_amount: null, balance: null } });
        mocks.payments = loaded({ payments: [] });
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByText(/өмнө төлсөн дүн тодорхойгүй/)).toBeInTheDocument();
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

describe('ContractDetail HUB fields', () => {
    const hub = { ...contract, contract_number: null, unit_label: 'Б1-19 (01)', block_name: 'Б1', unit_number: '0', legacy_unit_number: '19', customer_name: 'Болд.Батаа', customer_first_name: 'Болд', customer_last_name: 'Батаа', payment_condition: 'Тусгай', overdue_amount: 397_977_420, overdue_as_of: '2026-10-22', order_date: '2026-10-05', contract_date: '2026-10-05', paid_amount: null, balance: null };
    const field = (label: string) => screen.getByText(label, { selector: 'span' }).nextElementSibling as HTMLElement;

    it('shows the order date, payment condition, overdue amount with its file date, and the split names', () => {
        mocks.contract = loaded({ contract: hub });
        render(<ContractDetail id="contract-1" />);
        expect(field('Захиалга өгсөн огноо')).toHaveTextContent('2026-10-05');
        expect(field('Захиалгын нөхцөл')).toHaveTextContent('Тусгай');
        expect(field('Төлбөр хоцролт')).toHaveTextContent('397,977,420₮ · 2026-10-22-ны байдлаар');
        expect(field('Нэр')).toHaveTextContent('Болд');
        expect(field('Овог')).toHaveTextContent('Батаа');
        // «Тоот»: шинэ тоот '0' биш хуучин тоот.
        expect(field('Блок / Тоот')).toHaveTextContent('Б1 / 19');
        expect(screen.queryByRole('button', { name: /Огноо оруулах/ })).not.toBeInTheDocument();
    });

    it('shows «—» for an unknown overdue amount and price, never 0₮', () => {
        mocks.contract = loaded({ contract: { ...hub, overdue_amount: null, overdue_as_of: null, total_price: null } });
        render(<ContractDetail id="contract-1" />);
        expect(field('Төлбөр хоцролт')).toHaveTextContent(/^—$/);
        expect(field('Нийт үнэ')).toHaveTextContent(/^—$/);
    });

    it('lets a writer enter a missing order date once, after confirming', async () => {
        mocks.contract = loaded({ contract: { ...hub, order_date: null, contract_date: null } });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Огноо оруулах/ }));
        const input = screen.getByLabelText('Захиалга өгсөн огноо');
        fireEvent.change(input, { target: { value: '2026-09-15' } });

        mocks.confirm.mockResolvedValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Огноо хадгалах' }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
        const [options] = mocks.confirm.mock.calls[0] as [{ title: string; description: string }];
        expect(options.title).toContain('2026-09-15');
        expect(options.description).toContain('Гэрээний огноо мөн энэ өдөр болж');
        expect(mocks.setOrderDate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Огноо хадгалах' }));
        await waitFor(() => expect(mocks.setOrderDate).toHaveBeenCalledWith('2026-09-15', expect.any(Object)));
    });

    it('refuses a future order date before asking', async () => {
        mocks.contract = loaded({ contract: { ...hub, order_date: null } });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Огноо оруулах/ }));
        fireEvent.change(screen.getByLabelText('Захиалга өгсөн огноо'), { target: { value: '2999-01-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Огноо хадгалах' }));
        expect(mocks.toastError).toHaveBeenCalledWith('Захиалга өгсөн огноо өнөөдрөөс хойш байж болохгүй');
        expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it('refuses an order date before 2000 (a mistyped year) before asking', async () => {
        mocks.contract = loaded({ contract: { ...hub, order_date: null } });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Огноо оруулах/ }));
        const input = screen.getByLabelText('Захиалга өгсөн огноо');
        expect(input).toHaveAttribute('min', '2000-01-01');
        fireEvent.change(input, { target: { value: '0202-10-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Огноо хадгалах' }));
        expect(mocks.toastError).toHaveBeenCalledWith('Захиалга өгсөн огноо 2000 оноос өмнө байж болохгүй');
        expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it('does not offer the order-date entry to a read-only user', () => {
        mocks.user = reader;
        mocks.contract = loaded({ contract: { ...hub, order_date: null, contract_date: null } });
        render(<ContractDetail id="contract-1" />);
        expect(field('Захиалга өгсөн огноо')).toHaveTextContent(/^—$/);
        expect(screen.queryByRole('button', { name: /Огноо оруулах/ })).not.toBeInTheDocument();
    });

    it('shows the contract date like the list does when only the order date is missing, and says it stays the reporting date', async () => {
        mocks.user = reader;
        mocks.contract = loaded({ contract: { ...hub, order_date: null, contract_date: '2026-10-05' } });
        const { unmount } = render(<ContractDetail id="contract-1" />);
        expect(field('Захиалга өгсөн огноо')).toHaveTextContent(/^2026-10-05$/);
        unmount();

        mocks.user = writer;
        render(<ContractDetail id="contract-1" />);
        expect(field('Захиалга өгсөн огноо')).toHaveTextContent('2026-10-05');
        fireEvent.click(screen.getByRole('button', { name: /Огноо оруулах/ }));
        // Гэрээний огноогоор урьдчилан бөглөнө — санамсаргүй өөр огноо оруулж зөрүүлэхгүй.
        expect(screen.getByLabelText('Захиалга өгсөн огноо')).toHaveValue('2026-10-05');
        mocks.confirm.mockResolvedValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Огноо хадгалах' }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
        const [options] = mocks.confirm.mock.calls[0] as [{ description: string }];
        expect(options.description).toContain('Гэрээний огноо 2026-10-05 хэвээр');
        expect(mocks.setOrderDate).not.toHaveBeenCalled();
    });
});

describe('ContractDetail manager', () => {
    it('lets an unrestricted writer pick the manager of a HUB contract from the roster or names already on contracts', async () => {
        mocks.contract = loaded({ contract: { ...contract, sales_manager: null } });
        mocks.managerOptions = [{ name: 'Khongoroo', roster: true, contracts: 0 }, { name: 'Хонгорзул.Мөнхгэрэл', roster: false, contracts: 12 }];
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Менежер оруулах/ }));
        const select = screen.getByRole('combobox', { name: 'Менежер' });
        expect(within(select).getByRole('option', { name: 'Хонгорзул.Мөнхгэрэл · гэрээнд 12' })).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'Хонгорзул.Мөнхгэрэл' } });
        fireEvent.click(screen.getByRole('button', { name: 'Менежер хадгалах' }));
        await waitFor(() => expect(mocks.setManager).toHaveBeenCalledWith('Хонгорзул.Мөнхгэрэл', expect.any(Object)));
        expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Менежерийг «Хонгорзул.Мөнхгэрэл» болгох уу?' }));
    });

    it('shows the manager read-only to restricted managers, readers and while the mode is unknown', () => {
        mocks.contract = loaded({ contract: { ...contract, sales_manager: 'Ариунбилэг.Нямхүү' } });
        for (const [user, mode] of [[writer, { isManager: true }], [reader, { isManager: false }], [writer, undefined]] as const) {
            mocks.user = user;
            mocks.mode = mode;
            const { unmount } = render(<ContractDetail id="contract-1" />);
            expect(screen.getAllByText('Ариунбилэг.Нямхүү').length).toBeGreaterThan(0);
            expect(screen.queryByRole('button', { name: /Солих|Менежер оруулах/ })).not.toBeInTheDocument();
            unmount();
        }
    });
});

describe('ContractDetail referral source', () => {
    const facebook = { id: 'ref-facebook', name: 'Facebook', sort_order: 10, archived_at: null };
    const neighbour = { id: 'ref-neighbour', name: 'Ойрхон амьдардаг', sort_order: 20, archived_at: null };
    const barmash = { id: 'ref-barmash', name: 'Бармаш түрээслэгч', sort_order: 30, archived_at: '2026-10-20T00:00:00Z' };

    it('lets a writer pick «Сэжим (хаанаас ирсэн)» from the active list, keeping the current archived choice visible', async () => {
        mocks.referrals = { sources: [facebook, neighbour, barmash], available: true };
        mocks.contract = loaded({ contract: { ...contract, referral_source_id: 'ref-barmash' } });
        render(<ContractDetail id="contract-1" />);
        expect(screen.getByText('Бармаш түрээслэгч')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Солих/ }));
        const select = screen.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' });
        expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['Сонгоогүй', 'Facebook', 'Ойрхон амьдардаг', 'Бармаш түрээслэгч (архив)']);
        fireEvent.change(select, { target: { value: 'ref-neighbour' } });
        fireEvent.click(screen.getByRole('button', { name: 'Сэжим (хаанаас ирсэн) хадгалах' }));
        expect(mocks.setReferral).toHaveBeenCalledWith('ref-neighbour', expect.any(Object));
    });

    it('clears the choice with «Сонгоогүй» and does not save an unchanged value', () => {
        mocks.referrals = { sources: [facebook], available: true };
        mocks.contract = loaded({ contract: { ...contract, referral_source_id: 'ref-facebook' } });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: /Солих/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Сэжим (хаанаас ирсэн) хадгалах' }));
        expect(mocks.setReferral).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Солих/ }));
        fireEvent.change(screen.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' }), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Сэжим (хаанаас ирсэн) хадгалах' }));
        expect(mocks.setReferral).toHaveBeenCalledWith(null, expect.any(Object));
    });

    it('is read-only for readers, without a list or before the migration, and shows the list API name as a fallback', () => {
        const cases = [
            { user: reader, referrals: { sources: [facebook], available: true }, row: { referral_source_id: 'ref-facebook' }, text: 'Facebook' },
            { user: writer, referrals: { sources: [], available: true }, row: { referral_source_id: null }, text: null },
            { user: writer, referrals: { sources: [], available: false }, row: { referral_source_id: null }, text: null },
            { user: writer, referrals: undefined, row: { referral_source_id: 'ref-x', referral_source_name: 'Танил' }, text: 'Танил' },
        ];
        for (const item of cases) {
            mocks.user = item.user;
            mocks.referrals = item.referrals;
            mocks.contract = loaded({ contract: { ...contract, sales_manager: 'Ариунбилэг', ...item.row } });
            const { unmount } = render(<ContractDetail id="contract-1" />);
            if (item.text) expect(screen.getByText(item.text)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^Сонгох$/ })).not.toBeInTheDocument();
            expect(screen.queryByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' })).not.toBeInTheDocument();
            unmount();
        }
    });
});

describe('ContractDetail cancel and restore', () => {
    const cancelledContract = { ...contract, contract_status: 'cancelled' };
    const dialog = () => screen.getByRole('dialog');

    it('offers «Цуцлах» to writers only on an active contract (restore returns it to active) and «Сэргээх» only on a cancelled one', () => {
        const cases = [
            { user: writer, row: contract, cancel: true, restore: false },
            // «Сэргээх» үргэлж «Идэвхтэй» болгодог: хаагдсан, «Тоот шилжсэн», төлөвгүй гэрээний төлөв алдагдах тул цуцлахыг санал болгохгүй.
            { user: writer, row: { ...contract, contract_status: 'closed' }, cancel: false, restore: false },
            { user: writer, row: { ...contract, contract_status: 'transferred' }, cancel: false, restore: false },
            { user: writer, row: { ...contract, contract_status: null }, cancel: false, restore: false },
            { user: writer, row: cancelledContract, cancel: false, restore: true },
            { user: reader, row: contract, cancel: false, restore: false },
            { user: reader, row: cancelledContract, cancel: false, restore: false },
        ];
        for (const item of cases) {
            mocks.user = item.user;
            mocks.contract = loaded({ contract: item.row });
            const { unmount } = render(<ContractDetail id="contract-1" />);
            expect(screen.queryByRole('button', { name: 'Цуцлах' }) !== null).toBe(item.cancel);
            expect(screen.queryByRole('button', { name: 'Сэргээх' }) !== null).toBe(item.restore);
            unmount();
        }
    });

    it('shows the actions to a restricted manager only on an own contract, and to nobody while the mode is unknown', () => {
        const cases = [
            { mode: { isManager: true, managerName: 'Номин' }, row: { ...contract, sales_manager: 'Номин' }, cancel: true, restore: false },
            { mode: { isManager: true, managerName: 'Номин' }, row: { ...cancelledContract, sales_manager: 'Номин' }, cancel: false, restore: true },
            // Сервер бусдын гэрээнд 404 «Гэрээ олдсонгүй» буцаадаг — товч харуулахгүй.
            { mode: { isManager: true, managerName: 'Номин' }, row: { ...contract, sales_manager: 'Сараа' }, cancel: false, restore: false },
            { mode: { isManager: true, managerName: 'Номин' }, row: { ...cancelledContract, sales_manager: null }, cancel: false, restore: false },
            { mode: { isManager: true, managerName: null }, row: { ...contract, sales_manager: null }, cancel: false, restore: false },
            { mode: undefined, row: contract, cancel: false, restore: false },
            { mode: { isManager: false, managerName: null }, row: { ...contract, sales_manager: 'Сараа' }, cancel: true, restore: false },
        ];
        for (const item of cases) {
            mocks.mode = item.mode;
            mocks.contract = loaded({ contract: item.row });
            const { unmount } = render(<ContractDetail id="contract-1" />);
            expect(screen.queryByRole('button', { name: 'Цуцлах' }) !== null).toBe(item.cancel);
            expect(screen.queryByRole('button', { name: 'Сэргээх' }) !== null).toBe(item.restore);
            if (item.row.contract_status === 'cancelled') {
                if (item.restore) expect(screen.getByRole('status')).toHaveTextContent('«Сэргээх»');
                else expect(screen.getByRole('status')).not.toHaveTextContent('Сэргээх');
            }
            unmount();
        }
    });

    it('shows a cancelled contract clearly, without payment entry, to readers and writers', () => {
        mocks.contract = loaded({ contract: cancelledContract });
        for (const user of [writer, reader]) {
            mocks.user = user;
            for (const payments of [[unpaid], []]) {
                mocks.payments = loaded({ payments });
                const { unmount } = render(<ContractDetail id="contract-1" />);
                expect(screen.getByText('Цуцалсан')).toBeInTheDocument();
                const banner = screen.getByRole('status');
                expect(banner).toHaveTextContent('Энэ гэрээ цуцлагдсан');
                expect(banner).toHaveTextContent('шинэ төлбөр бүртгэхгүй');
                if (user === writer) expect(banner).toHaveTextContent('«Сэргээх»');
                else expect(banner).not.toHaveTextContent('Сэргээх');
                expect(screen.queryByRole('button', { name: /Төлбөр бүртгэх/ })).not.toBeInTheDocument();
                expect(screen.queryByRole('button', { name: /Төлсөн/ })).not.toBeInTheDocument();
                expect(screen.queryByRole('button', { name: /Гэрээ шилжүүлэх/ })).not.toBeInTheDocument();
                unmount();
            }
        }
    });

    it('states what cancelling does and sends nothing until confirmed', async () => {
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Цуцлах' }));
        expect(within(dialog()).getByRole('heading', { name: '«VM-2026-001» гэрээг цуцлах уу?' })).toBeInTheDocument();
        expect(dialog()).toHaveTextContent('Гэрээ устахгүй');
        expect(dialog()).toHaveTextContent('Гэрээний тоо, дүн төлөвлөгөөний биелэлт');
        expect(dialog()).toHaveTextContent('Лхагвын тайлангийн CRM гэрээ ба «Огноогүй» тоо');
        // Давхрын зураглал гэрээг зөвхөн HUB горимд давхарлана; захирлын «Хугацаа хэтэрсэн» графикийг төлөвгүй уншина.
        expect(dialog()).toHaveTextContent('«Гэрээтэй»-гээс зөвхөн HUB гэрээний жагсаалт импортолсон төсөлд хасагдана');
        expect(dialog()).toHaveTextContent('Бүртгэсэн төлбөр, төлбөрийн график устахгүй');
        expect(dialog()).toHaveTextContent('хугацаа хэтэрсэн хуваарь захирлын самбарын «Хугацаа хэтэрсэн»-д хэвээр');
        expect(dialog()).toHaveTextContent('Байрны төлөв, холбоотой лидийн төлөв энэ үйлдлээр өөрчлөгдөхгүй');
        expect(dialog()).toHaveTextContent('«Сэргээх»-ээр «Идэвхтэй» төлөвт буцаана');
        expect(dialog()).not.toHaveTextContent('захирлын самбар,');
        // Устгах маягийн товч: design system v3 danger-solid (bg-destructive).
        expect(within(dialog()).getByRole('button', { name: 'Гэрээг цуцлах' })).toHaveClass('bg-destructive');

        fireEvent.click(within(dialog()).getByRole('button', { name: 'Болих' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('cancels through PATCH contract_status, toasts and refreshes the page, lists and reports', async () => {
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        mocks.mutate.mockResolvedValue({ contract: cancelledContract });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Цуцлах' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Гэрээг цуцлах' }));

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Гэрээ цуцлагдлаа'));
        expect(mocks.mutate).toHaveBeenCalledOnce();
        expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/contracts/contract-1', 'PATCH', { contract_status: 'cancelled' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(queryClient.getQueryData(['contracts', 'detail', 'shop-a', 'contract-1'])).toEqual({ contract: cancelledContract });
        const keys = invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey[0]);
        expect(keys).toEqual(expect.arrayContaining(['contracts', 'director', 'plan-performance', 'weekly-sales', 'kpi-report', 'units']));
    });

    it('keeps the dialog open with the server error and lets the user back out', async () => {
        mocks.mutate.mockRejectedValue(new DashboardApiError('Зөвхөн өөрийн борлуулсан гэрээг засах боломжтой', 403));
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Цуцлах' }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Гэрээг цуцлах' }));
        expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Зөвхөн өөрийн борлуулсан гэрээг засах боломжтой');
        expect(mocks.toastSuccess).not.toHaveBeenCalled();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Болих' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        // Дахин нээхэд хуучин алдаа үлдэхгүй.
        fireEvent.click(screen.getByRole('button', { name: 'Цуцлах' }));
        expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('restores a cancelled contract to active after confirming', async () => {
        mocks.contract = loaded({ contract: cancelledContract });
        mocks.mutate.mockResolvedValue({ contract: { ...cancelledContract, contract_status: 'active' } });
        render(<ContractDetail id="contract-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Сэргээх' }));
        expect(within(dialog()).getByRole('heading', { name: '«VM-2026-001» гэрээг сэргээх үү?' })).toBeInTheDocument();
        expect(dialog()).toHaveTextContent('«Идэвхтэй»');
        expect(dialog()).toHaveTextContent('Байранд өөр идэвхтэй гэрээ байвал сэргээхгүй');
        const confirm = within(dialog()).getByRole('button', { name: 'Сэргээх' });
        expect(confirm).not.toHaveClass('bg-destructive');
        fireEvent.click(confirm);
        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Гэрээ сэргээгдлээ'));
        expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/contracts/contract-1', 'PATCH', { contract_status: 'active' });
    });
});
