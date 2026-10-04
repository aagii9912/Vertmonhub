import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { UpdateRoleSchema, validateBody } from '@/lib/validations/schemas';
import { ALL_MODULES, clearPermissionsCache } from '@/lib/rbac';
import { logAdminAudit } from '@/lib/admin/audit';
import { roleSaveErrorResponse, saveRole } from '@/lib/admin/roles';

/**
 * PATCH /api/admin/roles/[id]
 * Role засварлах — permissions шинэчлэх
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const { id } = await params;
        const validation = validateBody(UpdateRoleSchema, await request.json());
        if (!validation.success) return validation.response;
        const { modules, ...fields } = validation.data;
        if (modules?.some((module) => !ALL_MODULES.includes(module as typeof ALL_MODULES[number])))
            return NextResponse.json({ error: 'Танигдаагүй модуль байна' }, { status: 400 });
        if (modules && new Set(modules).size !== modules.length)
            return NextResponse.json({ error: 'Модуль давхар сонгогдсон байна' }, { status: 400 });
        const changed = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
        if (modules === undefined && Object.keys(changed).length === 0)
            return NextResponse.json({ error: 'Шинэчлэх талбар алга' }, { status: 400 });

        const { data: role, error } = await saveRole({ roleId: id, fields: changed, modules: modules ?? null, actorId: admin.id });
        if (error) return roleSaveErrorResponse(error, 'Role шинэчлэхэд алдаа гарлаа');
        clearPermissionsCache(role.name);

        return NextResponse.json({ role });
    } catch (error) {
        return safeErrorResponse(error, 'Role шинэчлэхэд алдаа гарлаа');
    }
}

/**
 * DELETE /api/admin/roles/[id]
 * Custom role устгах (system role устгахгүй)
 */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const { id } = await params;

        // Check if system role
        const supabase = supabaseAdmin();
        const { data: role, error: fetchError } = await supabase
            .from('roles')
            .select('name, is_system')
            .eq('id', id)
            .single();

        if (fetchError || !role) {
            return NextResponse.json({ error: 'Role not found' }, { status: 404 });
        }

        if (role.is_system) {
            return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 403 });
        }

        // Check if any users have this role
        const { data: usersWithRole, error: usersError } = await supabase
            .from('user_roles')
            .select('id')
            .eq('role', role.name)
            .limit(1);
        if (usersError) return safeErrorResponse(usersError, 'Дүрийн хэрэглэгчдийг шалгахад алдаа гарлаа');

        if (usersWithRole && usersWithRole.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete role: users are still assigned to it' },
                { status: 409 }
            );
        }

        // Delete role (cascade deletes permissions)
        const { error: deleteError } = await supabase
            .from('roles')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return safeErrorResponse(deleteError, 'Role устгахад алдаа гарлаа');
        }

        clearPermissionsCache(role.name);
        await logAdminAudit({ actorId: admin.id, action: 'role.delete', targetId: id, meta: { name: role.name } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Role устгахад алдаа гарлаа');
    }
}
