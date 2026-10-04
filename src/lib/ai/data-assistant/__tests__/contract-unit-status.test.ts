import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractUnitStep, processContractAction, updateUnitStatus } from '../functions';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const unit = (status: string) => ({ id: 'unit-1', code: '201-440', unit_number: '440', block: '201', phase: 'Zoo Garden', status });
const contract = { id: 'contract-1', contract_number: 'MG-1', contract_status: 'active', customer_name: 'Болд' };
const lead = { id: 'lead-1', customer_name: 'Болд', status: 'negotiating', lost_reason: null };

function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}
beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('contractUnitStep — гэрээний үйлдэл нэгжийг ухраахгүй', () => {
    it.each([
        ['sign', 'available', 'reserved'],
        ['paid', 'available', 'sold'], ['paid', 'reserved', 'sold'], ['paid', 'ordered', 'sold'],
        ['cancel', 'reserved', 'available'], ['cancel', 'ordered', 'available'],
    ])('%s: %s → %s', (action, current, next) => {
        expect(contractUnitStep(action, current)).toEqual({ next });
    });
    it.each([
        ['sign', 'reserved'], ['sign', 'ordered'], ['sign', 'sold'], ['sign', 'handed_over'],
        ['paid', 'sold'], ['paid', 'handed_over'], ['cancel', 'available'],
    ])('%s on %s keeps the unit as it is', (action, current) => {
        expect(contractUnitStep(action, current)).toEqual({ skip: expect.stringContaining('аль хэдийн') });
    });
    it.each(['sold', 'handed_over'])('cancel never returns a %s unit to sale and asks for an explicit change', (current) => {
        expect(contractUnitStep('cancel', current)).toEqual({ skip: expect.stringContaining('тусад нь өөрчилнө') });
    });
    it('does not guess for an unknown status', () => {
        expect(contractUnitStep('paid', 'legacy')).toEqual({ skip: expect.stringContaining('тодорхойгүй') });
    });
});

describe('process_contract_action — нэгжийн одоогийн төлөв', () => {
    it('paid on a handed-over unit closes the contract but leaves the unit untouched', async () => {
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        const preview = await processContractAction('shop-1', { action: 'paid', code: '201-440', contract_number: 'MG-1' });
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'process_contract_action', args: { action: 'paid', unit_id: 'unit-1', contract_id: 'contract-1' } },
            label: 'Гэрээний үйлдэл (Бүрэн төлбөр): гэрээ MG-1',
            preview: {
                Үйлдэл: 'Бүрэн төлбөр', Нэгж: '201-440', 'Нэгжийн төлөв': 'Хүлээлгэсэн (өөрчлөхгүй)',
                'Нэгжийн тайлбар': expect.stringContaining('«Хүлээлгэсэн»'), Гэрээ: 'MG-1 → Хаагдсан',
            },
        });

        // Баталгаажуулалт: preview дахин шалгагдана, нэгжид бичихгүй, зөвхөн гэрээ шинэчлэгдэнэ.
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        const write = query('property_contracts', null);
        const result = await processContractAction('shop-1', { action: 'paid', unit_id: 'unit-1', contract_id: 'contract-1' }, true);
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ contract_status: 'closed' }));
        expect(result).toMatchObject({
            unit: { skipped: true, status: 'handed_over' }, changes: ['Гэрээ → Хаагдсан'],
            message: expect.stringContaining('аль хэдийн «Хүлээлгэсэн»'),
        });
        expect(from).toHaveBeenCalledTimes(2 + 5); // preview + (дахин шалгалт, бичилт) — property_units-д update алга.
    });

    it('sign on a handed-over unit alone has nothing to change and says why', async () => {
        query('property_units', [unit('handed_over')]);
        expect(await processContractAction('shop-1', { action: 'sign', code: '201-440' })).toEqual({
            error: 'Нэгж аль хэдийн «Хүлээлгэсэн» төлөвтэй тул өөрчлөхгүй.',
        });
        expect(from).toHaveBeenCalledTimes(1);
    });

    it.each(['handed_over', 'sold'])('cancel on a %s unit cancels the contract and lead only and asks for an explicit unit change', async (status) => {
        query('property_units', [unit(status)]);
        query('property_contracts', [contract]);
        query('leads', [lead]);
        const preview = await processContractAction('shop-1', { action: 'cancel', code: '201-440', contract_number: 'MG-1', lead_id: 'lead-1', lost_reason: 'Худалдан авагч цуцалсан' });
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { args: { unit_id: 'unit-1', contract_id: 'contract-1', lead_id: 'lead-1' } },
            preview: {
                'Нэгжийн төлөв': `${status === 'sold' ? 'Зарагдсан' : 'Хүлээлгэсэн'} (өөрчлөхгүй)`,
                'Нэгжийн тайлбар': expect.stringContaining('нэгжийн төлөвийг тусад нь өөрчилнө'),
                Гэрээ: 'MG-1 → Цуцалсан', Лийд: 'Болд → Алдсан',
            },
        });
        expect(from).toHaveBeenCalledTimes(3);
    });

    it('cancel on a sold unit alone is refused with the explicit-change advice', async () => {
        query('property_units', [unit('sold')]);
        expect(await processContractAction('shop-1', { action: 'cancel', code: '201-440' }, true))
            .toEqual({ error: expect.stringContaining('цуцлалтаар худалдаанд буцаахгүй') });
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('sign on an available unit reserves it, writing only if the status is still available', async () => {
        query('property_units', [unit('available')]);
        expect(await processContractAction('shop-1', { action: 'sign', code: '201-440' })).toMatchObject({
            label: 'Гэрээний үйлдэл (Гарын үсэг): 201-440',
            preview: { Нэгж: '201-440', 'Нэгжийн төлөв': 'Чөлөөтэй → Хадгалсан' },
        });

        query('property_units', [unit('available')]);
        query('property_units', [unit('available')]);
        const write = query('property_units', [{ id: 'unit-1' }]);
        const result = await processContractAction('shop-1', { action: 'sign', unit_id: 'unit-1' }, true);
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'reserved' }));
        expect(write.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(write.eq).toHaveBeenCalledWith('status', 'available');
        expect(result).toMatchObject({ unit: { success: true, oldStatus: 'available', newStatus: 'reserved' }, changes: ['Нэгж 201-440 → Хадгалсан'] });
    });

    it('paid on an available unit marks it sold', async () => {
        query('property_units', [unit('available')]);
        expect(await processContractAction('shop-1', { action: 'paid', code: '201-440' })).toMatchObject({
            preview: { 'Нэгжийн төлөв': 'Чөлөөтэй → Зарагдсан' },
        });
    });

    it('fails instead of overwriting when the unit changed between preview and write', async () => {
        query('property_units', [unit('reserved')]);
        query('property_units', [unit('reserved')]);
        query('property_units', []);
        expect(await processContractAction('shop-1', { action: 'paid', unit_id: 'unit-1' }, true))
            .toMatchObject({ error: expect.stringContaining('энэ хооронд өөрчлөгдсөн'), partialSuccess: false });
    });
});

describe('update_unit_status preview', () => {
    it('shows Mongolian labels and warns before a sold unit is moved back', async () => {
        query('property_units', [unit('handed_over')]);
        expect(await updateUnitStatus('shop-1', { code: '201-440', new_status: 'available' })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'update_unit_status', args: { unit_id: 'unit-1', new_status: 'available' } },
            preview: { Нэгж: '201-440', 'Одоогийн төлөв': 'Хүлээлгэсэн', 'Шинэ төлөв': 'Чөлөөтэй', Анхааруулга: expect.stringContaining('Зарагдсан нэгжийг') },
        });
    });
    it('does not warn for a forward move', async () => {
        query('property_units', [unit('sold')]);
        const preview = await updateUnitStatus('shop-1', { code: '201-440', new_status: 'handed_over' });
        expect(preview).toMatchObject({ preview: { 'Одоогийн төлөв': 'Зарагдсан', 'Шинэ төлөв': 'Хүлээлгэсэн' } });
        expect(preview).not.toHaveProperty('preview.Анхааруулга');
    });
    it('surfaces a read failure instead of reporting a missing unit', async () => {
        query('property_units', null, { message: 'timeout' });
        expect(await updateUnitStatus('shop-1', { code: '201-440', new_status: 'sold' })).toEqual({ error: 'Нэгж шалгахад алдаа гарлаа' });
    });
});
