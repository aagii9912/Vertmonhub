import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-browser', () => ({ createSupabaseBrowserClient: () => ({ auth: {} }) }));
import LoginPage from '../page';

beforeEach(() => window.history.replaceState({}, '', '/auth/login'));

describe('callback login feedback', () => {
    it.each([
        ['link_expired', 'Урилгын холбоосын хугацаа дууссан'],
        ['callback_failed', 'Нэвтрэлтийг баталгаажуулж чадсангүй'],
    ])('shows actionable feedback for %s', (code, message) => {
        window.history.replaceState({}, '', `/auth/login?auth_error=${code}&error_description=test-secret`);
        render(<LoginPage />);
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        expect(screen.getByRole('alert')).not.toHaveTextContent('test-secret');
    });

    it('ignores arbitrary error messages from the URL', () => {
        window.history.replaceState({}, '', '/auth/login?auth_error=test-secret');
        render(<LoginPage />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('password whitespace hint', () => {
    it('explains surrounding spaces after a failed login without changing the password', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Имэйл эсвэл нууц үг буруу байна' }), { status: 401 }));
        vi.stubGlobal('fetch', fetchMock);
        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText('Имэйл'), { target: { value: 'user@example.mn' } });
        fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: ' secret ' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Нэвтрэх' }).closest('form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent('хоосон зай байна');
        expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).password).toBe(' secret ');
        vi.unstubAllGlobals();
    });
});
