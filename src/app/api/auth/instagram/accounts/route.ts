import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveApiUser } from '@/lib/auth/resolve-user';

interface StoredIgAccount {
    pageId: string;
    pageName: string;
    pageAccessToken?: string;
    instagramId: string;
    instagramUsername: string;
    instagramName: string;
    profilePicture: string;
    tokenExpiresIn: number | null;
}

// Get Instagram accounts from OAuth cookie
export async function GET() {
    try {
        const authUser = await resolveApiUser();
        if (!authUser) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const cookieStore = await cookies();
        const igAccountsCookie = cookieStore.get('ig_accounts');

        if (!igAccountsCookie?.value) {
            return NextResponse.json({ accounts: [] });
        }

        // Decode base64 and parse JSON
        const accountsJson = Buffer.from(igAccountsCookie.value, 'base64').toString('utf-8');
        const stored: StoredIgAccount[] = JSON.parse(accountsJson);

        // pageAccessToken-ыг ХЭЗЭЭ Ч клиент рүү буцаахгүй. Cookie нь httpOnly
        // боловч энэ endpoint түүнийг JS-д уншуулснаар httpOnly хамгаалалтыг
        // утгагүй болгож, XSS үед Page token хулгайлагдах эрсдэл үүсгэж байв.
        const accounts = (Array.isArray(stored) ? stored : []).map((a) => ({
            pageId: a.pageId,
            pageName: a.pageName,
            instagramId: a.instagramId,
            instagramUsername: a.instagramUsername,
            instagramName: a.instagramName,
            profilePicture: a.profilePicture,
            tokenExpiresIn: a.tokenExpiresIn,
        }));

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching Instagram accounts:', error);
        return NextResponse.json({ accounts: [], error: 'Failed to fetch accounts' });
    }
}

// Clear Instagram accounts cookie after selection
export async function DELETE() {
    try {
        const cookieStore = await cookies();
        cookieStore.delete('ig_accounts');
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing Instagram accounts cookie:', error);
        return NextResponse.json({ success: false });
    }
}
