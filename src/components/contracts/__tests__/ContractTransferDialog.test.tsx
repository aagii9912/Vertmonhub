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

function renderDialog(onOpenChange = vi.fn(), previousChangeDate: string | null = null) {
    const view = render(<ContractTransferDialog contract={contract} open onOpenChange={onOpenChange} previousChangeDate={previousChangeDate} />);
    return Object.assign(onOpenChange, { rerender: (next: ContractRow) => view.rerender(<ContractTransferDialog contract={next} open onOpenChange={onOpenChange} previousChangeDate={previousChangeDate} />) });
}

function fillTransfer() {
    fireEvent.change(screen.getByLabelText(/Шинэ эзэмшигчийн нэр/), { target: { value: 'Дорж Сараа' } });
    fireEvent.change(screen.getByLabelText(/Регистр/), { target: { value: 'чб88020202' } });
    fireEvent.change(screen.getByLabelText(/Шалтгаан/), { target: { value: 'Худалдсан' } });
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

    it('after a 409 sends a fresh request against the refreshed holder instead of the stale one', async () => {
        const onOpenChange = renderDialog();
        fillTransfer();
        hooks.mutateAsync.mockRejectedValueOnce(Object.assign(new Error('Гэрээний эзэмшигч өөрчлөгдсөн байна'), { status: 409 }));
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Гэрээний эзэмшигч өөрчлөгдсөн байна');
        // Хук алдааны үед гэрээг дахин уншина — цонх шинэ эзэмшигчийг харуулна.
        onOpenChange.rerender({ ...contract, customer_name: 'Ганаа' } as ContractRow);
        expect(screen.getByRole('dialog')).toHaveTextContent('Ганаа');
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        const [first, second] = hooks.mutateAsync.mock.calls.map(call => call[0]);
        expect(first.expected_customer_name).toBe('Бат Болд');
        expect(second.expected_customer_name).toBe('Ганаа');
        expect(second.client_request_id).not.toBe(first.client_request_id);
    });

    it('keeps the retry payload identical after other errors, so a committed transfer replays', async () => {
        const onOpenChange = renderDialog();
        fillTransfer();
        hooks.mutateAsync.mockRejectedValueOnce(Object.assign(new Error('Гэрээ шилжүүлснийг баталгаажуулж чадсангүй'), { status: 500 }));
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        await screen.findByRole('alert');
        onOpenChange.rerender({ ...contract, customer_name: 'Дорж Сараа' } as ContractRow);
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        const [first, second] = hooks.mutateAsync.mock.calls.map(call => call[0]);
        expect(second).toEqual(first);
    });

    it('does not allow a date before the latest holder change', async () => {
        renderDialog(vi.fn(), '2026-09-30');
        const date = screen.getByLabelText(/Шилжүүлсэн огноо/);
        expect(date).toHaveAttribute('min', '2026-09-30');
        fillTransfer();
        fireEvent.change(date, { target: { value: '2026-06-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Шилжүүлэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('өмнөх өөрчлөлтийн огнооноос (2026-09-30)');
        expect(hooks.mutateAsync).not.toHaveBeenCalled();
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
