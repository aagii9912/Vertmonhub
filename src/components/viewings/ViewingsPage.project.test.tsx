import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewingsPage } from './ViewingsPage';
import { ANONYMOUS_LEAD_LABEL, ANONYMOUS_MEETING_PHONE, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';
import { REFERRAL_LIST_LOADING } from '@/lib/sales/referral-sources';
import type { ViewingRow } from '@/hooks/useViewings';
import type { ViewingUnitOption, ViewingCondition } from '@/lib/viewings/interests';
import { elysiumViewingConditions } from '@/lib/sales/viewing-conditions';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), updateLead: vi.fn(), error: vi.fn(), units: [] as ViewingUnitOption[], conditions: [] as ViewingCondition[], viewings: [] as ViewingRow[],
    referrals: undefined as { sources: Array<{ id: string; name: string; sort_order: number; archived_at: string | null }>; available: boolean } | undefined,
    referralState: 'ready' as 'ready' | 'loading' | 'error', refetchReferrals: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', permissions: { modules: ['viewings'], canWrite: true } } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: mocks.error } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadDetail: () => ({ data: undefined }), useManagers: () => ({ data: [] }),
    useUpdateLead: () => ({ mutateAsync: mocks.updateLead, isPending: false }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }, { id: 'elysium', name: 'Elysium' }], isLoading: false }),
}));
vi.mock('@/hooks/useViewings', () => ({
    useViewings: () => ({ data: { viewings: mocks.viewings, counts: { today: 0, upcoming: 0, past: 0 } }, isLoading: false }),
    useCreateViewing: () => ({ mutateAsync: mocks.create, isPending: false }),
    useUpdateViewing: () => ({ mutate: vi.fn(), mutateAsync: mocks.update, isPending: false }), usePropertySearch: () => ({ data: [], isFetching: false }),
    useViewingOptions: () => ({ data: { units: mocks.units, conditions: mocks.conditions, reason: 'Үнэ батлагдаагүй' }, isLoading: false }),
    useViewingQuote: () => ({ data: { available: false, reason: 'Тохиргоо алга' }, isFetching: false }),
}));
vi.mock('@/hooks/useReferralSources', () => ({ useReferralSources: () => ({
    data: mocks.referrals, isLoading: mocks.referralState === 'loading', isError: mocks.referralState === 'error', isFetching: false, refetch: mocks.refetchReferrals,
}) }));

beforeEach(() => { vi.clearAllMocks(); mocks.units = []; mocks.conditions = []; mocks.viewings = []; mocks.referrals = undefined; mocks.referralState = 'ready'; mocks.create.mockResolvedValue({ viewing: { id: 'meeting' } }); mocks.update.mockResolvedValue({ viewing: { id: 'meeting' } }); mocks.updateLead.mockResolvedValue({}); });

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
        fireEvent.change(dialog.getByRole('textbox', { name: 'Тэмдэглэл' }), { target: { value: 'Ойрхон амьдардаг' } });
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

    describe('«Сэжим (хаанаас ирсэн)»', () => {
        const facebook = { id: 'ref-facebook', name: 'Facebook', sort_order: 10, archived_at: null };
        const neighbour = { id: 'ref-neighbour', name: 'Ойрхон амьдардаг', sort_order: 20, archived_at: null };
        const barmash = { id: 'ref-barmash', name: 'Бармаш түрээслэгч', sort_order: 30, archived_at: '2026-10-20T00:00:00Z' };
        const openCreate = () => {
            render(<ViewingsPage />);
            fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
            const dialog = within(screen.getByRole('dialog'));
            fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
            fireEvent.change(dialog.getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
            return dialog;
        };

        it('requires an active referral for a new-customer meeting and sends its id with the free-text note separately', async () => {
            mocks.referrals = { sources: [facebook, neighbour, barmash], available: true };
            const dialog = openCreate();
            const select = dialog.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' });
            expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['Сонгох', 'Facebook', 'Ойрхон амьдардаг']);
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            expect(mocks.error).toHaveBeenCalledWith('Шинэ харилцагчийн уулзалтад «Сэжим (хаанаас ирсэн)»-ийг сонгоно уу');
            expect(mocks.create).not.toHaveBeenCalled();
            fireEvent.change(select, { target: { value: 'ref-neighbour' } });
            fireEvent.change(dialog.getByRole('textbox', { name: 'Тэмдэглэл' }), { target: { value: '12-оос дээш давхар' } });
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
                meeting_type: 'new_customer', referral_source_id: 'ref-neighbour', notes: '12-оос дээш давхар',
            })));
        });

        it('is optional for repeat customers and absent without a list or before the migration', async () => {
            mocks.referrals = { sources: [facebook], available: true };
            let dialog = openCreate();
            fireEvent.click(dialog.getByRole('button', { name: 'Давтан' }));
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ meeting_type: 'repeat_customer' })));
            expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('referral_source_id');
            cleanup();

            for (const referrals of [{ sources: [], available: true }, { sources: [], available: false }, undefined]) {
                mocks.create.mockClear();
                mocks.referrals = referrals;
                dialog = openCreate();
                expect(dialog.queryByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' })).not.toBeInTheDocument();
                fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
                await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ meeting_type: 'new_customer' })));
                expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('referral_source_id');
                cleanup();
            }
        });

        it('holds a new-customer meeting while the list loads or failed, with an inline retry', async () => {
            mocks.referralState = 'loading';
            let dialog = openCreate();
            const loading = dialog.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' });
            expect(loading).toBeDisabled();
            expect(within(loading).getByRole('option')).toHaveTextContent('Ачаалж байна…');
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            expect(mocks.error).toHaveBeenCalledWith(REFERRAL_LIST_LOADING);
            expect(mocks.create).not.toHaveBeenCalled();
            cleanup();

            mocks.referralState = 'error';
            dialog = openCreate();
            expect(dialog.getByText(/«Сэжим \(хаанаас ирсэн\)»-ийн жагсаалтыг уншиж чадсангүй/)).toHaveAttribute('role', 'alert');
            fireEvent.click(dialog.getByRole('button', { name: 'Дахин оролдох' }));
            expect(mocks.refetchReferrals).toHaveBeenCalledTimes(1);
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            expect(mocks.error).toHaveBeenLastCalledWith(expect.stringContaining('«Дахин оролдох»'));
            expect(mocks.create).not.toHaveBeenCalled();
            // Давтан харилцагчид заавал биш тул жагсаалтыг хүлээхгүй.
            fireEvent.click(dialog.getByRole('button', { name: 'Давтан' }));
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ meeting_type: 'repeat_customer' })));
        });

        it('refreshes a stale list when the server asks for the referral, keeping the form filled in', async () => {
            mocks.referrals = { sources: [], available: true };
            mocks.create.mockRejectedValueOnce(new Error('Шинэ харилцагчийн уулзалтад «Сэжим (хаанаас ирсэн)»-ийг сонгоно уу. Боломжтой: Facebook.'));
            const dialog = openCreate();
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.refetchReferrals).toHaveBeenCalledTimes(1));
            expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Боломжтой: Facebook.'));
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(dialog.getByPlaceholderText('Б. Болд')).toHaveValue('Болд');
        });

        it('shows the referral on the row and edits it optionally, keeping the current archived choice', async () => {
            mocks.referrals = { sources: [facebook, barmash], available: true };
            mocks.viewings = [{ id: 'meeting', status: 'completed', scheduled_at: '2026-10-08T01:00:00Z', lead_id: 'lead', property_id: null, property: null,
                lead: { id: 'lead', customer_name: 'Болд', customer_phone: '99112233', status: 'contacted' }, agent_notes: null, customer_feedback: null,
                meeting_type: 'new_customer', interest_level: null, completed_at: '2026-10-08T01:00:00Z', sales_manager_name: null, interests: [], referral_source_id: 'ref-barmash' }];
            render(<ViewingsPage />);
            expect(screen.getByText(/Сэжим \(хаанаас ирсэн\): Бармаш түрээслэгч/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Болд: уулзалт засах' }));
            const dialog = within(screen.getByRole('dialog'));
            const select = dialog.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' });
            expect(select).toHaveValue('ref-barmash');
            expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['Сонгоогүй', 'Facebook', 'Бармаш түрээслэгч (архив)']);
            fireEvent.change(select, { target: { value: 'ref-facebook' } });
            fireEvent.click(dialog.getByRole('button', { name: 'Хадгалах' }));
            await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 'meeting', patch: { referral_source_id: 'ref-facebook' } }));
        });
    });

    // Борлуулалтын багийн хүсэлт 2026-11-12: уулзалтад урьдчилгаа / үлдэгдэл төлбөрийн нөхцөл ба «Хэлэлцэж буй гэрээ».
    describe('төлбөрийн нөхцөл ба «Хэлэлцэж буй гэрээ»', () => {
        const completed = (lead: { status: string }, extra: Partial<ViewingRow> = {}): ViewingRow => ({ id: 'meeting', status: 'completed', scheduled_at: '2026-11-10T01:00:00Z', lead_id: 'lead', property_id: null, property: null,
            lead: { id: 'lead', customer_name: 'Болд', customer_phone: '99112233', ...lead }, agent_notes: null, customer_feedback: null,
            meeting_type: 'new_customer', interest_level: null, completed_at: '2026-11-10T01:00:00Z', sales_manager_name: null, interests: [], ...extra });

        it('sends the chosen advance and remainder terms with a new meeting and marks the lead as negotiating afterwards', async () => {
            mocks.create.mockResolvedValue({ viewing: { id: 'meeting' }, lead_id: 'lead-9' });
            render(<ViewingsPage />);
            fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
            const dialog = within(screen.getByRole('dialog'));
            fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
            fireEvent.change(dialog.getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
            expect(within(dialog.getByRole('combobox', { name: 'Урьдчилгаа төлбөрийн нөхцөл' })).getAllByRole('option').map(option => option.textContent))
                .toEqual(['Сонгоогүй', 'Бэлэн', 'Бартер', 'Урьдчилгаа хуваах']);
            fireEvent.change(dialog.getByRole('combobox', { name: 'Урьдчилгаа төлбөрийн нөхцөл' }), { target: { value: 'barter' } });
            fireEvent.change(dialog.getByRole('combobox', { name: 'Үлдэгдэл төлбөрийн нөхцөл' }), { target: { value: 'mortgage' } });
            fireEvent.click(dialog.getByRole('checkbox', { name: /Хэлэлцэж буй гэрээ/ }));
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ advance_payment_term: 'barter', remainder_payment_term: 'mortgage' })));
            await waitFor(() => expect(mocks.updateLead).toHaveBeenCalledWith({ id: 'lead-9', patch: { status: 'negotiating' } }));
        });

        it('sends no term keys and leaves the lead alone when nothing is chosen', async () => {
            render(<ViewingsPage />);
            fireEvent.click(screen.getAllByRole('button', { name: 'Уулзалт товлох' })[0]);
            const dialog = within(screen.getByRole('dialog'));
            fireEvent.change(dialog.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
            fireEvent.change(dialog.getByPlaceholderText('Б. Болд'), { target: { value: 'Болд' } });
            fireEvent.click(dialog.getByRole('button', { name: 'Товлох' }));
            await waitFor(() => expect(mocks.create).toHaveBeenCalled());
            const input = mocks.create.mock.calls[0][0];
            expect(input).not.toHaveProperty('advance_payment_term');
            expect(input).not.toHaveProperty('remainder_payment_term');
            expect(mocks.updateLead).not.toHaveBeenCalled();
        });

        it('shows the terms on the row and fills them in on a held meeting, patching only what changed', async () => {
            mocks.viewings = [completed({ status: 'contacted' }, { advance_payment_term: 'cash' })];
            render(<ViewingsPage />);
            expect(screen.getByText(/Урьдчилгаа: Бэлэн/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Болд: уулзалт засах' }));
            const dialog = within(screen.getByRole('dialog'));
            expect(dialog.getByRole('combobox', { name: 'Урьдчилгаа төлбөрийн нөхцөл' })).toHaveValue('cash');
            fireEvent.change(dialog.getByRole('combobox', { name: 'Үлдэгдэл төлбөрийн нөхцөл' }), { target: { value: 'bank_loan' } });
            fireEvent.click(dialog.getByRole('button', { name: 'Хадгалах' }));
            await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 'meeting', patch: { remainder_payment_term: 'bank_loan' } }));
            expect(mocks.updateLead).not.toHaveBeenCalled();
        });

        it('toggles the negotiating mark from the edit dialog without touching the meeting, and hides it for closed leads', async () => {
            mocks.viewings = [completed({ status: 'negotiating' })];
            const view = render(<ViewingsPage />);
            fireEvent.click(screen.getByRole('button', { name: 'Болд: уулзалт засах' }));
            const dialog = within(screen.getByRole('dialog'));
            const mark = dialog.getByRole('checkbox', { name: /Хэлэлцэж буй гэрээ/ });
            expect(mark).toBeChecked();
            fireEvent.click(mark);
            fireEvent.click(dialog.getByRole('button', { name: 'Хадгалах' }));
            await waitFor(() => expect(mocks.updateLead).toHaveBeenCalledWith({ id: 'lead', patch: { status: 'contacted' } }));
            expect(mocks.update).not.toHaveBeenCalled();
            view.unmount();
            cleanup();
            mocks.viewings = [completed({ status: 'closed_won' })];
            render(<ViewingsPage />);
            fireEvent.click(screen.getByRole('button', { name: 'Болд: уулзалт засах' }));
            expect(within(screen.getByRole('dialog')).queryByRole('checkbox', { name: /Хэлэлцэж буй гэрээ/ })).not.toBeInTheDocument();
        });
    });
});
