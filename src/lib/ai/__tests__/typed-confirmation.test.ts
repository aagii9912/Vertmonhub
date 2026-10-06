import { describe, expect, it } from 'vitest';
import { classifyTypedConfirmation, planTypedConfirmation } from '../typed-confirmation';

describe('typed confirmation', () => {
    it.each([
        ['Тийм', 'approve'], ['тийм ээ!', 'approve'], ['за', 'approve'], ['OK', 'approve'], ['tiim', 'approve'], ['hii', 'approve'], ['Тэг.', 'approve'],
        ['Бүгдийг батал', 'approve_all'], ['bugdiig', 'approve_all'],
        ['үгүй', 'decline'], ['Болих', 'decline'], ['ugui', 'decline'],
    ])('reads «%s» as %s', (text, decision) => {
        expect(classifyTypedConfirmation(text)).toBe(decision);
    });

    it.each(['тийм, гэхдээ 3 өрөө болго', 'за тэгвэл маргааш', 'үгүй ээ, Сараад шилжүүл', 'Ажил нэм', ''])('leaves «%s» to the model', (text) => {
        expect(classifyTypedConfirmation(text)).toBeNull();
    });

    it('approves a single ordinary card but never money or bulk cards', () => {
        expect(planTypedConfirmation([{ id: 'a', tool: 'update_lead' }], 'approve')).toEqual({ approve: ['a'], cancel: [], needsCard: [], ambiguous: false });
        expect(planTypedConfirmation([{ id: 'p', tool: 'add_contract_payment' }], 'approve')).toEqual({ approve: [], cancel: [], needsCard: ['p'], ambiguous: false });
        expect(planTypedConfirmation([{ id: 'x', tool: 'not_a_tool' }], 'approve')).toMatchObject({ approve: [], needsCard: ['x'] });
    });

    it('needs «бүгдийг» for several cards and declines all of them on «үгүй»', () => {
        const pending = [{ id: 'a', tool: 'create_lead' }, { id: 'b', tool: 'schedule_viewing' }, { id: 'c', tool: 'bulk_update_leads' }];
        expect(planTypedConfirmation(pending, 'approve')).toMatchObject({ approve: [], ambiguous: true });
        expect(planTypedConfirmation(pending, 'approve_all')).toEqual({ approve: ['a', 'b'], cancel: [], needsCard: ['c'], ambiguous: false });
        expect(planTypedConfirmation(pending, 'decline')).toEqual({ approve: [], cancel: ['a', 'b', 'c'], needsCard: [], ambiguous: false });
    });
});
