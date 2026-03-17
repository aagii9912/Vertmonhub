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

/**
 * POST /api/admin/users — Create a new user (admin only)
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
        }

        const { email, password, full_name, role } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Имэйл болон нууц үг шаардлагатай' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой' }, { status: 400 });
        }

        // Create user in Supabase Auth
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || null },
        });

        if (createError) {
            if (createError.message?.includes('already been registered')) {
                return NextResponse.json({ error: 'Энэ имэйл хаягаар бүртгэл үүссэн байна' }, { status: 409 });
            }
            return safeErrorResponse(createError, 'Хэрэглэгч үүсгэх үед алдаа гарлаа');
        }

        // Assign role if provided
        if (role && newUser?.user?.id) {
            const { error: roleError } = await supabase
                .from('user_roles')
                .upsert({ user_id: newUser.user.id, role }, { onConflict: 'user_id' });

            if (roleError) {
                console.error('Role assignment error:', roleError);
            }
        }

        return NextResponse.json({
            success: true,
            user: {
                id: newUser.user?.id,
                email: newUser.user?.email,
                full_name: full_name || null,
                role: role || 'viewer',
                created_at: newUser.user?.created_at,
            },
        }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгч үүсгэх үед алдаа гарлаа');
    }
}
