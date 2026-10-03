import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { UpdateRoleSchema, validateBody } from '@/lib/validations/schemas';
import { ALL_MODULES, clearPermissionsCache } from '@/lib/rbac';
import { logAdminAudit } from '@/lib/admin/audit';

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
        const { display_name, display_name_mn, description, can_write, can_delete, can_access_admin, modules } = validation.data;
        if (modules?.some((module) => !ALL_MODULES.includes(module as typeof ALL_MODULES[number])))
            return NextResponse.json({ error: 'Танигдаагүй модуль байна' }, { status: 400 });
        if (modules && new Set(modules).size !== modules.length)
            return NextResponse.json({ error: 'Модуль давхар сонгогдсон байна' }, { status: 400 });

        // Check role exists
        const supabase = supabaseAdmin();
        const { data: existingRole, error: fetchError } = await supabase
            .from('roles')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existingRole) {
            return NextResponse.json({ error: 'Role not found' }, { status: 404 });
        }

        // Update role fields
        const updateData: Record<string, string | boolean | null> = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (display_name_mn !== undefined) updateData.display_name_mn = display_name_mn;
        if (description !== undefined) updateData.description = description;
        if (can_write !== undefined) updateData.can_write = can_write;
        if (can_delete !== undefined) updateData.can_delete = can_delete;
        if (can_access_admin !== undefined) updateData.can_access_admin = can_access_admin;
        if (modules !== undefined && Object.keys(updateData).length > 0)
            return NextResponse.json({ error: 'Модуль болон дүрийн талбарыг тус тусад нь шинэчилнэ үү' }, { status: 400 });

        if (modules !== undefined) {
            const { data: oldRows, error: readError } = await supabase.from('role_permissions')
                .select('module').eq('role_id', id);
            if (readError) return safeErrorResponse(readError, 'Модулийн эрх уншихад алдаа гарлаа');
            const old = new Set((oldRows || []).map((row) => row.module));
            const next = new Set(modules);
            const added = modules.filter((module) => !old.has(module));
            const removed = [...old].filter((module) => !next.has(module));

            // Insert first so a failed insert cannot erase existing permissions.
            if (added.length) {
                const { error } = await supabase.from('role_permissions')
                    .insert(added.map((module) => ({ role_id: id, module })));
                if (error) return safeErrorResponse(error, 'Модулийн эрх нэмэхэд алдаа гарлаа');
            }
            if (removed.length) {
                const { error } = await supabase.from('role_permissions')
                    .delete().eq('role_id', id).in('module', removed);
                if (error) {
                    if (added.length) await supabase.from('role_permissions').delete().eq('role_id', id).in('module', added);
                    return safeErrorResponse(error, 'Модулийн эрх хасахад алдаа гарлаа');
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase.from('roles').update(updateData).eq('id', id);
            if (updateError) return safeErrorResponse(updateError, 'Дүр шинэчлэхэд алдаа гарлаа');
        }

        // Return fresh data
        const { data: freshRole, error: freshError } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .eq('id', id)
            .single();
        if (freshError) return safeErrorResponse(freshError, 'Дүрийг дахин уншихад алдаа гарлаа');
        clearPermissionsCache(existingRole.name);
        await logAdminAudit({ actorId: admin.id, action: 'role.update', targetId: id, meta: { name: existingRole.name } });

        return NextResponse.json({ role: freshRole });
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
