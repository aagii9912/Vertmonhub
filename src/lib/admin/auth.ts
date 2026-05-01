/**
 * Admin Authentication & Authorization
 * Middleware for Super Admin access using Supabase Auth.
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
 * Check if current user is an admin
 * Returns admin info or null if not authorized
 */
export async function getAdminUser(): Promise<AdminUser | null> {
    try {
        const supaUser = await getAuthUser();

        if (!supaUser) {
            logger.debug('Admin auth: No user found');
            return null;
        }

        const adminDb = supabaseAdmin();
        const { data: admin, error } = await adminDb
            .from('admins')
            .select('id, email, role')
            .eq('user_id', supaUser.id)
            .eq('is_active', true)
            .single();

        if (error) {
            logger.debug('Admin auth: Error checking admins table', { error: error.message });
            return null;
        }

        if (!admin) {
            logger.debug('Admin auth: User not in admins table');
            return null;
        }

        return {
            id: admin.id,
            email: admin.email,
            role: admin.role as AdminUser['role']
        };
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
