import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: notices }));
import Page from './page';

const actorId = '10000000-0000-4000-8000-000000000001';
const targetId = '10000000-0000-4000-8000-000000000002';
const shopId = '20000000-0000-4000-8000-000000000001';
const otherShopId = '20000000-0000-4000-8000-000000000002';
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
let writes: Array<Record<string, unknown>>;
let patchUrls: string[];
let failSave: boolean;
let owner: boolean;
let emptyRoles: boolean;
let linkedManager: boolean;

beforeEach(() => {
    writes = []; patchUrls = []; failSave = false; owner = false; emptyRoles = false; linkedManager = false;
    notices.error.mockClear(); notices.success.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
            writes.push(JSON.parse(String(init.body)));
            patchUrls.push(url);
            return json(failSave ? { error: 'Эрх шинэчлэгдсэнгүй' } : { success: true }, !failSave);
        }
        if (url === '/api/admin/roles') return json({ roles: emptyRoles ? [] : [
            { name: 'viewer', display_name_mn: 'Харагч' },
            { name: 'sales_manager', display_name_mn: 'Борлуулалтын менежер' },
        ] });
        if (url === '/api/admin/shops') return json({ shops: [
            { id: shopId, name: 'Байгууллага А' }, { id: otherShopId, name: 'Байгууллага Б' },
        ] });
        if (url === '/api/admin/users') return json({ actor_id: actorId, users: [
            { id: actorId, email: 'actor@example.invalid', full_name: 'Админ', role: 'super_admin', created_at: '2026-10-01T00:00:00Z', shops: [{ id: shopId, name: 'Байгууллага А', is_owner: true }] },
            { id: targetId, email: 'target@example.invalid', full_name: 'Бат', phone: '99112233', role: linkedManager ? 'sales_manager' : 'viewer', created_at: '2026-10-01T00:00:00Z', shops: [
                { id: shopId, name: 'Байгууллага А', is_owner: owner }, { id: otherShopId, name: 'Байгууллага Б', is_owner: false },
            ], manager_shops: linkedManager ? [{ shop_id: shopId, name: 'Бат' }] : [] },
        ] });
        throw new Error(`Unexpected request ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

it('offers and deliberately confirms a Super Admin grant even without its DB role row', async () => {
    render(<Page />);
    const button = await screen.findByRole('button', { name: 'Super Admin эрх өгөх' });
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('option', { name: 'Super Admin' })).toBeInTheDocument();
    expect(within(dialog).getByText(/бүх төслийн админ хэсэгт/)).toBeInTheDocument();
    expect(writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Super Admin эрх олгох' }));
    await waitFor(() => expect(writes).toEqual([{ userId: targetId, role: 'super_admin' }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(notices.success).toHaveBeenCalledWith('Дүр шинэчлэгдлээ');
});

it('requires a destination shop before provisioning a sales manager', async () => {
    render(<Page />);
    const row = (await screen.findByText('target@example.invalid')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Дүр солих' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Шинэ дүр'), { target: { value: 'sales_manager' } });
    const save = within(dialog).getByRole('button', { name: 'Эрх хадгалах' });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Менежерийн төсөл'), { target: { value: otherShopId } });
    fireEvent.click(save);
    await waitFor(() => expect(writes).toEqual([{ userId: targetId, role: 'sales_manager', shop_id: otherShopId }]));
});

it('keeps a failed grant open and does not claim success', async () => {
    failSave = true;
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Super Admin эрх өгөх' }));
    fireEvent.click(screen.getByRole('button', { name: 'Super Admin эрх олгох' }));
    await waitFor(() => expect(notices.error).toHaveBeenCalledWith('Эрх шинэчлэгдсэнгүй'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(notices.success).not.toHaveBeenCalled();
});

it('disables self-role changes, self-deletion and deletion of a shop owner', async () => {
    owner = true;
    render(<Page />);
    const selfRow = (await screen.findByText('actor@example.invalid')).closest('tr')!;
    expect(within(selfRow).getByRole('button', { name: 'Дүр солих' })).toBeDisabled();
    expect(within(selfRow).getByRole('button', { name: 'Админ хэрэглэгчийг устгах' })).toBeDisabled();
    const targetRow = screen.getByText('target@example.invalid').closest('tr')!;
    expect(within(targetRow).getByRole('button', { name: 'Бат хэрэглэгчийг устгах' })).toBeDisabled();
});

it('requires deliberate role selection when only the Super Admin fallback is available', async () => {
    emptyRoles = true;
    render(<Page />);
    const add = await screen.findByRole('button', { name: 'Хэрэглэгч нэмэх' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('email@example.com'), { target: { value: 'new@example.invalid' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Хамгийн багадаа 8 тэмдэгт'), { target: { value: 'valid-password' } });
    fireEvent.change(within(dialog).getByLabelText('Төсөл'), { target: { value: shopId } });
    const create = within(dialog).getByRole('button', { name: 'Үүсгэх' });
    expect(create).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Super Admin' }));
    expect(create).toBeEnabled();
});

it('shows the staff phone and edits name and phone through the profile API', async () => {
    render(<Page />);
    const row = (await screen.findByText('target@example.invalid')).closest('tr')!;
    expect(within(row).getByText('9911 2233')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Бат: профайл засах' }));
    const dialog = screen.getByRole('dialog');
    const phone = within(dialog).getByLabelText('Утас');
    expect(phone).toHaveValue('9911 2233');
    fireEvent.change(phone, { target: { value: '9911-223' } });
    const save = within(dialog).getByRole('button', { name: 'Хадгалах' });
    expect(save).toBeDisabled();
    fireEvent.change(phone, { target: { value: '+976 8811-2233' } });
    fireEvent.change(within(dialog).getByLabelText('Нэр'), { target: { value: 'Батбаяр' } });
    fireEvent.click(save);
    await waitFor(() => expect(writes).toEqual([{ userId: targetId, full_name: 'Батбаяр', phone: '88112233' }]));
    expect(patchUrls).toEqual(['/api/admin/users/profile']);
    await waitFor(() => expect(notices.success).toHaveBeenCalledWith('Профайл шинэчлэгдлээ'));
});

it('locks the name of an active roster manager and only sends the phone', async () => {
    linkedManager = true;
    render(<Page />);
    const row = (await screen.findByText('target@example.invalid')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Бат: профайл засах' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Нэр')).toBeDisabled();
    expect(within(dialog).getByText(/энд солихгүй/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Утас'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(writes).toEqual([{ userId: targetId, phone: null }]));
});

it('requires a real manager name when creating a sales manager', async () => {
    render(<Page />);
    const add = await screen.findByRole('button', { name: 'Хэрэглэгч нэмэх' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('email@example.com'), { target: { value: 'new@example.invalid' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Хамгийн багадаа 8 тэмдэгт'), { target: { value: 'valid-password' } });
    fireEvent.change(within(dialog).getByLabelText('Төсөл'), { target: { value: shopId } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Борлуулалтын менежер' }));
    const create = within(dialog).getByRole('button', { name: 'Үүсгэх' });
    expect(create).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText('Нэр оруулах'), { target: { value: 'Шинэ Менежер' } });
    expect(create).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText('Утас'), { target: { value: '12' } });
    expect(create).toBeDisabled();
});
