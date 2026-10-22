import { describe, expect, it } from 'vitest';
import { interestLabel } from '@/lib/leads/labels';
import {
    UNIT_STATUSES,
    propertyStatusLabel,
    propertyStatusTone,
    propertyTypeLabel,
    unitCategoryLabel,
    unitStatusLabel,
    unitDisplayNumber,
} from '../labels';

describe('inventory labels', () => {
    it('labels known unit values and keeps unknown ones visible', () => {
        expect(unitCategoryLabel('parking')).toBe('Зогсоол');
        expect(unitStatusLabel('handed_over')).toBe('Хүлээлгэсэн');
        expect(unitCategoryLabel('warehouse_x')).toBe('warehouse_x');
        expect(unitStatusLabel(null)).toBe('—');
        expect(unitCategoryLabel('constructor')).toBe('constructor');
    });

    it('orders unit statuses along the sales flow', () => {
        expect(UNIT_STATUSES).toEqual(['available', 'ordered', 'reserved', 'sold', 'handed_over']);
    });

    it('shares property type and status vocabulary with lead interest', () => {
        expect(propertyTypeLabel('house')).toBe('Хувийн байшин');
        expect(interestLabel({ preferred_type: 'house' })).toBe('Хувийн байшин');
        expect(interestLabel({ preferred_rooms: 3, preferred_type: 'office' })).toBe('3 өрөө');
        expect(interestLabel({})).toBe('—');
        expect(propertyStatusLabel('rented')).toBe('Түрээслэсэн');
        expect(propertyStatusTone('rented')).toBe('info');
        expect(propertyStatusTone('toString')).toBe('neutral');
    });
});

describe('unitDisplayNumber', () => {
    it('uses the unit number, but the code when the ERP left «0» or nothing', () => {
        expect(unitDisplayNumber({ unit_number: '1301', code: 'Б1-1301' })).toBe('1301');
        expect(unitDisplayNumber({ unit_number: '0', code: 'Б1-53' })).toBe('Б1-53');
        expect(unitDisplayNumber({ unit_number: ' ', code: 'Б2-171' })).toBe('Б2-171');
        expect(unitDisplayNumber({})).toBeNull();
    });
});
