import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewingsPage } from './ViewingsPage';
import { ANONYMOUS_LEAD_LABEL, ANONYMOUS_MEETING_PHONE, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';
import type { ViewingRow } from '@/hooks/useViewings';
import type { ViewingUnitOption, ViewingCondition } from '@/lib/viewings/interests';
import { elysiumViewingConditions } from '@/lib/sales/viewing-conditions';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), error: vi.fn(), units: [] as ViewingUnitOption[], conditions: [] as ViewingCondition[], viewings: [] as ViewingRow[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', permissions: { modules: ['viewings'], canWrite: true } } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: mocks.error } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadDetail: () => ({ data: undefined }), useManagers: () => ({ data: [] }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }, { id: 'elysium', name: 'Elysium' }], isLoading: false }),
}));
vi.mock('@/hooks/useViewings', () => ({
    useViewings: () => ({ data: { viewings: mocks.viewings, counts: { today: 0, upcoming: 0, past: 0 } }, isLoading: false }),
    useCreateViewing: () => ({ mutateAsync: mocks.create, isPending: false }),
    useUpdateViewing: () => ({ mutate: vi.fn(), mutateAsync: mocks.update, isPending: false }), usePropertySearch: () => ({ data: [], isFetching: false }),
    useViewingOptions: () => ({ data: { units: mocks.units, conditions: mocks.conditions, reason: 'Үнэ батлагдаагүй' }, isLoading: false }),
    useViewingQuote: () => ({ data: { available: false, reason: 'Тохиргоо алга' }, isFetching: false }),
}));

beforeEach(() => { vi.clearAllMocks(); mocks.units = []; mocks.conditions = []; mocks.viewings = []; mocks.create.mockResolvedValue({ viewing: { id: 'meeting' } }); mocks.update.mockResolvedValue({ viewing: { id: 'meeting' } }); });

describe('viewing project selection', () => {
    it('selects and saves a payment condition without an active price, even if the selection was not explicitly added', async () => {
        mocks.units = [{ id: 'unit', project_id: 'elysium', block: 'Б1', model: 'E3', area_sqm: 85.19, floor: 13, unit_number: '1301', code: 'Б1-1301', status: 'available' }];
        mocks.conditions = elysiumViewingConditions('Elysium Residence', mocks.units);
        render(<ViewingsPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
        fireEvent.change(dialog.getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
        fireEvent.change(dialog.getByRole('combobox', { name: 'Блок' }), { target: { value: 'Б1' } });
        fireEvent.change(dialog.getByRole('combobox', { name: 'Загвар' }), { target: { value: 'E3' } });
        fireEvent.change(dialog.getByRole('combobox', { name: 'Талбай' }), { target: { value: '85.19' } });
        fireEvent.change(dialog.getByRole('combobox', { name: 'Давхар' }), { target: { value: '13' } });
        expect(dialog.getByRole('combobox', { name: 'Төлбөрийн нөхцөл' })).toBeEnabled();
        fireEvent.change(dialog.getByRole('combobox', { name: 'Төлбөрийн нөхцөл' }), { target: { value: '30%' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ interests: [{ block: 'Б1', model: 'E3', area_sqm: 85.19, floor: 13, unit_id: null, payment_condition: '30%' }] })));
    });

    it('opens an edit action for a completed meeting and preserves its interest snapshot when only notes change', async () => {
        const interest = { block: 'Б1', model: 'E3', area_sqm: 85.19, floor: 13, quote: null, quote_unavailable_reason: 'Тохиргоо алга' };
        mocks.viewings = [{ id: 'meeting', status: 'completed', scheduled_at: '2026-10-08T01:00:00Z', lead_id: 'lead', property_id: null, property: null,
            lead: { id: 'lead', customer_name: 'Болд', customer_phone: '99112233', status: 'contacted' }, agent_notes: null, customer_feedback: null,
            meeting_type: 'new_customer', interest_level: null, completed_at: '2026-10-08T01:00:00Z', sales_manager_name: null, interests: [interest] }];
        render(<ViewingsPage />);
        expect(screen.getByText('Б1 · E3 · 85.19 м² · 13-р давхар')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Болд: уулзалт засах' }));
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByRole('textbox', { name: 'Сэжим / тэмдэглэл' }), { target: { value: 'Ойрхон амьдардаг' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 'meeting', patch: { agent_notes: 'Ойрхон амьдардаг' } }));
    });
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
