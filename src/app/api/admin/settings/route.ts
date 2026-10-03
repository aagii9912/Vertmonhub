import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';

/** Identity endpoint retained for the dashboard AI import link. */
export async function GET() {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Admin эрх шаардлагатай' }, { status: 403 });
    return NextResponse.json({ admin: { email: admin.email, role: admin.role } });
}
