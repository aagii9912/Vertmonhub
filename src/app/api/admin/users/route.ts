import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getClerkUser } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/admin/users — List all users with roles
 */
export async function GET() {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        // Get all users from auth + their roles
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });

        // Get all roles
        const { data: roles } = await supabase.from('user_roles').select('user_id, role');
        const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

        const users = (authUsers?.users || []).map(u => ({
            id: u.id,
            email: u.email || '',
            full_name: u.user_metadata?.full_name || null,
            role: roleMap.get(u.id) || 'viewer',
            created_at: u.created_at,
        }));

        return NextResponse.json({ users });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчдийн жагсаалт унших үед алдаа гарлаа');
    }
}

/**
 * PATCH /api/admin/users — Update user role
 */
export async function PATCH(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const { userId: targetUserId, role } = await request.json();

        if (!targetUserId || !role) {
            return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
        }

        // Upsert role
        const { error } = await supabase
            .from('user_roles')
            .upsert({ user_id: targetUserId, role }, { onConflict: 'user_id' });

        if (error) return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');

        return NextResponse.json({ success: true, message: `Role updated to ${role}` });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');
    }
}
