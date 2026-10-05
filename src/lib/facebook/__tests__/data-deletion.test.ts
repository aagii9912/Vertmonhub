// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deletionRequestStatus, newDeletionConfirmationCode, normalizeDeletionCode } from '../data-deletion';

type Row = Record<string, unknown>;
const code = '0123456789abcdef0123456789abcdef';

function fakeDb(rows: Row[], error: Error | null = null) {
    const reads: Array<{ table: string; columns: string }> = [];
    const db = {
        from: (table: string) => {
            const filters: Array<(row: Row) => boolean> = [];
            const query = {
                select: (columns: string) => { reads.push({ table, columns }); return query; },
                eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
                order: () => query,
                limit: () => query,
                maybeSingle: async () => error
                    ? { data: null, error }
                    : { data: rows.find(row => filters.every(f => f(row))) ?? null, error: null },
            };
            return query;
        },
    } as unknown as SupabaseClient;
    return { db, reads };
}

describe('data deletion confirmation codes', () => {
    it('generates 32-character hex codes that the status page accepts', () => {
        const generated = newDeletionConfirmationCode();
        expect(generated).toMatch(/^[a-f0-9]{32}$/);
        expect(normalizeDeletionCode(generated)).toBe(generated);
        expect(normalizeDeletionCode(` ${code.toUpperCase()} `)).toBe(code);
        expect(normalizeDeletionCode('abc')).toBeNull();
        expect(normalizeDeletionCode("' or 1=1 --")).toBeNull();
        expect(normalizeDeletionCode(undefined)).toBeNull();
    });
});

describe('deletionRequestStatus', () => {
    it('reports the recorded state and reads only the status column', async () => {
        const { db, reads } = fakeDb([
            { confirmation_code: code, status: 'completed', user_id: '1234567890' },
            { confirmation_code: 'fedcba9876543210fedcba9876543210', status: 'pending', user_id: '42' },
        ]);
        expect(await deletionRequestStatus(db, code)).toBe('completed');
        expect(await deletionRequestStatus(db, 'fedcba9876543210fedcba9876543210')).toBe('pending');
        expect(await deletionRequestStatus(db, 'ffffffffffffffffffffffffffffffff')).toBe('not_found');
        expect(reads).toEqual(Array(3).fill({ table: 'data_deletion_requests', columns: 'status' }));
    });

    it('does not query malformed codes and separates read failures from missing requests', async () => {
        const { db, reads } = fakeDb([]);
        expect(await deletionRequestStatus(db, '')).toBe('not_found');
        expect(await deletionRequestStatus(db, 'not-a-code')).toBe('not_found');
        expect(reads).toEqual([]);

        const failing = fakeDb([], new Error('relation unavailable'));
        expect(await deletionRequestStatus(failing.db, code)).toBe('unavailable');
    });
});
