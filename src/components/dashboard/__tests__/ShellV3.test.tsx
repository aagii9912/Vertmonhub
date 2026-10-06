// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type TestUser = { role: string; fullName?: string; email?: string; permissions: { modules: string[]; canWrite: boolean } };
const state = vi.hoisted(() => ({
    path: '/dashboard',
    user: null as unknown as TestUser,
    push: vi.fn(),
    json: vi.fn(),
    quick: vi.fn(),
    ai: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => state.path, useRouter: () => ({ push: state.push }) }));
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ user: state.user, shop: { id: 'shop-1', name: 'Мандала Гарден' }, shops: [{ id: 'shop-1', name: 'Мандала Гарден' }], switchShop: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => ({ data: { mode: 'personal' } }) }));
vi.mock('@/hooks/useNavCounts', () => ({ useNavCounts: () => ({ leads: 4, inbox: 2 }) }));
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }));
vi.mock('@/components/feedback/FeedbackWidget', () => ({ FeedbackWidget: () => null }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (url: string) => state.json(url) }));
vi.mock('@/lib/ai/context', () => ({ openAiPanel: (...args: unknown[]) => state.ai(...args) }));
vi.mock('@/lib/navigation/commandPalette', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/navigation/commandPalette')>();
    return { ...actual, openQuickCreate: (kind: string) => state.quick(kind) };
});

import { Sidebar } from '../Sidebar';
import { Header } from '../Header';
import { CommandPalette } from '../CommandPalette';
import { ShortcutsDialog } from '../ShortcutsDialog';
import { openCommandPalette } from '@/lib/navigation/commandPalette';
import { ANONYMOUS_LEAD_LABEL } from '@/lib/leads/labels';

// cmdk (⌘K) jsdom-д байхгүй DOM API хэрэглэдэг.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const manager: TestUser = { role: 'sales_manager', fullName: 'Д. Номин', permissions: { modules: ['dashboard', 'leads', 'viewings', 'inbox', 'ai-assistant', 'settings'], canWrite: true } };
const viewer: TestUser = { role: 'viewer', fullName: 'Б. Бат', permissions: { modules: ['dashboard', 'contracts'], canWrite: false } };
const superAdmin: TestUser = { role: 'super_admin', fullName: 'Админ', permissions: { modules: [], canWrite: true } };

function withQuery(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
    vi.clearAllMocks();
    state.path = '/dashboard';
    state.user = manager;
    localStorage.clear();
});

describe('Sidebar v3', () => {
    it('shows only the sections and items the user may open, with live counts', () => {
        render(<Sidebar />);
        const nav = screen.getByRole('navigation', { name: 'Үндсэн цэс' });
        expect(within(nav).getByRole('link', { name: 'Өнөөдөр' })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).getByText('Борлуулалт')).toBeInTheDocument();
        expect(within(nav).getByRole('link', { name: /Лид/ })).toHaveTextContent('4');
        expect(within(nav).getByRole('link', { name: /Мессеж/ })).toHaveTextContent('2');
        expect(within(nav).queryByRole('link', { name: 'Гэрээ' })).not.toBeInTheDocument();
        // Үр дүнгээс зөвхөн эрхтэй нь (Хурлын бэлтгэл = dashboard); Тайлан, Маркетинг нуугдана.
        expect(within(nav).getByRole('link', { name: 'Хурлын бэлтгэл' })).toBeInTheDocument();
        expect(within(nav).queryByRole('link', { name: 'Тайлан' })).not.toBeInTheDocument();
        expect(within(nav).queryByText('Удирдлага')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Тохиргоо' })).toBeInTheDocument();
    });

    it('gives super_admin a collapsible «Удирдлага» group that stays open on admin pages', () => {
        state.user = superAdmin;
        const { unmount } = render(<Sidebar />);
        const toggle = screen.getByRole('button', { name: /Удирдлага/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('link', { name: 'Хэрэглэгчид' })).not.toBeInTheDocument();
        fireEvent.click(toggle);
        expect(screen.getByRole('link', { name: 'Хэрэглэгчид' })).toHaveAttribute('href', '/admin/users');
        unmount();

        state.path = '/admin/roles';
        render(<Sidebar />);
        expect(screen.getByRole('button', { name: /Удирдлага/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('link', { name: 'Дүрүүд' })).toHaveAttribute('aria-current', 'page');
    });
});

describe('Header v3', () => {
    it('shows project / page and writes the browser tab title', () => {
        state.path = '/dashboard/leads/pipeline';
        render(<Header />);
        const crumbs = screen.getByRole('navigation', { name: 'Замын мөр' });
        expect(crumbs).toHaveTextContent('Мандала Гарден');
        expect(within(crumbs).getByRole('link', { name: 'Лид' })).toHaveAttribute('href', '/dashboard/leads');
        expect(within(crumbs).getByText('Шатаар')).toHaveAttribute('aria-current', 'page');
        expect(document.title).toBe('Шатаар · Vertmon Hub');
    });

    it('offers only creatable items under «Шинэ»', () => {
        render(<Header />);
        fireEvent.keyDown(screen.getByRole('button', { name: /Шинэ/ }), { key: 'Enter' });
        expect(screen.getByRole('menuitem', { name: /Лид/ })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Уулзалт/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: /Ажил/ }));
        expect(state.quick).toHaveBeenCalledWith('task');
    });

    it('a read-only user can add personal tasks but no leads or meetings, and sees no inbox or AI', () => {
        state.user = viewer;
        render(<Header />);
        fireEvent.keyDown(screen.getByRole('button', { name: /Шинэ/ }), { key: 'Enter' });
        expect(screen.queryByRole('menuitem', { name: /Лид/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /Уулзалт/ })).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Ажил/ })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Мессежүүд/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /AI туслах/ })).not.toBeInTheDocument();
    });

    it('opens the AI panel and quick lead from the keyboard (N works on any keyboard layout)', () => {
        render(<Header />);
        fireEvent.click(screen.getByRole('button', { name: 'AI туслах (⌘J)' }));
        expect(state.ai).toHaveBeenCalled();
        fireEvent.keyDown(window, { key: 'ү', code: 'KeyN' });
        expect(state.quick).toHaveBeenCalledWith('lead');
    });
});

describe('CommandPalette v3', () => {
    it('finds leads and contracts through the scoped list APIs the user may read', async () => {
        state.user = { ...manager, permissions: { ...manager.permissions, modules: [...manager.permissions.modules, 'contracts'] } };
        state.json.mockImplementation(async (url: string) => url.startsWith('/api/dashboard/leads')
            ? { leads: [{ id: 'lead-1', customer_name: null, customer_phone: '99112233' }] }
            : { contracts: [{ id: 'c-1', contract_number: 'VM-2026-001', customer_name: 'Б. Болд', unit_label: 'A-1201' }] });
        render(withQuery(<CommandPalette />));
        act(() => openCommandPalette());
        fireEvent.change(screen.getByPlaceholderText('Хуудас, лид, гэрээ хайх…'), { target: { value: '9911' } });
        await waitFor(() => expect(screen.getByText('VM-2026-001')).toBeInTheDocument());
        expect(state.json).toHaveBeenCalledWith('/api/dashboard/leads?q=9911&page=1&pageSize=5');
        expect(state.json).toHaveBeenCalledWith('/api/dashboard/contracts?search=9911&page=1&pageSize=5');
        // Нэргүй лид шошгоор (leadDisplayName), хэзээ ч хоосон биш.
        expect(screen.getByText(ANONYMOUS_LEAD_LABEL)).toBeInTheDocument();
        fireEvent.click(screen.getByText('VM-2026-001'));
        expect(state.push).toHaveBeenCalledWith('/dashboard/contracts/c-1');
    });

    it('does not call record APIs for modules the user cannot read or for short queries', async () => {
        state.user = viewer;
        state.json.mockResolvedValue({ contracts: [] });
        render(withQuery(<CommandPalette />));
        act(() => openCommandPalette());
        const input = screen.getByPlaceholderText('Хуудас, лид, гэрээ хайх…');
        fireEvent.change(input, { target: { value: 'V' } });
        await new Promise((r) => setTimeout(r, 320));
        expect(state.json).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: 'VM' } });
        await waitFor(() => expect(state.json).toHaveBeenCalledTimes(1));
        expect(state.json.mock.calls[0][0]).toMatch(/^\/api\/dashboard\/contracts\?search=VM/);
    });
});

describe('ShortcutsDialog', () => {
    it('lists the shortcuts on «?» and jumps with G → L', () => {
        render(<ShortcutsDialog />);
        fireEvent.keyDown(window, { key: '?', code: 'Slash', shiftKey: true });
        expect(screen.getByRole('dialog', { name: 'Гарын товчлол' })).toBeInTheDocument();
        fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' });
    });

    it('jumps to an allowed page with G then a letter, ignoring forbidden targets', () => {
        render(<ShortcutsDialog />);
        fireEvent.keyDown(window, { key: 'п', code: 'KeyG' });
        fireEvent.keyDown(window, { key: 'д', code: 'KeyL' });
        expect(state.push).toHaveBeenCalledWith('/dashboard/leads');
        fireEvent.keyDown(window, { key: 'g', code: 'KeyG' });
        fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
        expect(state.push).toHaveBeenCalledTimes(1);
    });
});
