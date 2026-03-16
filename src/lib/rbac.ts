/**
 * Role-Based Access Control (RBAC)
 * 
 * Dynamic role system — DB-с зөвшөөрлүүд татна.
 * Static mapping fallback болж ажиллана.
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// Types
// ============================================

export type UserRole = string; // Dynamic — any role name

export interface RolePermissions {
    /** Allowed dashboard modules */
    modules: string[];
    /** Can create/edit data */
    canWrite: boolean;
    /** Can delete data */
    canDelete: boolean;
    /** Can access admin panel */
    canAccessAdmin: boolean;
    /** Display name */
    displayName: string;
    /** Mongolian display name */
    displayNameMN: string;
}

// ============================================
// Module Definitions — 14 modules
// ============================================

export const ALL_MODULES = [
    'dashboard',
    'properties',
    'leads',
    'viewings',
    'contracts',
    'customers',
    'inbox',
    'reports',
    'reports-leads',
    'marketing-roi',
    'surveys',
    'ai-assistant',
    'ai-settings',
    'settings',
] as const;

export type DashboardModule = typeof ALL_MODULES[number];

/** Module display names for admin UI */
export const MODULE_LABELS: Record<string, { en: string; mn: string }> = {
    'dashboard': { en: 'Dashboard', mn: 'Хянах самбар' },
    'properties': { en: 'Properties', mn: 'Үл хөдлөх' },
    'leads': { en: 'Leads', mn: 'Лийд' },
    'viewings': { en: 'Viewings', mn: 'Үзлэг' },
    'contracts': { en: 'Contracts', mn: 'Гэрээ' },
    'customers': { en: 'Customers', mn: 'Харилцагч' },
    'inbox': { en: 'Inbox', mn: 'Мессеж' },
    'reports': { en: 'Reports', mn: 'Аналитик' },
    'reports-leads': { en: 'Leads Report', mn: 'Лийд тайлан' },
    'marketing-roi': { en: 'Marketing ROI', mn: 'Маркетинг ROI' },
    'surveys': { en: 'Surveys', mn: 'Судалгаа' },
    'ai-assistant': { en: 'AI Assistant', mn: 'AI Туслах' },
    'ai-settings': { en: 'AI Settings', mn: 'AI Тохируулга' },
    'settings': { en: 'Settings', mn: 'Тохиргоо' },
};

// ============================================
// Static Fallback — used when DB not available
// ============================================

export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
    super_admin: {
        modules: [...ALL_MODULES],
        canWrite: true,
        canDelete: true,
        canAccessAdmin: true,
        displayName: 'Super Admin',
        displayNameMN: 'Супер Админ',
    },
    admin: {
        modules: [...ALL_MODULES],
        canWrite: true,
        canDelete: true,
        canAccessAdmin: true,
        displayName: 'Admin',
        displayNameMN: 'Админ',
    },
    sales_manager: {
        modules: [
            'dashboard', 'properties', 'leads', 'viewings', 'contracts',
            'customers', 'inbox', 'reports', 'reports-leads', 'ai-assistant',
        ],
        canWrite: true,
        canDelete: false,
        canAccessAdmin: false,
        displayName: 'Sales Manager',
        displayNameMN: 'Борлуулалтын менежер',
    },
    marketing: {
        modules: [
            'dashboard', 'marketing-roi', 'reports', 'reports-leads',
            'surveys', 'ai-assistant', 'ai-settings', 'leads', 'customers',
        ],
        canWrite: true,
        canDelete: false,
        canAccessAdmin: false,
        displayName: 'Marketing',
        displayNameMN: 'Маркетинг',
    },
    viewer: {
        modules: ['dashboard', 'reports'],
        canWrite: false,
        canDelete: false,
        canAccessAdmin: false,
        displayName: 'Viewer',
        displayNameMN: 'Зөвхөн харагч',
    },
};

// ============================================
// Dynamic Permission Fetching
// ============================================

/** Cache for role permissions (per role name) */
const permissionsCache = new Map<string, { data: RolePermissions; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch role permissions from database
 * Falls back to static mapping if DB query fails
 * @param roleName - The role name to fetch permissions for 
 * @param supabaseClient - Optional authenticated Supabase client (from AuthContext)
 */
export async function fetchRolePermissions(roleName: string, supabaseClient?: any): Promise<RolePermissions> {
    // Check cache first
    const cached = permissionsCache.get(roleName);
    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    try {
        let supabase = supabaseClient;

        if (!supabase) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseKey) {
                return getStaticPermissions(roleName);
            }

            supabase = createClient(supabaseUrl, supabaseKey);
        }

        // Fetch role details + permissions in one go
        const { data: role, error: roleError } = await supabase
            .from('roles')
            .select('*, role_permissions(module)')
            .eq('name', roleName)
            .single();

        if (roleError || !role) {
            return getStaticPermissions(roleName);
        }

        const permissions: RolePermissions = {
            modules: (role.role_permissions || []).map((rp: { module: string }) => rp.module),
            canWrite: role.can_write ?? false,
            canDelete: role.can_delete ?? false,
            canAccessAdmin: role.can_access_admin ?? false,
            displayName: role.display_name || roleName,
            displayNameMN: role.display_name_mn || roleName,
        };

        // Cache result
        permissionsCache.set(roleName, { data: permissions, expiry: Date.now() + CACHE_TTL });

        return permissions;
    } catch {
        return getStaticPermissions(roleName);
    }
}

/** Get static permissions or minimal fallback */
function getStaticPermissions(roleName: string): RolePermissions {
    if (ROLE_PERMISSIONS[roleName]) {
        return ROLE_PERMISSIONS[roleName];
    }
    // Unknown role — minimal access
    return {
        modules: ['dashboard'],
        canWrite: false,
        canDelete: false,
        canAccessAdmin: false,
        displayName: roleName,
        displayNameMN: roleName,
    };
}

/** Clear permissions cache (e.g., after admin updates roles) */
export function clearPermissionsCache(roleName?: string) {
    if (roleName) {
        permissionsCache.delete(roleName);
    } else {
        permissionsCache.clear();
    }
}

// ============================================
// Helper Functions (support both static & dynamic)
// ============================================

/** Check if a role can access a specific module (static check) */
export function canAccessModule(role: string, module: string): boolean {
    if (role === 'super_admin') return true; // Super admin bypasses all checks
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    return perms.modules.includes(module);
}

/** Check if a role can access a module using dynamic permissions */
export function canAccessModuleDynamic(permissions: RolePermissions, module: string): boolean {
    return permissions.modules.includes(module);
}

/** Check if a role has write permissions */
export function canWrite(role: string): boolean {
    return ROLE_PERMISSIONS[role]?.canWrite ?? false;
}

/** Check if a role has delete permissions */
export function canDelete(role: string): boolean {
    return ROLE_PERMISSIONS[role]?.canDelete ?? false;
}

/** Check if a role can access admin panel */
export function canAccessAdmin(role: string): boolean {
    return ROLE_PERMISSIONS[role]?.canAccessAdmin ?? false;
}

/** Get display name for a role */
export function getRoleDisplayName(role: string, locale: 'en' | 'mn' = 'mn'): string {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return role;
    return locale === 'mn' ? perms.displayNameMN : perms.displayName;
}

/** Get allowed modules for a role */
export function getAllowedModules(role: string): string[] {
    return ROLE_PERMISSIONS[role]?.modules ?? ['dashboard'];
}

/** Validate if a string is a known system role */
export function isValidRole(role: string): boolean {
    return ['admin', 'sales_manager', 'marketing', 'viewer'].includes(role);
}

/** Check if role exists in static mapping (for backwards compat) */
export function isSystemRole(role: string): boolean {
    return ROLE_PERMISSIONS[role] !== undefined;
}
