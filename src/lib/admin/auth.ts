/**
 * Admin Authentication & Authorization
 * Middleware for Super Admin access using Supabase Auth
 * Supports both Supabase Auth and custom vertmon-session cookie
 */

import { getAuthUser } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export interface AdminUser {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'support';
    permissions?: { can_import_data?: boolean };
}

// Decrypt vertmon-session cookie (same logic as login route)
const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-key-32chars-min!!';
function decryptSession(encryptedText: string): { userId: string; email: string; role: string; expiresAt: number } | null {
    try {
        const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch {
        return null;
    }
}

/**
 * Get user ID from either Supabase auth or custom session cookie
 */
async function resolveUserId(): Promise<{ userId: string; email?: string } | null> {
    // Try Supabase auth first
    const supaUser = await getAuthUser();
    if (supaUser) {
        return { userId: supaUser.id, email: supaUser.email || undefined };
    }

    // Fallback: custom vertmon-session cookie
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('vertmon-session');
        if (sessionCookie?.value) {
            const session = decryptSession(sessionCookie.value);
            if (session && session.expiresAt > Date.now()) {
                logger.debug('Admin auth: Using custom session', { userId: session.userId });
                return { userId: session.userId, email: session.email };
            }
        }
    } catch {
        // Cookie access failed
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

        // 1) admins хүснэгт (legacy платформ-админ) — эхэлж шалгана
        const { data: admin } = await adminDb
            .from('admins')
            .select('id, email, role')
            .eq('user_id', resolved.userId)
            .eq('is_active', true)
            .maybeSingle();

        if (admin) {
            logger.debug('Admin auth: Admin found (admins table)', { email: admin.email, role: admin.role });
            return {
                id: admin.id,
                email: admin.email,
                role: admin.role as AdminUser['role'],
            };
        }

        // 2) RBAC super_admin — dashboard-ийн эрхтэй НЭГТГЭСЭН зам.
        //    user_roles.role === 'super_admin' бол admins хүснэгтэд байхгүй ч /admin-д нэвтэрнэ.
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
