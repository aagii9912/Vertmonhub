import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';

/** Admin хэсгийн identity шалгалт — `admin/layout.tsx` эрхгүй хэрэглэгчийг эндээс ялгаж буцаана. */
export async function GET() {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Admin эрх шаардлагатай' }, { status: 403 });
    return NextResponse.json({ admin: { email: admin.email, role: admin.role } });
}
