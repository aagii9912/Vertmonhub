import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
                return NextResponse.json({ error: updateError.message }, { status: 500 });
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
                    return NextResponse.json({ error: permError.message }, { status: 500 });
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
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
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
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
