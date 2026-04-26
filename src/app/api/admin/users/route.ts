import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/admin/users — List all users with roles
 * Uses Supabase Admin API instead of direct pg connection
 */
export async function GET() {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        // Get all users via Supabase Admin API
        const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers({
            perPage: 1000,
        });

        if (authError) {
            console.error('Admin listUsers error:', authError);
            throw authError;
        }

        // Get all roles
        const { data: roles } = await supabase
            .from('user_roles')
            .select('user_id, role');

        const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

        const users = (authUsers || []).map(u => ({
            id: u.id,
            email: u.email || '',
            full_name: u.user_metadata?.full_name || null,
            role: roleMap.get(u.id) || 'viewer',
            created_at: u.created_at,
        }));

        // Sort by created_at desc
        users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return NextResponse.json({ users });
    } catch (error) {
        console.error('GET /api/admin/users error:', error);
        return safeErrorResponse(error, 'Хэрэглэгчдийн жагсаалт унших үед алдаа гарлаа');
    }
}

/**
 * PATCH /api/admin/users — Update user role
 */
export async function PATCH(request: NextRequest) {
    try {
        const userId = await getUserId();
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
 * Uses Supabase Admin API for proper user creation
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
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

        // Create user via Supabase Admin API
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: full_name || email,
            },
        });

        if (createError) {
            if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
                return NextResponse.json({ error: 'Энэ имэйл хаягаар бүртгэл үүссэн байна' }, { status: 409 });
            }
            console.error('Create user error:', createError);
            return NextResponse.json({ error: 'Хэрэглэгч үүсгэх үед алдаа: ' + createError.message }, { status: 500 });
        }

        const newUserId = newUser.user.id;

        // Create user_profiles entry
        await supabase.from('user_profiles').upsert({
            id: newUserId,
            email,
            full_name: full_name || email,
        }, { onConflict: 'id' });

        // Assign role if provided
        let roleWarning: string | null = null;
        if (role) {
            const { error: roleErr } = await supabase
                .from('user_roles')
                .upsert({ user_id: newUserId, role }, { onConflict: 'user_id' });

            if (roleErr) {
                roleWarning = 'Дүр оноох үед алдаа: ' + roleErr.message;
                console.error('Role assignment warning:', roleErr.message);
            }
        }

        return NextResponse.json({
            success: true,
            warning: roleWarning,
            user: {
                id: newUserId,
                email,
                full_name: full_name || null,
                role: role || 'viewer',
                created_at: new Date().toISOString(),
            },
        }, { status: 201 });
    } catch (error) {
        console.error('POST /api/admin/users full error:', error);
        return safeErrorResponse(error, 'Хэрэглэгч үүсгэх үед алдаа гарлаа');
    }
}

/**
 * DELETE /api/admin/users — Delete a user (super_admin only)
 * Uses Supabase Admin API for proper user deletion
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check super_admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get('userId');

        if (!targetUserId) {
            return NextResponse.json({ error: 'userId параметр шаардлагатай' }, { status: 400 });
        }

        // Prevent self-deletion
        if (targetUserId === userId) {
            return NextResponse.json({ error: 'Өөрийгөө устгах боломжгүй' }, { status: 400 });
        }

        // Delete from public tables first
        await supabase.from('user_roles').delete().eq('user_id', targetUserId);
        await supabase.from('user_profiles').delete().eq('id', targetUserId);
        await supabase.from('admins').delete().eq('user_id', targetUserId);

        // Delete from auth via Admin API
        const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);

        if (deleteError) {
            console.error('Delete user error:', deleteError);
            return NextResponse.json({ error: 'Хэрэглэгч устгах үед алдаа: ' + deleteError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Хэрэглэгч амжилттай устгагдлаа',
        });
    } catch (error) {
        console.error('DELETE /api/admin/users error:', error);
        return safeErrorResponse(error, 'Хэрэглэгч устгах үед алдаа гарлаа');
    }
}
