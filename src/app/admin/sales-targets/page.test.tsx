import React, { type PropsWithChildren } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ invalidateQueries: vi.fn(async () => {}) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => query }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/Select', async () => {
    const React = await import('react');
    const Context = React.createContext<{ change: (value: string) => void; disabled?: boolean } | null>(null);
    return {
        Select: ({ onValueChange, disabled, children }: PropsWithChildren<{ onValueChange: (value: string) => void; disabled?: boolean }>) => <Context.Provider value={{ change: onValueChange, disabled }}>{children}</Context.Provider>,
        SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
        SelectTrigger: ({ children }: PropsWithChildren) => <span>{children}</span>,
        SelectValue: () => null,
        SelectItem: ({ value, children }: PropsWithChildren<{ value: string }>) => {
            const context = React.useContext(Context);
            return <button disabled={context?.disabled} onClick={() => context?.change(value)}>{children}</button>;
        },
    };
});
import Page from './page';

const response = (body: unknown) => ({ ok: true, json: async () => body });
const data = (target: number, name: string) => ({
    teamTarget: Array(12).fill(target), teamActual: Array(12).fill(0),
    managers: [{ name, is_active: true, user_id: null, year_actual: 0 }], teamMembers: [],
});
afterEach(() => vi.unstubAllGlobals());

it('ignores late reads from the previous shop and saves only the loaded current shop', async () => {
    let finishA!: (value: ReturnType<typeof response>) => void;
    let finishB!: (value: ReturnType<typeof response>) => void;
    const writes: object[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/shops') return response({ shops: [{ id: 'shop-a', name: 'Shop A' }, { id: 'shop-b', name: 'Shop B' }] });
        if (init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return response({ success: true }); }
        if (url.includes('shopId=shop-a')) return new Promise(resolve => { finishA = resolve; });
        if (writes.length) return response(data(222, 'Manager B'));
        return new Promise(resolve => { finishB = resolve; });
    }));
    render(<Page />);
    await waitFor(() => expect(finishA).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Shop B' }));
    await waitFor(() => expect(finishB).toBeTypeOf('function'));
    expect(screen.queryByRole('button', { name: 'Төлөвлөгөө хадгалах' })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await act(async () => finishB(response(data(222, 'Manager B'))));
    await act(async () => finishA(response(data(111, 'Manager A'))));
    expect(screen.queryByText('Manager A')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Төлөвлөгөө хадгалах' }));
    await waitFor(() => expect(writes).toMatchObject([{ shopId: 'shop-b', months: Array(12).fill(222) }]));
    await screen.findByText('Manager B');
});

it('ignores a previous year response after the new year loads', async () => {
    const year = new Date().getFullYear();
    let finishOld!: (value: ReturnType<typeof response>) => void;
    const writes: object[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/shops') return response({ shops: [{ id: 'shop-a', name: 'Shop A' }] });
        if (init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return response({ success: true }); }
        if (url.endsWith(`year=${year}`)) return new Promise(resolve => { finishOld = resolve; });
        return response(data(333, 'Current manager'));
    }));
    render(<Page />);
    await waitFor(() => expect(finishOld).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: `${year + 1} он` }));
    await screen.findByText('Current manager');
    await act(async () => finishOld(response(data(111, 'Old manager'))));
    expect(screen.queryByText('Old manager')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Төлөвлөгөө хадгалах' }));
    await waitFor(() => expect(writes).toMatchObject([{ year: year + 1, months: Array(12).fill(333) }]));
    await screen.findByText('Current manager');
});

it('preserves target drafts when saving roster changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/shops') return response({ shops: [{ id: 'shop-a', name: 'Shop A' }] });
        if (init?.method === 'PUT') return response({ success: true });
        return response(data(111, 'Manager A'));
    }));
    render(<Page />);
    await screen.findByText('Manager A');
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхтэй жагсаалт хадгалах' }));
    await screen.findByText('Manager A');
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]).toHaveValue('999'));
});

it('preserves roster drafts when saving target changes', async () => {
    const writes: object[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/shops') return response({ shops: [{ id: 'shop-a', name: 'Shop A' }] });
        if (init?.method) { writes.push(JSON.parse(String(init.body))); return response({ success: true }); }
        return response(data(111, 'Manager A'));
    }));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Manager A/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Төлөвлөгөө хадгалах' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Идэвхтэй жагсаалт хадгалах' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Manager A/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхтэй жагсаалт хадгалах' }));
    await waitFor(() => expect(writes[1]).toMatchObject({ managers: [{ name: 'Manager A', is_active: false }] }));
});
