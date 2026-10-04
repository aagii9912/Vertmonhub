// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/useContracts', () => ({ useTransferContract: () => hooks }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContractTransferDialog } from '../ContractTransferDialog';
import type { ContractRow } from '@/hooks/useContracts';
import { ubDateStr } from '@/lib/utils/date';

const contract = {
    id: 'contract-1', contract_number: 'MG-101', contract_date: '2026-01-15', contract_status: 'active',
    customer_name: 'Бат Болд', customer_first_name: 'Болд', customer_last_name: 'Бат', customer_registration: 'УБ99010101',
    total_price: 300000000, paid_amount: 120000000, balance: 180000000,
} as unknown as ContractRow;

function renderDialog(onOpenChange = vi.fn()) {
    render(<ContractTransferDialog contract={contract} open onOpenChange={onOpenChange} />);
    return onOpenChange;
}

beforeEach(() => {
    hooks.mutateAsync.mockReset();
    hooks.mutateAsync.mockResolvedValue({ message: 'Гэрээ шилжүүлэгдлээ' });
});

describe('ContractTransferDialog', () => {
    it('shows the current holder and money that stays, and validates before sending', async () => {
        renderDialog();
        expect(screen.getByRole('dialog', { name: 'Гэрээ шилжүүлэх' })).toHaveTextContent('Бат Болд');
        expect(screen.getByText('Төлсөн (хэвээр)').nextSibling).toHaveTextContent('120,000,000');
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Шинэ эзэмшигчийн нэрийг оруулна уу');
        fireEvent.change(screen.getByLabelText('Овог'), { target: { value: 'Дорж' } });
        fireEvent.change(screen.getByLabelText('Нэр'), { target: { value: 'Сараа' } });
        expect(screen.getByLabelText(/Шинэ эзэмшигчийн нэр/)).toHaveValue('Дорж Сараа');
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Шинэ эзэмшигчийн регистрийг оруулна уу');
        expect(hooks.mutateAsync).not.toHaveBeenCalled();
    });

    it('sends one stable request with the stale-holder guard and closes on success', async () => {
        const onOpenChange = renderDialog();
        fireEvent.change(screen.getByLabelText(/Шинэ эзэмшигчийн нэр/), { target: { value: 'Дорж Сараа' } });
        fireEvent.change(screen.getByLabelText(/Регистр/), { target: { value: 'чб88020202' } });
        fireEvent.change(screen.getByLabelText(/Шалтгаан/), { target: { value: 'Худалдсан' } });
        hooks.mutateAsync.mockRejectedValueOnce(new Error('Гэрээний эзэмшигч өөрчлөгдсөн байна'));
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Гэрээний эзэмшигч өөрчлөгдсөн байна');
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        const [first, second] = hooks.mutateAsync.mock.calls.map(call => call[0]);
        expect(first).toMatchObject({
            kind: 'transfer', customer_name: 'Дорж Сараа', customer_registration: 'чб88020202', reason: 'Худалдсан',
            effective_date: ubDateStr(), expected_customer_name: 'Бат Болд',
        });
        expect(second.client_request_id).toBe(first.client_request_id);
    });

    it('prefills the current name for a same-person rename and sends no registration or phone', async () => {
        renderDialog();
        fireEvent.click(screen.getByLabelText('Нэр засах (ижил хүн)'));
        expect(screen.queryByLabelText(/Регистр/)).not.toBeInTheDocument();
        const name = screen.getByLabelText(/Зассан нэр/);
        expect(name).toHaveValue('Бат Болд');
        fireEvent.change(name, { target: { value: 'Бат-Болд' } });
        fireEvent.click(screen.getByRole('button', { name: 'Нэр засах' }));
        await waitFor(() => expect(hooks.mutateAsync).toHaveBeenCalledTimes(1));
        const sent = hooks.mutateAsync.mock.calls[0][0];
        expect(sent).toMatchObject({ kind: 'rename', customer_name: 'Бат-Болд', customer_last_name: 'Бат', customer_first_name: 'Болд' });
        expect(sent).not.toHaveProperty('customer_registration');
        expect(sent).not.toHaveProperty('customer_phone');
    });
});
