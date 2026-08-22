/**
 * WorkspaceSwitcher тест — 3 талбар, идэвхтэй төлөв, AI hero навигаци, RBAC түгжээ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
let mockPathname = '/dashboard';
let mockUser: { role: string; permissions?: unknown } | null = { role: 'admin' };

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    usePathname: () => mockPathname,
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ user: mockUser }),
}));

import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
    beforeEach(() => {
        push.mockClear();
        mockPathname = '/dashboard';
        mockUser = { role: 'admin' };
    });

    it('renders all three workspace tabs', () => {
        render(<WorkspaceSwitcher />);
        expect(screen.getByRole('tab', { name: 'Борлуулалт' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'AI Туслах' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Маркетинг' })).toBeInTheDocument();
    });

    it('marks the active workspace tab via aria-selected (deep link aware)', () => {
        mockPathname = '/dashboard/ai-assistant/agents';
        render(<WorkspaceSwitcher />);
        expect(screen.getByRole('tab', { name: 'AI Туслах' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Борлуулалт' })).toHaveAttribute('aria-selected', 'false');
    });

    it('navigates to the AI full page when the AI center is clicked', async () => {
        const user = userEvent.setup();
        render(<WorkspaceSwitcher />);
        await user.click(screen.getByRole('tab', { name: 'AI Туслах' }));
        expect(push).toHaveBeenCalledWith('/dashboard/ai-assistant');
    });

    it('disables every workspace the user cannot access', () => {
        mockUser = { role: 'viewer' };
        render(<WorkspaceSwitcher />);
        // viewer has no ai-assistant/inbox/ai-settings module → AI disabled
        expect(screen.getByRole('tab', { name: 'AI Туслах' })).toBeDisabled();
        // 2026-08-22: marketing is no longer ungated — viewer lacks
        // marketing/marketing-roi/surveys, so the tab must be disabled too.
        expect(screen.getByRole('tab', { name: 'Маркетинг' })).toBeDisabled();
    });

    it('enables the marketing workspace for a user holding a marketing module', () => {
        mockUser = { role: 'marketing' };
        render(<WorkspaceSwitcher />);
        expect(screen.getByRole('tab', { name: 'Маркетинг' })).not.toBeDisabled();
    });
});
