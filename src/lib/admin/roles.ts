import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * Дүрийн мөр, модулийн эрх, admin audit-ыг нэг transaction-д хадгалж,
 * хадгалагдсан дүрийг role_permissions-тэй нь буцаана (migration 20261004120000).
 * `modules: null` бол одоогийн эрхийг хэвээр үлдээнэ.
 */
export function saveRole(input: { roleId: string | null; fields: Record<string, unknown>; modules: string[] | null; actorId: string }) {
    return supabaseAdmin().rpc('save_role', {
        p_role_id: input.roleId,
        p_fields: input.fields,
        p_modules: input.modules,
        p_actor: input.actorId,
    });
}

export function roleSaveErrorResponse(error: { code?: string }, fallbackMessage: string): NextResponse {
    if (error.code === '23505') return NextResponse.json({ error: 'Ийм нэртэй дүр аль хэдийн байна' }, { status: 409 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Дүр олдсонгүй' }, { status: 404 });
    // PGRST202: save_role migration хараахан хийгдээгүй.
    return safeErrorResponse(error, fallbackMessage, error.code === 'PGRST202' ? 503 : 500);
}
