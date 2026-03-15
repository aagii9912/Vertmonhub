import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/admin/roles
 * Бүх roles + permissions жагсаалт буцаана
 */
export async function GET() {
    try {
        const admin = await requireAdmin();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: roles, error } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .order('is_system', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ roles: roles || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/roles
 * Шинэ role үүсгэх (super_admin only)
 */
export async function POST(request: Request) {
    try {
        const admin = await requireAdmin();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, modules } = body;

        if (!name || !display_name || !display_name_mn) {
            return NextResponse.json({ error: 'name, display_name, display_name_mn required' }, { status: 400 });
        }

        // Validate name format (lowercase, underscores)
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            return NextResponse.json({ error: 'Name must be lowercase with underscores only' }, { status: 400 });
        }

        // Create role
        const { data: role, error: roleError } = await supabase
            .from('roles')
            .insert({
                name,
                display_name,
                display_name_mn,
                description: description || null,
                can_write: can_write ?? false,
                can_delete: can_delete ?? false,
                can_access_admin: can_access_admin ?? false,
                is_system: false,
            })
            .select()
            .single();

        if (roleError) {
            if (roleError.code === '23505') {
                return NextResponse.json({ error: 'Role name already exists' }, { status: 409 });
            }
            return NextResponse.json({ error: roleError.message }, { status: 500 });
        }

        // Add module permissions if provided
        if (modules && Array.isArray(modules) && modules.length > 0) {
            const permissionRows = modules.map((module: string) => ({
                role_id: role.id,
                module,
            }));

            const { error: permError } = await supabase
                .from('role_permissions')
                .insert(permissionRows);

            if (permError) {
                // Rollback role creation
                await supabase.from('roles').delete().eq('id', role.id);
                return NextResponse.json({ error: permError.message }, { status: 500 });
            }
        }

        // Fetch fresh role with permissions
        const { data: freshRole } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .eq('id', role.id)
            .single();

        return NextResponse.json({ role: freshRole }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
