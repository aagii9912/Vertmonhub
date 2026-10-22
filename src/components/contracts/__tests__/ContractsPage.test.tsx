// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractRow, ContractsListParams, ContractsListResult, ContractStats } from '@/hooks/useContracts';
import { CONTRACT_LIST_COLUMNS } from '@/lib/contracts/list-format';

type TestUser = { role: string; permissions: { canWrite: boolean; modules: string[] } };
const state = vi.hoisted(() => ({
    data: undefined as ContractsListResult | undefined,
    params: [] as ContractsListParams[],
    user: null as unknown as TestUser,
    search: new URLSearchParams(),
    canViewTeam: true,
    isManager: undefined as boolean | undefined,
    push: vi.fn(),
    download: vi.fn(),
}));
vi.mock('@/hooks/useContracts', () => ({
    useContractsList: (params: ContractsListParams) => {
        state.params.push(params);
        return { data: state.data, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
    },
}));
vi.mock('@/hooks/useLeads', () => ({ useManagers: () => ({ data: [{ name: 'Номин' }] }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => ({ data: { mode: state.canViewTeam ? 'org' : 'personal', canViewTeam: state.canViewTeam,
    isManager: state.isManager ?? !state.canViewTeam } }) }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => state.search }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardDownload: (...args: unknown[]) => state.download(...args) }));

import { ContractsPage } from '../ContractsPage';

const contract = (id: string, extra: Partial<ContractRow> & Record<string, unknown> = {}) => ({
    id, contract_number: null, contract_date: '2026-10-05', order_date: '2026-10-05', contract_status: 'active', product_type: 'residential',
    unit_label: `Б1-${id}`, block_name: 'Б1', floor: '01', unit_number: '0', legacy_unit_number: id, model: 'A-2', contracted_area: 64.33,
    prepayment_condition: '30%', price_per_sqm: 7_000_000, total_price: 450_310_000, prepayment_due: 135_093_000, overdue_amount: 0,
    overdue_as_of: '2026-10-22', overdue_days: 0, customer_name: 'Болд.Батаа', customer_first_name: 'Болд', customer_last_name: 'Батаа',
    payment_condition: 'Тусгай', paid_amount: null, balance: null, sales_manager: 'Хонгорзул.Мөнхгэрэл',
    ...extra,
}) as unknown as ContractRow;

const stats = (extra: Partial<ContractStats> = {}): ContractStats => ({
    total: 4, active: 2, closed: 1, cancelled: 1, transferred: 0, total_sales: 900_000_000, prepayment_due: 270_000_000,
    overdue_amount: 2_482_828_893, overdue_as_of: '2026-10-22', overdue_count: 18, overdue_stale: 2, overdue_days_count: 0,
    total_paid: 0, total_balance: 0, unknown_paid: 3, area: 128.66, ...extra,
});

const rows = [
    contract('19', { unit_label: 'Б1-19 (B1)', floor: 'B1', overdue_amount: 397_977_420 }),
    contract('110', { product_type: 'parking', unit_label: 'Б1-110 (B1)', floor: 'B1', model: null, contracted_area: 13.25, price_per_sqm: null, total_price: 35_000_000, prepayment_due: null, overdue_amount: null, customer_first_name: null, customer_last_name: null, customer_name: 'Сарангэрэл.Сайнбаяр', contract_status: 'closed' }),
    contract('7', { overdue_amount: 0 }),
    contract('8', { overdue_amount: null, overdue_days: 12, order_date: null, contract_date: null }),
];

function setData(extra: Partial<ContractsListResult> = {}) {
    state.data = {
        contracts: rows,
        stats: stats(),
        footer: stats({ total: 4, total_sales: 520_310_000, prepayment_due: 135_093_000, area: 77.58, overdue_amount: 397_977_420 }),
        latestImport: { report_date: '2026-10-22', file_name: 'HUB data 1.xlsx', row_count: 83, not_in_file: 10 },
        facets: { blocks: ['Б1', 'Б2'], paymentConditions: ['Тусгай', 'Энгийн'], productTypes: ['parking', 'residential'] },
        pagination: { total: 4, page: 1, pageSize: 25, totalPages: 1, hasMore: false },
        ...extra,
    };
}
// Хүснэгт том тул role/accessible-name хайлтын оронд DOM, текстээр (ачаалалтай CI-д хурдан).
const rowOf = (text: string) => screen.getAllByText(text)[0].closest('tr')!;
const cellsOf = (row: HTMLElement) => Array.from(row.querySelectorAll('td'));
const headers = () => Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
const button = (name: string) => screen.getByText(name, { selector: 'button, button *' }).closest('button')!;
const link = (name: string) => screen.queryByText(name, { selector: 'a, a *' })?.closest('a') ?? null;
const footerRow = () => screen.getByText(/^Нийт ·/).closest('tr')!;
const lastParams = () => state.params.at(-1)!;

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    state.params = [];
    state.search = new URLSearchParams();
    state.canViewTeam = true;
    state.isManager = undefined;
    state.user = { role: 'admin', permissions: { canWrite: true, modules: ['contracts', 'erp-imports', 'reports'] } };
    setData();
});

describe('ContractsPage — HUB view', () => {
    it('shows exactly the 16 HUB columns in the file\'s order by default', () => {
        render(<ContractsPage />);
        expect(screen.getByText('Гэрээнүүд', { selector: 'h1' })).toBeInTheDocument();
        expect(screen.getByText('ERP-ийн HUB загвараар')).toBeInTheDocument();
        expect(headers()).toEqual([...CONTRACT_LIST_COLUMNS]);
        expect(button('HUB загвар')).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders HUB cells: type, block, unit, floor, money without ₮, HUB status words and the name fallback', () => {
        render(<ContractsPage />);
        const flat = cellsOf(rowOf('397,977,420'));
        expect(flat.map((cell) => cell.textContent)).toEqual([
            'Орон сууц', 'Б1', '19', 'B1', 'A-2', '64.33', '30%', '7,000,000', '450,310,000', '135,093,000', '397,977,420', '2026-10-05', 'Гэрээ үүссэн', 'Болд', 'Батаа', 'Тусгай',
        ]);
        expect(flat[10].querySelector('span')).toHaveClass('text-status-danger');

        const parking = cellsOf(rowOf('110'));
        expect(parking[0]).toHaveTextContent('Зогсоол');
        // ERP нэгжийн үнэ (₮/м² хоосон) — тайлбартай.
        expect(within(parking[7]).getByTitle('Нэгжийн үнэ (ERP-ийн загвараар)')).toHaveTextContent('35,000,000');
        expect(parking[9]).toHaveTextContent('—');
        expect(parking[10]).toHaveTextContent('—');
        expect(parking[12]).toHaveTextContent('Гэрээ хаасан');
        expect(within(parking[13]).getByTitle('Нэр, овог салгаагүй — бүтэн нэр')).toHaveTextContent('Сарангэрэл.Сайнбаяр');
        expect(parking[14]).toHaveTextContent('—');
        expect(screen.queryByText(/₮/, { selector: 'td, td *' })).not.toBeInTheDocument();
    });

    it('tells a known zero overdue («0») from an unknown one and shows system overdue days separately', () => {
        render(<ContractsPage />);
        const zero = cellsOf(rowOf('7'))[10];
        expect(zero).toHaveTextContent(/^0$/);
        expect(zero.querySelector('span')).toHaveClass('text-muted-foreground');
        const days = cellsOf(rowOf('8'));
        expect(days[10]).toHaveTextContent('12 хоног*');
        expect(days[11]).toHaveTextContent('—');
    });

    it('sums the filtered set in a sticky footer', () => {
        render(<ContractsPage />);
        const footer = footerRow();
        expect(footer).toHaveTextContent('Нийт · 4 гэрээ');
        expect(footer).toHaveTextContent('77.58');
        expect(footer).toHaveTextContent('520,310,000');
        expect(footer).toHaveTextContent('135,093,000');
        expect(footer).toHaveTextContent('397,977,420');
    });

    it('opens the contract detail from a row', () => {
        render(<ContractsPage />);
        fireEvent.click(rowOf('397,977,420'));
        expect(state.push).toHaveBeenCalledWith('/dashboard/contracts/19');
    });
});

describe('ContractsPage — tiles and header', () => {
    it('shows contract count, value without cancelled, advance owed and overdue from the latest HUB file', () => {
        render(<ContractsPage />);
        expect(screen.getByText('2 идэвхтэй · 1 хаагдсан · 1 цуцалсан')).toBeInTheDocument();
        expect(screen.getByText('Цуцалсан 1 гэрээ хассан')).toBeInTheDocument();
        expect(screen.getByText('Гэрээний нөхцлөөр · орсон мөнгө биш')).toBeInTheDocument();
        expect(screen.getByText('2.48 тэрбум ₮')).toHaveClass('text-status-danger');
        expect(screen.getByText('18 гэрээ · 2026-10-22-ны файлаар · 2 гэрээний хоцролт өмнөх файлынх')).toBeInTheDocument();
        expect(screen.getByText(/Сүүлийн HUB файл:/)).toHaveTextContent('Сүүлийн HUB файл: 2026-10-22 · 83 мөр · 10 гэрээ файлд байхгүй');
    });

    it('does not call overdue «not recorded» when only an older file\'s amounts exist', () => {
        setData({ stats: stats({ overdue_amount: null, overdue_count: 0, overdue_stale: 3, overdue_days_count: 0 }) });
        render(<ContractsPage />);
        expect(screen.getByText('Бүртгээгүй · 3 гэрээний хоцролт өмнөх файлынх')).toBeInTheDocument();
    });

    it('hides the paid/balance tiles when every live contract\'s paid amount is unknown, never showing 0₮', () => {
        render(<ContractsPage />);
        expect(screen.queryByText('Гэрээнд бүртгэсэн төлөлт')).not.toBeInTheDocument();
        expect(screen.queryByText(/^0\s?₮$/)).not.toBeInTheDocument();
    });

    it('keeps the paid/balance tiles while some paid amounts are known, naming the unknown ones', () => {
        setData({ stats: stats({ unknown_paid: 1, total_paid: 80_000_000, total_balance: 470_000_000 }) });
        render(<ContractsPage />);
        expect(screen.getByText('Гэрээнд бүртгэсэн төлөлт')).toBeInTheDocument();
        expect(screen.getByText('80 сая ₮')).toBeInTheDocument();
        expect(screen.getAllByText('1 гэрээний төлсөн дүн тодорхойгүй (ERP)')).toHaveLength(2);
    });

    it('offers the import and the plan only to users who can use them', () => {
        const { unmount } = render(<ContractsPage />);
        expect(link('Excel импорт')).toHaveAttribute('href', '/dashboard/contracts/import');
        expect(link('Төлөвлөгөөний биелэлт')).toHaveAttribute('href', '/dashboard/reports/plan');
        expect(link('Гэрээ үүсгэх')).toHaveAttribute('href', '/dashboard/contracts/generate');
        unmount();

        // Хувийн горимын менежер (reports эрхтэй ч) багийн төлөвлөгөө руу орохгүй — сервер 403 өгнө.
        state.user = { role: 'sales_manager', permissions: { canWrite: true, modules: ['contracts', 'reports'] } };
        state.canViewTeam = false;
        const second = render(<ContractsPage />);
        expect(link('Excel импорт')).toBeNull();
        expect(link('Төлөвлөгөөний биелэлт')).toBeNull();
        second.unmount();

        state.user = { role: 'viewer', permissions: { canWrite: false, modules: ['contracts', 'erp-imports'] } };
        render(<ContractsPage />);
        expect(link('Excel импорт')).toBeNull();
        expect(link('Гэрээ үүсгэх')).toBeNull();
    });

    it('hides «Excel импорт» from a restricted sales manager even with both write grants (the server answers 403)', () => {
        // Анхдагч sales_manager дүр contracts, erp-imports бичих эрхтэй ч хувийн горимд импорт хийхгүй.
        state.user = { role: 'sales_manager', permissions: { canWrite: true, modules: ['contracts', 'erp-imports', 'reports'] } };
        state.isManager = true;
        render(<ContractsPage />);
        expect(link('Excel импорт')).toBeNull();
        expect(link('Гэрээ үүсгэх')).toHaveAttribute('href', '/dashboard/contracts/generate');
    });

    it('downloads either export and lets the server name the file', async () => {
        render(<ContractsPage />);
        fireEvent.keyDown(button('Excel татах'), { key: 'Enter' });
        fireEvent.click(await screen.findByText('HUB загвар (16 багана)'));
        await waitFor(() => expect(state.download).toHaveBeenCalledWith('/api/dashboard/export/excel?type=contracts_hub'));
        fireEvent.keyDown(button('Excel татах'), { key: 'Enter' });
        fireEvent.click(await screen.findByText('Дэлгэрэнгүй (төлбөр, менежер, шилжүүлэг)'));
        await waitFor(() => expect(state.download).toHaveBeenLastCalledWith('/api/dashboard/export/excel?type=contracts'));
    });
});

describe('ContractsPage — filters', () => {
    it('opens with the overdue filter from a notification link (?filter=overdue)', () => {
        state.search = new URLSearchParams('filter=overdue');
        render(<ContractsPage />);
        expect(button('Хоцролттой')).toHaveAttribute('aria-pressed', 'true');
        expect(lastParams()).toMatchObject({ overdue: true, page: 1, sortBy: 'contract_date', sortOrder: 'desc' });
    });

    it('opens with the undated filter (?filter=undated) and can clear it', () => {
        state.search = new URLSearchParams('filter=undated');
        render(<ContractsPage />);
        const toggle = button('Огноогүй');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(lastParams().undated).toBe(true);
        fireEvent.click(toggle);
        expect(lastParams().undated).toBe(false);
    });

    it('sends type, block, payment condition, «not in the latest file» and the order-date range to the API', () => {
        render(<ContractsPage />);
        fireEvent.change(screen.getByLabelText('Төрөл'), { target: { value: 'parking' } });
        fireEvent.change(screen.getByLabelText('Блок'), { target: { value: 'Б2' } });
        fireEvent.change(screen.getByLabelText('Захиалгын нөхцөл'), { target: { value: 'Энгийн' } });
        fireEvent.click(button('Сүүлийн файлд байхгүй'));
        fireEvent.change(screen.getByLabelText('Захиалга өгсөн огноо — эхлэх'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('Захиалга өгсөн огноо — дуусах'), { target: { value: '2026-10-31' } });
        expect(lastParams()).toMatchObject({ productType: 'parking', block: 'Б2', paymentCondition: 'Энгийн', notInLatest: true, from: '2026-10-01', to: '2026-10-31', page: 1 });
        fireEvent.click(button('Цэвэрлэх'));
        expect(lastParams()).toMatchObject({ productType: 'all', block: 'all', paymentCondition: 'all', notInLatest: false, from: undefined, to: undefined });
    });

    it('labels statuses with the HUB words in the HUB view', () => {
        render(<ContractsPage />);
        const status = screen.getByLabelText('Төлөв');
        expect(Array.from(status.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Бүгд', 'Гэрээ үүссэн', 'Гэрээ хаасан', 'Цуцлагдсан', 'Тоот шилжсэн']);
    });

    it('sorts by a HUB column and changes the page size', () => {
        render(<ContractsPage />);
        fireEvent.click(button('Төлбөр хоцролт'));
        expect(lastParams()).toMatchObject({ sortBy: 'overdue_amount', sortOrder: 'desc' });
        fireEvent.click(button('Нэр'));
        expect(lastParams()).toMatchObject({ sortBy: 'customer_first_name', sortOrder: 'asc' });
        fireEvent.change(screen.getByLabelText('Хуудсанд'), { target: { value: '100' } });
        expect(lastParams()).toMatchObject({ pageSize: 100, page: 1 });
    });
});

describe('ContractsPage — «Төлбөр, менежер» view', () => {
    it('switches views, remembers the choice and keeps «—» for an unknown paid amount', () => {
        render(<ContractsPage />);
        fireEvent.click(button('Төлбөр, менежер'));
        expect(localStorage.getItem('vh-contracts-view')).toBe('payments');
        expect(headers()).toEqual(['Гэрээ', 'Харилцагч', 'Блок / Тоот', 'Нийт үнэ', 'Төлсөн', 'Үлдэгдэл', 'Менежер', 'Төлөв']);
        const row = screen.getByText('Б1-19 (B1)').closest('tr')!;
        const cells = cellsOf(row);
        expect(cells[2]).toHaveTextContent('Блок Б1 / 19');
        expect(cells[4]).toHaveTextContent('—');
        expect(cells[4]).not.toHaveTextContent('0%');
        expect(cells[5]).toHaveTextContent('—');
        // Хөлд: бүх төлсөн дүн тодорхойгүй бол «—».
        expect(cellsOf(footerRow())[2]).toHaveTextContent('—');
    });

    it('opens in the remembered view', () => {
        localStorage.setItem('vh-contracts-view', 'payments');
        render(<ContractsPage />);
        expect(button('Төлбөр, менежер')).toHaveAttribute('aria-pressed', 'true');
        expect(headers()).toContain('Менежер');
    });

    it('marks a footer paid sum as a lower bound while some paid amounts are unknown', () => {
        localStorage.setItem('vh-contracts-view', 'payments');
        setData({ footer: stats({ total: 4, cancelled: 1, unknown_paid: 1, total_paid: 80_000_000, total_balance: 470_000_000 }) });
        render(<ContractsPage />);
        expect(cellsOf(footerRow())[2]).toHaveTextContent('80,000,000₮+');
    });

    it('still renders the old API shape without the new optional fields', () => {
        setData({ stats: { total: 3, active: 3, closed: 0, total_sales: 1_014_000_000, total_paid: 240_000_000, total_balance: 774_000_000, overdue_count: 1 }, footer: undefined, latestImport: undefined, facets: undefined });
        render(<ContractsPage />);
        expect(screen.getByText('3 идэвхтэй · 0 хаагдсан · 0 цуцалсан')).toBeInTheDocument();
        expect(screen.getByText('Гэрээнд бүртгэсэн төлөлт')).toBeInTheDocument();
        expect(screen.queryByText(/^Нийт ·/)).not.toBeInTheDocument();
        expect(screen.queryByText('Сүүлийн файлд байхгүй')).not.toBeInTheDocument();
    });
});
