// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractRow, ContractsListResult } from '@/hooks/useContracts';

const list = vi.hoisted(() => ({ data: undefined as ContractsListResult | undefined }));
vi.mock('@/hooks/useContracts', () => ({ useContractsList: () => ({ data: list.data, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/hooks/useLeads', () => ({ useManagers: () => ({ data: [] }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', permissions: { canWrite: true, modules: ['contracts'] } } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardDownload: vi.fn() }));

import { ContractsPage } from '../ContractsPage';

const erpContract = {
    id: 'c-erp', contract_number: null, contract_date: null, contract_status: 'active', unit_label: 'Б1-19 (B1)',
    block_name: 'Б1', legacy_unit_number: '19', customer_name: 'Сарангэрэл.Сайнбаяр',
    total_price: 79700000, paid_amount: null, balance: null, overdue_days: 0, sales_manager: 'Хонгорзул.Мөнхгэрэл',
} as unknown as ContractRow;

describe('ContractsPage', () => {
    it('shows «—» for an ERP contract whose paid amount is unknown, never 0₮ or a full balance', () => {
        list.data = {
            contracts: [erpContract],
            stats: { total: 1, closed: 0, active: 1, total_sales: 79700000, total_paid: 0, total_balance: 0, overdue_count: 0, unknown_paid: 1 },
            pagination: { total: 1, page: 1, pageSize: 25, totalPages: 1, hasMore: false },
        };
        render(<ContractsPage />);
        const row = screen.getByText('Б1-19 (B1)').closest('tr')!;
        const cells = within(row).getAllByRole('cell');
        expect(cells[4]).toHaveTextContent('—');
        expect(cells[4]).not.toHaveTextContent('0%');
        expect(cells[5]).toHaveTextContent('—');
        // Төлөлт ба үлдэгдлийн KPI хоёул тодорхойгүйг ил хэлнэ.
        expect(screen.getAllByText('1 гэрээний төлсөн дүн тодорхойгүй (ERP)')).toHaveLength(2);
        expect(screen.queryByText(/^0\s?₮$/)).not.toBeInTheDocument();
    });
});
