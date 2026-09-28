import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireModuleWrite } from '@/lib/auth/require-permission';

// Get Instagram accounts from OAuth cookie
export async function GET() {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const cookieStore = await cookies();
        const igAccountsCookie = cookieStore.get('ig_accounts');

        if (!igAccountsCookie?.value) {
            return NextResponse.json({ accounts: [] });
        }

        // Decode base64 and parse JSON
        const accountsJson = Buffer.from(igAccountsCookie.value, 'base64').toString('utf-8');
        const accounts = JSON.parse(accountsJson);

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching Instagram accounts:', error);
        return NextResponse.json({ accounts: [], error: 'Failed to fetch accounts' });
    }
}

// Clear Instagram accounts cookie after selection
export async function DELETE() {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const cookieStore = await cookies();
        cookieStore.delete('ig_accounts');
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing Instagram accounts cookie:', error);
        return NextResponse.json({ success: false });
    }
}
