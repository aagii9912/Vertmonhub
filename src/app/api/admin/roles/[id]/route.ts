import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * PATCH /api/admin/roles/[id]
 * Role засварлах — permissions шинэчлэх
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const admin = await requireAdmin();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const { display_name, display_name_mn, description, can_write, can_delete, can_access_admin, modules } = body;

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
        const updateData: Record<string, any> = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (display_name_mn !== undefined) updateData.display_name_mn = display_name_mn;
        if (description !== undefined) updateData.description = description;
        if (can_write !== undefined) updateData.can_write = can_write;
        if (can_delete !== undefined) updateData.can_delete = can_delete;
        if (can_access_admin !== undefined) updateData.can_access_admin = can_access_admin;

        if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
                .from('roles')
                .update(updateData)
                .eq('id', id);

            if (updateError) {
                return safeErrorResponse(updateError, 'Role шинэчлэхэд алдаа гарлаа');
            }
        }

        // Update module permissions if provided
        if (modules !== undefined && Array.isArray(modules)) {
            // Delete all existing permissions
            await supabase
                .from('role_permissions')
                .delete()
                .eq('role_id', id);

            // Insert new permissions
            if (modules.length > 0) {
                const permissionRows = modules.map((module: string) => ({
                    role_id: id,
                    module,
                }));

                const { error: permError } = await supabase
                    .from('role_permissions')
                    .insert(permissionRows);

                if (permError) {
                    return safeErrorResponse(permError, 'Permission шинэчлэхэд алдаа гарлаа');
                }
            }
        }

        // Return fresh data
        const { data: freshRole } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .eq('id', id)
            .single();

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
        const admin = await requireAdmin();
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
        const { data: usersWithRole } = await supabase
            .from('user_roles')
            .select('id')
            .eq('role', role.name)
            .limit(1);

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

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Role устгахад алдаа гарлаа');
    }
}
