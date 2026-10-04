import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractListingStep, contractUnitStep, processContractAction, updateUnitStatus } from '../functions';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const unit = (status: string) => ({ id: 'unit-1', code: '201-440', unit_number: '440', block: '201', phase: 'Zoo Garden', status });
const contract = { id: 'contract-1', contract_number: 'MG-1', contract_status: 'active', customer_name: 'Болд' };
const lead = { id: 'lead-1', customer_name: 'Болд', status: 'negotiating', lost_reason: null };
const listing = (status: string | null) => ({ id: 'prop-1', name: 'Хан-Уул 3 өрөө', status });

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
        expect(contractUnitStep(action, current)).toEqual({ skip: expect.stringContaining('аль хэдийн'), note: 'Аль хэдийн энэ төлөвтэй' });
    });
    it.each([
        ['sold', 'Нэгж «Зарагдсан» тул цуцлалтаар худалдаанд буцаахгүй.'],
        ['handed_over', 'Нэгж «Хүлээлгэсэн» (зарагдаад хүлээлгэн өгсөн) тул цуцлалтаар худалдаанд буцаахгүй.'],
    ])('cancel never returns a %s unit to sale and asks for an explicit change', (current, reason) => {
        const step = contractUnitStep('cancel', current);
        expect(step).toEqual({ skip: expect.stringContaining('тусад нь өөрчилнө'), note: 'Буцаахгүй — шалгаад тусад нь засна уу' });
        expect('skip' in step && step.skip.startsWith(reason)).toBe(true);
    });
    it('does not guess for an unknown status', () => {
        expect(contractUnitStep('paid', 'legacy')).toEqual({ skip: expect.stringContaining('тодорхойгүй'), note: expect.any(String) });
    });
    it('keeps the card note short enough for one line', () => {
        for (const [action, current] of [['cancel', 'handed_over'], ['paid', 'sold'], ['paid', null]] as const) {
            const step = contractUnitStep(action, current);
            expect('note' in step ? step.note.length : Infinity).toBeLessThanOrEqual(40);
        }
    });
});

describe('contractListingStep — listing байрыг ч ухраахгүй', () => {
    it.each([
        ['sign', 'available', 'reserved'], ['paid', 'available', 'sold'], ['paid', 'reserved', 'sold'], ['cancel', 'reserved', 'available'],
    ])('%s: %s → %s', (action, current, next) => {
        expect(contractListingStep(action, current)).toEqual({ next });
    });
    it.each(['sold', 'rented', 'barter'])('cancel never returns a %s listing to sale', (current) => {
        expect(contractListingStep('cancel', current)).toMatchObject({ skip: expect.stringMatching(/^Байр «.+» тул цуцлалтаар худалдаанд буцаахгүй\..*байрны төлөвийг тусад нь өөрчилнө/) });
    });
    it.each([['sign', 'sold'], ['sign', 'reserved'], ['paid', 'sold'], ['paid', 'barter']])('%s on a %s listing keeps it as it is', (action, current) => {
        expect(contractListingStep(action, current)).toMatchObject({ skip: expect.stringContaining('Байр аль хэдийн') });
    });
});

describe('process_contract_action — нэгжийн одоогийн төлөв', () => {
    it('paid on a handed-over unit closes the contract but leaves the unit untouched', async () => {
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        const preview = await processContractAction('shop-1', { action: 'paid', code: '201-440', contract_number: 'MG-1' });
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'process_contract_action', args: { action: 'paid', unit_id: 'unit-1', unit_status: 'handed_over', contract_id: 'contract-1' } },
            label: 'Гэрээний үйлдэл (Бүрэн төлбөр): гэрээ MG-1',
            preview: {
                Үйлдэл: 'Бүрэн төлбөр', Нэгж: '201-440', 'Нэгжийн төлөв': 'Хүлээлгэсэн (өөрчлөхгүй)',
                'Нэгжийн тайлбар': 'Аль хэдийн энэ төлөвтэй', Гэрээ: 'MG-1 → Хаагдсан',
            },
        });

        // Баталгаажуулалт: preview дахин шалгагдана, нэгжид бичихгүй, зөвхөн гэрээ шинэчлэгдэнэ.
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        query('property_units', [unit('handed_over')]);
        query('property_contracts', [contract]);
        const write = query('property_contracts', null);
        const result = await processContractAction('shop-1', { action: 'paid', unit_id: 'unit-1', unit_status: 'handed_over', contract_id: 'contract-1' }, true);
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
            action: { args: { unit_id: 'unit-1', unit_status: status, contract_id: 'contract-1', lead_id: 'lead-1' } },
            preview: {
                'Нэгжийн төлөв': `${status === 'sold' ? 'Зарагдсан' : 'Хүлээлгэсэн'} (өөрчлөхгүй)`,
                'Нэгжийн тайлбар': 'Буцаахгүй — шалгаад тусад нь засна уу',
                Гэрээ: 'MG-1 → Цуцалсан', Лийд: 'Болд → Алдсан',
            },
        });
        expect(from).toHaveBeenCalledTimes(3);
    });

    it('cancel on a sold unit alone is refused with the explicit-change advice', async () => {
        query('property_units', [unit('sold')]);
        expect(await processContractAction('shop-1', { action: 'cancel', unit_id: 'unit-1', unit_status: 'sold' }, true))
            .toEqual({ error: expect.stringMatching(/^Нэгж «Зарагдсан» тул цуцлалтаар худалдаанд буцаахгүй\..*нэгжийн төлөвийг тусад нь өөрчилнө/) });
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('sign on an available unit reserves it, writing only if the status is still available', async () => {
        query('property_units', [unit('available')]);
        expect(await processContractAction('shop-1', { action: 'sign', code: '201-440' })).toMatchObject({
            label: 'Гэрээний үйлдэл (Гарын үсэг): 201-440',
            action: { args: { unit_id: 'unit-1', unit_status: 'available' } },
            preview: { Нэгж: '201-440', 'Нэгжийн төлөв': 'Чөлөөтэй → Хадгалсан' },
        });

        query('property_units', [unit('available')]);
        query('property_units', [unit('available')]);
        const write = query('property_units', [{ id: 'unit-1' }]);
        const result = await processContractAction('shop-1', { action: 'sign', unit_id: 'unit-1', unit_status: 'available' }, true);
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

    it('fails instead of overwriting when the unit changes between the confirm read and the write, and leaves the contract alone', async () => {
        query('property_units', [unit('reserved')]);
        query('property_contracts', [contract]);
        query('property_units', [unit('reserved')]);
        const write = query('property_units', []);
        expect(await processContractAction('shop-1', { action: 'paid', unit_id: 'unit-1', unit_status: 'reserved', contract_id: 'contract-1' }, true))
            .toEqual({ error: expect.stringContaining('энэ хооронд өөрчлөгдсөн'), partialSuccess: false, changes: [] });
        expect(write.eq).toHaveBeenCalledWith('status', 'reserved');
        expect(from).toHaveBeenCalledTimes(4); // гэрээнд бичилт алга
    });

    it('refuses a confirm when the unit changed after the preview, instead of running a step the user never saw', async () => {
        // Preview: «Хүлээлгэсэн (өөрчлөхгүй)». Дараа нь хэн нэгэн «Хадгалсан» болгосон.
        query('property_units', [unit('reserved')]);
        query('property_contracts', [contract]);
        query('property_units', [unit('reserved')]);
        const result = await processContractAction('shop-1', { action: 'cancel', unit_id: 'unit-1', unit_status: 'handed_over', contract_id: 'contract-1' }, true);
        expect(result).toEqual({
            error: 'Нэгж 201-440: төлөв энэ хооронд өөрчлөгдсөн байна («Хүлээлгэсэн» → «Хадгалсан»). Дахин шалгаад үйлдлийг шинээр хүснэ үү.',
            partialSuccess: false, changes: [],
        });
        expect(from).toHaveBeenCalledTimes(3); // нэгж, гэрээнд бичилт алга
    });

    it('refuses a confirm that does not carry the previewed unit status', async () => {
        query('property_units', [unit('available')]);
        query('property_units', [unit('available')]);
        expect(await processContractAction('shop-1', { action: 'sign', unit_id: 'unit-1' }, true))
            .toMatchObject({ error: expect.stringContaining('урьдчилан харсан төлөв алга'), partialSuccess: false });
        expect(from).toHaveBeenCalledTimes(2);
    });
});

describe('process_contract_action — listing байрны одоогийн төлөв', () => {
    it('cancel on a sold listing cancels the contract only and leaves the listing as sold', async () => {
        query('properties', [listing('sold')]);
        query('property_contracts', [contract]);
        const preview = await processContractAction('shop-1', { action: 'cancel', property_name: 'Хан-Уул', contract_number: 'MG-1' });
        expect(preview).toMatchObject({
            action: { args: { property_id: 'prop-1', property_status: 'sold', contract_id: 'contract-1' } },
            label: 'Гэрээний үйлдэл (Цуцлалт): гэрээ MG-1',
            preview: { Байр: 'Хан-Уул 3 өрөө', 'Байрны төлөв': 'Зарагдсан (өөрчлөхгүй)', 'Байрны тайлбар': 'Буцаахгүй — шалгаад тусад нь засна уу', Гэрээ: 'MG-1 → Цуцалсан' },
        });

        query('properties', [listing('sold')]);
        query('property_contracts', [contract]);
        query('properties', [listing('sold')]);
        query('property_contracts', [contract]);
        const write = query('property_contracts', null);
        const result = await processContractAction('shop-1', { action: 'cancel', property_id: 'prop-1', property_status: 'sold', contract_id: 'contract-1' }, true);
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ contract_status: 'cancelled' }));
        expect(result).toMatchObject({ property: { skipped: true, status: 'sold' }, changes: ['Гэрээ → Цуцалсан'], message: expect.stringContaining('цуцлалтаар худалдаанд буцаахгүй') });
        expect(from).toHaveBeenCalledTimes(2 + 5); // properties-д update алга
    });

    it('sign on an available listing reserves it with a compare-and-set write', async () => {
        query('properties', [listing('available')]);
        expect(await processContractAction('shop-1', { action: 'sign', property_id: 'prop-1' })).toMatchObject({
            preview: { Байр: 'Хан-Уул 3 өрөө', 'Байрны төлөв': 'Чөлөөтэй → Захиалсан' },
        });

        query('properties', [listing('available')]);
        query('properties', [listing('available')]);
        const write = query('properties', [{ id: 'prop-1' }]);
        const result = await processContractAction('shop-1', { action: 'sign', property_id: 'prop-1', property_status: 'available' }, true);
        expect(write.update).toHaveBeenCalledWith({ status: 'reserved' });
        expect(write.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(write.eq).toHaveBeenCalledWith('status', 'available');
        expect(result).toMatchObject({ property: { success: true, oldStatus: 'available', newStatus: 'reserved' }, changes: ['Байр Хан-Уул 3 өрөө → Захиалсан'] });
    });

    it('refuses a confirmed cancel when the listing was sold after the preview', async () => {
        query('properties', [listing('sold')]);
        // Дахин шалгалт нь өөрчлөхгүй (зарагдсан) гэж хэлнэ — цорын ганц зорилт тул бичилтгүй алдаа.
        expect(await processContractAction('shop-1', { action: 'cancel', property_id: 'prop-1', property_status: 'reserved' }, true))
            .toEqual({ error: expect.stringContaining('цуцлалтаар худалдаанд буцаахгүй') });
        expect(from).toHaveBeenCalledTimes(1);

        // Өөр зорилттой бол дахин шалгалт давна; гэхдээ preview-ээс хойш өөрчлөгдсөн төлөвийг тулгаад зогсоно.
        query('properties', [listing('sold')]);
        query('leads', [lead]);
        query('properties', [listing('sold')]);
        expect(await processContractAction('shop-1', { action: 'cancel', property_id: 'prop-1', property_status: 'reserved', lead_id: 'lead-1', lost_reason: 'Цуцалсан' }, true))
            .toMatchObject({ error: expect.stringContaining('(«Захиалсан» → «Зарагдсан»)'), partialSuccess: false });
        expect(from).toHaveBeenCalledTimes(1 + 3); // лидэд бичилт алга
    });
});

describe('update_unit_status preview', () => {
    it('shows Mongolian labels and warns before a sold unit is moved back', async () => {
        query('property_units', [unit('handed_over')]);
        expect(await updateUnitStatus('shop-1', { code: '201-440', new_status: 'available' })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'update_unit_status', args: { unit_id: 'unit-1', new_status: 'available', expected_status: 'handed_over' } },
            preview: { Нэгж: '201-440', 'Одоогийн төлөв': 'Хүлээлгэсэн', 'Шинэ төлөв': 'Чөлөөтэй', Анхааруулга: 'Зарагдсаныг буцаана, гэрээг шалгана уу' },
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

describe('update_unit_status confirm', () => {
    it('writes only while the unit still has the previewed status', async () => {
        query('property_units', [unit('reserved')]);
        const write = query('property_units', [{ id: 'unit-1' }]);
        expect(await updateUnitStatus('shop-1', { unit_id: 'unit-1', new_status: 'available', expected_status: 'reserved' }, true))
            .toMatchObject({ success: true, oldStatus: 'reserved', newStatus: 'available' });
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'available' }));
        expect(write.eq).toHaveBeenCalledWith('status', 'reserved');
    });

    it('does not put a unit sold after the preview back on sale', async () => {
        // Preview: «Хадгалсан» → «Чөлөөтэй» (анхааруулгагүй). Баталгаажуулахаас өмнө зарагдсан.
        query('property_units', [unit('sold')]);
        expect(await updateUnitStatus('shop-1', { unit_id: 'unit-1', new_status: 'available', expected_status: 'reserved' }, true)).toEqual({
            error: 'Нэгж 201-440: төлөв энэ хооронд өөрчлөгдсөн байна («Хадгалсан» → «Зарагдсан»). Дахин шалгаад үйлдлийг шинээр хүснэ үү.',
        });
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('refuses a confirm without the previewed status', async () => {
        query('property_units', [unit('reserved')]);
        expect(await updateUnitStatus('shop-1', { unit_id: 'unit-1', new_status: 'sold' }, true))
            .toEqual({ error: expect.stringContaining('урьдчилан харсан төлөв алга') });
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('compares a unit without status against null', async () => {
        query('property_units', [{ ...unit('available'), status: null }]);
        const write = query('property_units', [{ id: 'unit-1' }]);
        expect(await updateUnitStatus('shop-1', { unit_id: 'unit-1', new_status: 'available', expected_status: null }, true)).toMatchObject({ success: true });
        expect(write.is).toHaveBeenCalledWith('status', null);
    });
});
