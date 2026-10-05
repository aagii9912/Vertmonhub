import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Meta-ийн өгөгдөл устгах callback (POST /api/meta/data-deletion) хүсэлт бүрийг
 * `data_deletion_requests`-д баталгаажуулах кодоор нь бүртгэдэг; /deletion-status
 * хуудас тэр кодоор зөвхөн төлөвийг уншина (Meta user id зэрэг хувийн мэдээлэлгүй).
 */
export type DeletionRequestStatus = 'completed' | 'pending' | 'not_found' | 'unavailable';

/** 16 санамсаргүй байт → 32 тэмдэгт hex; таах боломжгүй тул кодоор хайхад аюулгүй. */
export function newDeletionConfirmationCode(): string {
    return crypto.randomBytes(16).toString('hex');
}

const CODE_PATTERN = /^[a-f0-9]{32}$/;

export function normalizeDeletionCode(value: string | null | undefined): string | null {
    const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return CODE_PATTERN.test(code) ? code : null;
}

/** Кодын төлөв: бүртгэлгүй/буруу хэлбэрийн код → not_found, уншиж чадаагүй → unavailable. */
export async function deletionRequestStatus(db: SupabaseClient, value: string | null | undefined): Promise<DeletionRequestStatus> {
    const code = normalizeDeletionCode(value);
    if (!code) return 'not_found';
    const { data, error } = await db
        .from('data_deletion_requests')
        .select('status')
        .eq('confirmation_code', code)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return 'unavailable';
    if (data?.status === 'completed') return 'completed';
    if (data?.status === 'pending') return 'pending';
    return 'not_found';
}
