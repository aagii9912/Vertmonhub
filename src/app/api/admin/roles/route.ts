import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateRoleSchema, validateBody } from '@/lib/validations/schemas';
import { ALL_MODULES, clearPermissionsCache } from '@/lib/rbac';
import { roleSaveErrorResponse, saveRole } from '@/lib/admin/roles';

/**
 * GET /api/admin/roles
 * Бүх roles + permissions жагсаалт буцаана
 */
export async function GET() {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { data: roles, error } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .order('is_system', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            return safeErrorResponse(error, 'Role жагсаалт уншихад алдаа гарлаа');
        }

        return NextResponse.json({ roles: roles || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Role жагсаалт уншихад алдаа гарлаа');
    }
}

/**
 * POST /api/admin/roles
 * Шинэ role үүсгэх (super_admin only)
 */
export async function POST(request: Request) {
    try {
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const body = await request.json();

        // Validate input
        const validation = validateBody(CreateRoleSchema, body);
        if (!validation.success) return validation.response;
        const { name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, modules } = validation.data;
        if (modules?.some((module) => !ALL_MODULES.includes(module as typeof ALL_MODULES[number])))
            return NextResponse.json({ error: 'Танигдаагүй модуль байна' }, { status: 400 });
        if (modules && new Set(modules).size !== modules.length)
            return NextResponse.json({ error: 'Модуль давхар сонгогдсон байна' }, { status: 400 });

        const { data: role, error } = await saveRole({
            roleId: null,
            fields: { name, display_name, display_name_mn, description: description || null, can_write, can_delete, can_access_admin },
            modules: modules ?? [],
            actorId: admin.id,
        });
        if (error) return roleSaveErrorResponse(error, 'Role үүсгэхэд алдаа гарлаа');
        clearPermissionsCache(name);

        return NextResponse.json({ role }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Role үүсгэхэд алдаа гарлаа');
    }
}
