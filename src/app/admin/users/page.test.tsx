import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Page from './page';

const shopA = { id: '10000000-0000-4000-8000-000000000001', name: 'Shop A' };
const shopB = { id: '10000000-0000-4000-8000-000000000002', name: 'Shop B' };

function mockApi(shops: Array<{ id: string; name: string }>) {
    const invitations: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
        let data: Record<string, unknown> = {};
        if (input === '/api/admin/shops') data = { shops };
        if (input === '/api/admin/roles') data = { roles: [{ name: 'sales_manager', display_name_mn: 'Борлуулалтын менежер' }] };
        if (input === '/api/admin/users') data = { users: [] };
        if (input === '/api/admin/users/invite') {
            invitations.push(JSON.parse(String(init?.body)));
            data = { success: true, action_link: 'https://example.invalid/invite', mode: 'invite', emailed: false };
        }
        return { ok: true, json: async () => data };
    }));
    return invitations;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openInvite() {
    render(<Page />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Урих холбоос' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Урих холбоос' }));
}

it('requires an explicit project choice and sends the selected multishop invitation scope', async () => {
    const invitations = mockApi([shopA, shopB]);
    await openInvite();
    await screen.findByRole('option', { name: 'Shop B' });
    const shopSelect = screen.getByRole('combobox', { name: 'Төсөл' });
    const send = screen.getByRole('button', { name: 'Урилга илгээх' });
    fireEvent.change(screen.getByPlaceholderText('manager@example.com'), { target: { value: 'target@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Бодит бүтэн нэр'), { target: { value: 'Тест Менежер' } });
    expect(shopSelect).toHaveValue('');
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(invitations).toEqual([]);

    fireEvent.change(shopSelect, { target: { value: shopB.id } });
    fireEvent.change(screen.getByLabelText('Утас'), { target: { value: '+976 9911-2233' } });
    fireEvent.click(send);
    await waitFor(() => expect(invitations).toEqual([{
        email: 'target@example.com', full_name: 'Тест Менежер', phone: '99112233', role: 'sales_manager', shop_id: shopB.id,
    }]));
});

it('defaults to the only project and includes its ID in the invitation payload', async () => {
    const invitations = mockApi([shopA]);
    await openInvite();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Төсөл' })).toHaveValue(shopA.id));
    fireEvent.change(screen.getByPlaceholderText('manager@example.com'), { target: { value: 'target@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Бодит бүтэн нэр'), { target: { value: 'Тест Менежер' } });
    fireEvent.click(screen.getByRole('button', { name: 'Урилга илгээх' }));
    await waitFor(() => expect(invitations[0]).toMatchObject({ email: 'target@example.com', shop_id: shopA.id }));
    expect(invitations[0]).not.toHaveProperty('phone');
});

it('keeps a sales manager invitation disabled until a real name is entered', async () => {
    const invitations = mockApi([shopA]);
    await openInvite();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Төсөл' })).toHaveValue(shopA.id));
    const send = screen.getByRole('button', { name: 'Урилга илгээх' });
    fireEvent.change(screen.getByPlaceholderText('manager@example.com'), { target: { value: 'target@example.com' } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Бодит бүтэн нэр'), { target: { value: 'TARGET@example.com' } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Бодит бүтэн нэр'), { target: { value: 'Тест Менежер' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(invitations).toHaveLength(1));
});

it('flags a malformed phone inline and blocks the invitation', async () => {
    const invitations = mockApi([shopA]);
    await openInvite();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Төсөл' })).toHaveValue(shopA.id));
    fireEvent.change(screen.getByPlaceholderText('manager@example.com'), { target: { value: 'target@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Бодит бүтэн нэр'), { target: { value: 'Тест Менежер' } });
    const phone = screen.getByLabelText('Утас');
    fireEvent.change(phone, { target: { value: '9911-223' } });
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Утасны дугаар 8 оронтой байх ёстой')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Урилга илгээх' });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(invitations).toEqual([]);
});
