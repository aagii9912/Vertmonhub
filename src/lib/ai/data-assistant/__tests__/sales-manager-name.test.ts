// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb }));
// functions.ts service client-ийг нэг удаа кэшилдэг тул тест бүрийн DB руу дамжуулна.
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => state.db.from(table) }) }));

import { createMemoryDb } from '@/test/memory-db';
import { resolveSalesManagerName } from '../functions';

const ARIUNA = 'Б.Ариунаа';

beforeEach(() => {
    state.db = createMemoryDb({
        user_profiles: [
            { id: 'ariuna-user', full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' },
            { id: 'admin-user', full_name: 'Захирал Бат', email: 'bat@vertmon.mn' },
            { id: 'email-only', full_name: null, email: 'staff@vertmon.mn' },
            { id: 'twice-user', full_name: 'Давхар', email: 'twice@vertmon.mn' },
            { id: 'retired-user', full_name: 'Гарсан Дорж', email: 'dorj@vertmon.mn' },
        ],
        sales_managers: [
            { shop_id: 'shop-1', name: ARIUNA, user_id: 'ariuna-user', is_active: true },
            { shop_id: 'shop-2', name: 'Ариунаа (Elysium)', user_id: 'ariuna-user', is_active: true },
            { shop_id: 'shop-1', name: 'Давхар нэг', user_id: 'twice-user', is_active: true },
            { shop_id: 'shop-1', name: 'Давхар хоёр', user_id: 'twice-user', is_active: true },
            { shop_id: 'shop-1', name: 'Дорж', user_id: 'retired-user', is_active: false },
        ],
    });
});

describe('resolveSalesManagerName — AI бичилтийн менежерийн нэр', () => {
    it('акаунтаараа холбогдсон идэвхтэй менежерт тухайн төслийн бүртгэлийн нэр (профайлын нэр биш)', async () => {
        expect(await resolveSalesManagerName('ariuna-user', 'ariuna@vertmon.mn', 'shop-1')).toBe(ARIUNA);
        // Өөр төсөлд тэр төслийн бүртгэлийн нэр.
        expect(await resolveSalesManagerName('ariuna-user', 'ariuna@vertmon.mn', 'shop-2')).toBe('Ариунаа (Elysium)');
    });

    it('менежер биш, идэвхгүй, давхар холбоостой хэрэглэгчид хуучин дүрэм: профайлын нэр → и-мэйл → fallback', async () => {
        expect(await resolveSalesManagerName('admin-user', 'bat@vertmon.mn', 'shop-1')).toBe('Захирал Бат');
        expect(await resolveSalesManagerName('email-only', 'fallback@vertmon.mn', 'shop-1')).toBe('staff@vertmon.mn');
        expect(await resolveSalesManagerName('retired-user', 'dorj@vertmon.mn', 'shop-1')).toBe('Гарсан Дорж');
        expect(await resolveSalesManagerName('twice-user', 'twice@vertmon.mn', 'shop-1')).toBe('Давхар');
        expect(await resolveSalesManagerName('unknown-user', 'who@vertmon.mn', 'shop-1')).toBe('who@vertmon.mn');
        // Төслийн бүртгэлгүй (өөр төсөлд л менежер) бол профайлын нэр.
        expect(await resolveSalesManagerName('ariuna-user', 'ariuna@vertmon.mn', 'shop-3')).toBe('Ариунаа Батболд');
    });

    it('төсөлгүй эсвэл хэрэглэгчгүй дуудлага', async () => {
        expect(await resolveSalesManagerName('ariuna-user', 'ariuna@vertmon.mn', null)).toBe('Ариунаа Батболд');
        expect(await resolveSalesManagerName(undefined, 'fallback', 'shop-1')).toBe('fallback');
        expect(await resolveSalesManagerName(undefined, undefined, 'shop-1')).toBe('');
    });

    it('бүртгэл уншиж чадахгүй бол профайлын нэрээр (AI-г зогсоохгүй)', async () => {
        state.db.failNext.sales_managers = { code: '500', message: 'roster unavailable' };
        expect(await resolveSalesManagerName('ariuna-user', 'ariuna@vertmon.mn', 'shop-1')).toBe('Ариунаа Батболд');
    });
});
