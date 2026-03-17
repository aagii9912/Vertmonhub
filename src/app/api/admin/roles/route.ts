import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateRoleSchema, validateBody } from '@/lib/validations/schemas';

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
        const admin = await requireAdmin();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }

        const body = await request.json();

        // Validate input
        const validation = validateBody(CreateRoleSchema, body);
        if (!validation.success) return validation.response;
        const { name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, modules } = validation.data;

        // Create role
        const supabase = supabaseAdmin();
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
            return safeErrorResponse(roleError, 'Role үүсгэхэд алдаа гарлаа');
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
                return safeErrorResponse(permError, 'Permission нэмэхэд алдаа гарлаа');
            }
        }

        // Fetch fresh role with permissions
        const { data: freshRole } = await supabase
            .from('roles')
            .select('*, role_permissions(id, module)')
            .eq('id', role.id)
            .single();

        return NextResponse.json({ role: freshRole }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Role үүсгэхэд алдаа гарлаа');
    }
}
