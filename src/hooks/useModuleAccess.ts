'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';

/**
 * Навигацийн эрхийн шалгалт — sidebar, ⌘K, дээд мөрийн «+ Шинэ» нэг дүрмээр.
 * Модульгүй ('') зүйл хүн бүрт; DB-ээс ирсэн эрх байвал түүгээр, үгүй бол дүрийн анхдагчаар.
 * Энэ нь зөвхөн UI-г нуудаг — сервер бүх хүсэлтийг дахин шалгана.
 */
export function useModuleAccess() {
    const { user } = useAuth();
    const role = user?.role || 'viewer';
    const permissions = user?.permissions;
    const can = useCallback(
        (module: string) => {
            if (!module) return true;
            return permissions ? canAccessModuleDynamic(permissions, module) : canAccessModule(role, module);
        },
        [role, permissions],
    );
    // Бичих эрх: ерөнхий бичих эрх + тухайн модуль (серверийн requireModuleWrite-тэй ижил дүрэм).
    const canWrite = useCallback(
        (module: string) => role === 'super_admin' || (!!permissions?.canWrite && can(module)),
        [role, permissions, can],
    );
    return { can, canWrite, isSuperAdmin: role === 'super_admin' };
}
