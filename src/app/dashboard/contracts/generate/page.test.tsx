import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContractGeneratePage from './page';

const mocks = vi.hoisted(() => ({
    shop: { id: 'elysium-shop', name: 'Elysium Residence' } as { id: string; name: string } | null,
    fetch: vi.fn(),
    toastError: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: mocks.shop, user: { id: 'user-1', role: 'admin' } }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: (...args: unknown[]) => mocks.fetch(...args) }));
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mocks.toastError(...args) } }));

const MANDALA_SELLER = /МОНКОН|Мандала Гарден цогцолбор|Хан-Уул дүүрэг/;
const field = (name: RegExp) => screen.getByRole('textbox', { name });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.shop = { id: 'elysium-shop', name: 'Elysium Residence' };
});

describe('contract document generator', () => {
    it('uses the current project in the seller block instead of the hard-coded Mandala seller', () => {
        render(<ContractGeneratePage />);
        expect(field(/^Төсөл$/)).toHaveValue('Elysium Residence');
        expect(screen.getByText('___ — «Elysium Residence»')).toBeInTheDocument();
        expect(field(/^Худалдагч байгууллага$/)).toHaveValue('');
        expect(field(/^Төслийн хаяг$/)).toHaveValue('');
        expect(document.body).not.toHaveTextContent(MANDALA_SELLER);
    });

    it('cannot print until the seller, address and contract basics are filled, then prints the entered seller', () => {
        const write = vi.fn();
        const open = vi.spyOn(window, 'open').mockReturnValue({ document: { write, close: vi.fn() }, print: vi.fn() } as unknown as Window);
        render(<ContractGeneratePage />);
        const print = screen.getByRole('button', { name: /Хэвлэх \/ PDF/ });
        expect(print).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('Худалдагч байгууллага, Төслийн хаяг');
        expect(screen.queryByRole('button', { name: /Гэрээ шинэчлэх/ })).not.toBeInTheDocument();

        fireEvent.change(field(/^Худалдагч байгууллага$/), { target: { value: 'Элизиум Девелопмент ХХК' } });
        fireEvent.change(field(/^Төслийн хаяг$/), { target: { value: 'Улаанбаатар, Сүхбаатар дүүрэг' } });
        fireEvent.change(field(/^Нэр$/), { target: { value: 'Б. Болд' } });
        fireEvent.change(field(/^Код \/ нэр$/), { target: { value: 'A-1203' } });
        fireEvent.change(field(/^Нийт үнэ/), { target: { value: '450000000' } });
        expect(print).toBeEnabled();

        fireEvent.click(print);
        expect(open).toHaveBeenCalledOnce();
        const html = write.mock.calls[0][0] as string;
        expect(html).toContain('Элизиум Девелопмент ХХК — «Elysium Residence»');
        expect(html).toContain('Улаанбаатар, Сүхбаатар дүүрэг');
        expect(html).not.toMatch(MANDALA_SELLER);
        expect(mocks.fetch).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it('drops the previous project seller when the active project changes', () => {
        const { rerender } = render(<ContractGeneratePage />);
        fireEvent.change(field(/^Худалдагч байгууллага$/), { target: { value: 'Элизиум Девелопмент ХХК' } });
        mocks.shop = { id: 'mandala-shop', name: 'Mandala Garden' };
        rerender(<ContractGeneratePage />);
        expect(field(/^Төсөл$/)).toHaveValue('Mandala Garden');
        expect(field(/^Худалдагч байгууллага$/)).toHaveValue('');
        expect(document.body).not.toHaveTextContent('Элизиум Девелопмент ХХК');
    });
});
