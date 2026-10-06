// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './page';

// AuthContext-ийн state шиг тогтвортой объектууд (render бүрт шинэ shop өгвөл форм дахин ачаалагдана).
const auth = vi.hoisted(() => ({
    user: { id: 'user-1', email: 'manager@vertmon.mn' },
    shop: { id: 'shop-1', name: 'Mandala Garden', owner_name: 'Б. Батбаяр', phone: null },
    refreshShop: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const push = vi.hoisted(() => ({
    state: { isSupported: true, isSubscribed: false, isLoading: false, permission: 'default' as NotificationPermission | null },
    subscribe: vi.fn(async () => true),
    unsubscribe: vi.fn(async () => true),
}));
vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: () => ({ ...push.state, subscribe: push.subscribe, unsubscribe: push.unsubscribe }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Лидийн ангиллын хэсэг өөрийн тесттэй (react-query) — энд төслийн талбар, push-ийг шалгана.
vi.mock('@/components/settings/LeadCategoriesSettings', () => ({ LeadCategoriesSettings: () => null }));

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];

function stubFetch(respond: () => Promise<Partial<Response>> | Partial<Response>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return respond();
    }));
}

beforeEach(() => {
    push.state = { isSupported: true, isSubscribed: false, isLoading: false, permission: 'default' };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    calls.length = 0;
});

describe('settings page', () => {
    it('shows only fields the shops table stores and sends exactly those to PATCH /api/shop', async () => {
        let resolve!: (value: Partial<Response>) => void;
        stubFetch(() => new Promise(r => { resolve = r; }));
        render(<SettingsPage />);

        expect(screen.getByLabelText('Төслийн нэр')).toHaveValue('Mandala Garden');
        expect(screen.getByLabelText('Удирдлагын нэр')).toHaveValue('Б. Батбаяр');
        expect(screen.getByLabelText(/Утасны дугаар/)).toHaveValue('');
        // Хадгалагдах багана байхгүй удирдлагууд хасагдсан.
        expect(screen.queryByLabelText(/Имэйл хаяг/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/^Хаяг/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Вэб сайт/)).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/Утасны дугаар/), { target: { value: ' 99112233 ' } });
        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));

        await waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0].url).toBe('/api/shop');
        expect(calls[0].init?.method).toBe('PATCH');
        expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Mandala Garden', owner_name: 'Б. Батбаяр', phone: '99112233' });

        // Сервер баталгаажуулахаас өмнө амжилт харуулахгүй.
        expect(screen.queryByText('Хадгалагдлаа!')).not.toBeInTheDocument();
        resolve({ ok: true, status: 200, json: async () => ({ shop: { id: 'shop-1' } }) });
        expect(await screen.findByText('Хадгалагдлаа!')).toBeInTheDocument();
        expect(auth.refreshShop).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the server error inline in Mongolian and never reports success', async () => {
        stubFetch(() => ({ ok: false, status: 403, json: async () => ({ error: 'Энэ хэсэгт хандах эрх танд алга' }) }));
        render(<SettingsPage />);

        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Хадгалж чадсангүй: Энэ хэсэгт хандах эрх танд алга');
        expect(screen.queryByText('Хадгалагдлаа!')).not.toBeInTheDocument();
        expect(auth.refreshShop).not.toHaveBeenCalled();
    });

    it('reports network failures and an empty project name without claiming a save', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        render(<SettingsPage />);

        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Хадгалж чадсангүй: Сүлжээний алдаа. Дахин оролдоно уу.');

        fireEvent.change(screen.getByLabelText('Төслийн нэр'), { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: /Хадгалах/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Төслийн нэрийг оруулна уу.');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(auth.refreshShop).not.toHaveBeenCalled();
    });

    it('offers only the stored device push opt-in instead of switches that never saved', async () => {
        render(<SettingsPage />);

        expect(screen.getAllByRole('switch')).toHaveLength(1);
        expect(screen.queryByText('Имэйл мэдэгдэл')).not.toBeInTheDocument();
        expect(screen.queryByText('Шинэ Lead мэдэгдэл')).not.toBeInTheDocument();
        expect(screen.queryByText('Долоо хоногийн тайлан')).not.toBeInTheDocument();

        const toggle = screen.getByRole('switch', { name: 'Push мэдэгдэл' });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
        await waitFor(() => expect(push.subscribe).toHaveBeenCalledTimes(1));
        expect(push.unsubscribe).not.toHaveBeenCalled();
    });

    it('turns push off through the subscription API and disables the switch when the browser cannot', async () => {
        push.state = { ...push.state, isSubscribed: true };
        const { unmount } = render(<SettingsPage />);
        const toggle = screen.getByRole('switch', { name: 'Push мэдэгдэл' });
        expect(toggle).toBeChecked();
        fireEvent.click(toggle);
        await waitFor(() => expect(push.unsubscribe).toHaveBeenCalledTimes(1));
        unmount();

        push.state = { ...push.state, isSubscribed: false, permission: 'denied' };
        const denied = render(<SettingsPage />);
        expect(screen.getByRole('switch', { name: 'Push мэдэгдэл' })).toBeDisabled();
        expect(screen.getByText(/мэдэгдлийг хориглосон/)).toBeInTheDocument();
        denied.unmount();

        // Дэмжлэгийг шалгаж байх үед «дэмжихгүй» гэж харуулахгүй, шалгасны дараа л харуулна.
        push.state = { isSupported: false, isSubscribed: false, isLoading: true, permission: null };
        const checking = render(<SettingsPage />);
        expect(screen.getByRole('switch', { name: 'Push мэдэгдэл' })).toBeDisabled();
        expect(screen.queryByText(/дэмжихгүй/)).not.toBeInTheDocument();
        checking.unmount();

        push.state = { ...push.state, isLoading: false };
        render(<SettingsPage />);
        expect(screen.getByRole('switch', { name: 'Push мэдэгдэл' })).toBeDisabled();
        expect(screen.getByText('Энэ хөтөч push мэдэгдэл дэмжихгүй байна.')).toBeInTheDocument();
    });
});
