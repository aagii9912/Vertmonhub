import { render, screen } from '@testing-library/react';
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
