/**
 * Admin Authentication & Authorization
 * Middleware for Super Admin access using Supabase Auth
 * Supports both Supabase Auth and custom vertmon-session cookie
 */

import { getAuthUser } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export interface AdminUser {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'support';
    permissions?: { can_import_data?: boolean };
}

/**
 * Get user ID from the Supabase session (GoTrue). Хуучин `vertmon-session` custom cookie
 * fallback-ийг устгав — cookie-г хэн ч олгохоо больсон, шифрийн түлхүүр нь env байхгүй
 * үед hardcoded утга руу унадаг байв.
 */
async function resolveUserId(): Promise<{ userId: string; email?: string } | null> {
    const supaUser = await getAuthUser();
    if (supaUser) {
        return { userId: supaUser.id, email: supaUser.email || undefined };
    }
    return null;
}

/**
 * Check if current user is an admin
 * Returns admin info or null if not authorized
 */
export async function getAdminUser(): Promise<AdminUser | null> {
    try {
        const resolved = await resolveUserId();

        if (!resolved) {
            logger.debug('Admin auth: No user found via Supabase or session cookie');
            return null;
        }

        logger.debug('Admin auth: User found', { userId: resolved.userId });

        const adminDb = supabaseAdmin();

        // RBAC super_admin — ганц зам (хуучин `admins` хүснэгт prod DB-д байхгүй тул хасав).
        const { data: roleRow } = await adminDb
            .from('user_roles')
            .select('role')
            .eq('user_id', resolved.userId)
            .maybeSingle();

        if (roleRow?.role === 'super_admin') {
            logger.debug('Admin auth: Granted via RBAC super_admin', { userId: resolved.userId });
            return {
                id: resolved.userId,
                email: resolved.email || '',
                role: 'super_admin',
            };
        }

        logger.debug('Admin auth: Not in admins table and not RBAC super_admin');
        return null;
    } catch (error) {
        logger.error('Admin auth error', { error });
        return null;
    }
}

/**
 * Check if user has required admin role
 */
export async function requireAdmin(requiredRole?: AdminUser['role']): Promise<AdminUser> {
    const admin = await getAdminUser();

    if (!admin) {
        throw new Error('Unauthorized: Admin access required');
    }

    if (requiredRole && admin.role !== requiredRole && admin.role !== 'super_admin') {
        throw new Error(`Unauthorized: ${requiredRole} role required`);
    }

    return admin;
}

/**
 * Role hierarchy check
 */
export function hasPermission(userRole: AdminUser['role'], requiredRole: AdminUser['role']): boolean {
    const hierarchy: Record<AdminUser['role'], number> = {
        'support': 1,
        'admin': 2,
        'super_admin': 3
    };

    return hierarchy[userRole] >= hierarchy[requiredRole];
}
