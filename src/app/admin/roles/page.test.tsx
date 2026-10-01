import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/Toast', () => ({ confirmToast: vi.fn() }));
import Page from './page';

const response = (body: unknown) => ({ ok: true, json: async () => body });
const role = (id: string, modules: string[] = [], canWrite = false) => ({
    id, name: id, display_name: id, display_name_mn: id, is_system: false,
    can_write: canWrite, can_delete: false, can_access_admin: false, description: null,
    role_permissions: modules.map(module => ({ id: module, module })),
});
afterEach(() => vi.unstubAllGlobals());

it('serializes modules and fields per role while allowing another role to save', async () => {
    let finishA!: (value: ReturnType<typeof response>) => void;
    let finishB!: (value: ReturnType<typeof response>) => void;
    const bodies: Array<{ url: string; modules?: string[]; can_write?: boolean }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/roles') return response({ roles: [role('Role A'), role('Role B')] });
        const body = JSON.parse(String(init?.body));
        bodies.push({ url, ...body });
        if (url.endsWith('Role A')) {
            if (bodies.length === 1) return new Promise(resolve => { finishA = resolve; });
            return response({ role: role('Role A', body.modules || ['dashboard', 'leads'], body.can_write) });
        }
        return new Promise(resolve => { finishB = resolve; });
    }));
    render(<Page />);
    await screen.findAllByText('Role A');
    const dashboardRow = screen.getByText('Хянах самбар').closest('tr')!;
    const leadsRow = screen.getByText('Лийд').closest('tr')!;
    const writeRow = screen.getByText('Бичих эрх').closest('tr')!;
    fireEvent.click(within(dashboardRow).getAllByRole('button')[0]);
    await waitFor(() => expect(bodies).toHaveLength(1));
    fireEvent.click(within(dashboardRow).getAllByRole('button')[1]);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(within(leadsRow).getAllByRole('button')[0]).toBeDisabled();
    expect(within(writeRow).getAllByRole('button')[0]).toBeDisabled();
    fireEvent.click(within(leadsRow).getAllByRole('button')[0]);
    fireEvent.click(within(writeRow).getAllByRole('button')[0]);
    expect(bodies).toHaveLength(2);
    await act(async () => finishA(response({ role: role('Role A', ['dashboard']) })));
    expect(within(dashboardRow).getAllByRole('button')[1]).toBeDisabled();
    fireEvent.click(within(leadsRow).getAllByRole('button')[0]);
    await waitFor(() => expect(bodies[2].modules).toEqual(['dashboard', 'leads']));
    await waitFor(() => expect(within(writeRow).getAllByRole('button')[0]).toBeEnabled());
    fireEvent.click(within(writeRow).getAllByRole('button')[0]);
    await waitFor(() => expect(bodies[3]).toMatchObject({ can_write: true }));
    await act(async () => finishB(response({ role: role('Role B', ['dashboard']) })));
    await waitFor(() => expect(within(writeRow).getAllByRole('button')[0]).toBeEnabled());
    expect(within(writeRow).getAllByRole('button')[0].querySelector('svg')).toBeInTheDocument();
    expect(within(dashboardRow).getAllByRole('button')[0].querySelector('svg')).toBeInTheDocument();
});
