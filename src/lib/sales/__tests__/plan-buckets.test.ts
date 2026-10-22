import { describe, expect, it } from 'vitest';
import { planBucketOf } from '../plan-buckets';

describe('planBucketOf', () => {
    it('орон сууцыг Б1/Б2 блокоор, зогсоолыг блокоос үл хамааран', () => {
        expect(planBucketOf({ product_type: 'residential', block_name: 'Б1' })).toBe('b1');
        expect(planBucketOf({ product_type: 'residential', block_name: ' Б2 ' })).toBe('b2');
        expect(planBucketOf({ product_type: 'parking', block_name: 'Б1' })).toBe('parking');
        expect(planBucketOf({ product_type: 'parking', block_name: null })).toBe('parking');
    });

    it('агуулах, үйлчилгээ, өөр блок, блокгүй бол төлөвлөгөөнд хамаарахгүй (null)', () => {
        expect(planBucketOf({ product_type: 'industry', block_name: 'Б1' })).toBeNull();
        expect(planBucketOf({ product_type: 'commercial', block_name: 'Б2' })).toBeNull();
        expect(planBucketOf({ product_type: 'residential', block_name: '202' })).toBeNull();
        expect(planBucketOf({ product_type: 'residential', block_name: null })).toBeNull();
        expect(planBucketOf({ product_type: null, block_name: 'Б1' })).toBeNull();
        expect(planBucketOf({})).toBeNull();
    });
});
