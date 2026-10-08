import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectPricingSettings } from './ProjectPricingSettings';

const fetchMock = vi.fn();
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ latest: null, active: null }) });
    vi.stubGlobal('fetch', fetchMock);
});
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ProjectPricingSettings shopId="shop" projectName="Elysium" /></QueryClientProvider>);
}
it('starts empty with no copied prices or activation before review', async () => {
    mount();
    await screen.findByText('Идэвхтэй үнэ байхгүй.');
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
    expect(screen.queryByLabelText('1-р мөр м² үнэ (₮)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('эх сурвалж');
});
it('preserves a reviewed draft on save failure and requires another review after rate edits', async () => {
    mount(); await screen.findByText('Идэвхтэй үнэ байхгүй.');
    fireEvent.change(screen.getByLabelText('Эх сурвалж'), { target: { value: 'Баталсан 10.08 үнэ' } });
    fireEvent.change(screen.getByLabelText('Эхлэх огноо'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Дуусах огноо'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Үнийн мөр нэмэх' }));
    for (const [label, value] of [['Блок','Б1'], ['Загвар','E3'], ['Давхар эхлэх','2'], ['Давхар дуусах','9'], ['Нөхцөл','50%'], ['м² үнэ (₮)','4000000'], ['Эхний урьдчилгаа (%)','50']]) {
        fireEvent.change(screen.getByLabelText(`1-р мөр ${label}`), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeEnabled();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'Тохиргоо өөрчлөгдсөн' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Тохиргоо өөрчлөгдсөн'));
    expect(screen.getByLabelText('1-р мөр м² үнэ (₮)')).toHaveValue('4000000');
    expect(screen.getByRole('button', { name: 'Ноорог хадгалах' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('1-р мөр м² үнэ (₮)'), { target: { value: '4100000' } });
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх' }));
    await waitFor(() => expect(screen.queryByLabelText('1-р мөр м² үнэ (₮)')).not.toBeInTheDocument());
});
