import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewingsPage } from './ViewingsPage';
import { ANONYMOUS_LEAD_LABEL, ANONYMOUS_MEETING_PHONE, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';

const mocks = vi.hoisted(() => ({ create: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', permissions: { modules: ['viewings'], canWrite: true } } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: mocks.error } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadDetail: () => ({ data: undefined }), useManagers: () => ({ data: [] }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }, { id: 'elysium', name: 'Elysium' }], isLoading: false }),
}));
vi.mock('@/hooks/useViewings', () => ({
    useViewings: () => ({ data: { viewings: [], counts: { today: 0, upcoming: 0, past: 0 } }, isLoading: false }),
    useCreateViewing: () => ({ mutateAsync: mocks.create, isPending: false }),
    useUpdateViewing: () => ({ mutate: vi.fn() }), usePropertySearch: () => ({ data: [], isFetching: false }),
}));

beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ viewing: { id: 'meeting' } }); });

describe('viewing project selection', () => {
    it('requires the new lead project and sends it when scheduling', async () => {
        render(<ViewingsPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        expect(mocks.error).toHaveBeenCalledWith('Төсөл сонгоно уу');
        expect(mocks.create).not.toHaveBeenCalled();
        fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'mandala' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'mandala', customer_name: 'Болд' })));
    });

    it('registers an anonymous walk-in only with a phone number', async () => {
        render(<ViewingsPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        expect(mocks.error).toHaveBeenCalledWith(LEAD_NAME_OR_ANONYMOUS);

        fireEvent.click(dialog.getByRole('checkbox', { name: /Нэр тодорхойгүй/ }));
        expect(dialog.getByPlaceholderText(ANONYMOUS_LEAD_LABEL)).toBeDisabled();
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        expect(mocks.error).toHaveBeenCalledWith(ANONYMOUS_MEETING_PHONE);
        expect(mocks.create).not.toHaveBeenCalled();

        fireEvent.change(dialog.getByPlaceholderText('9909 1122'), { target: { value: '9909 1122' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            project_id: 'elysium', customer_name: null, customer_phone: '9909 1122', anonymous: true,
        })));
    });
});
