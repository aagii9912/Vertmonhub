import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { addCustomerTag, removeCustomerTag } from '@/lib/services/CustomerOps';

// Add tag to customer
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { tag } = await request.json();

        if (!tag) {
            return NextResponse.json({ error: 'Tag required' }, { status: 400 });
        }

        const r = await addCustomerTag(supabaseAdmin(), authShop.id, id, tag);
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
        if (r.existed) return NextResponse.json({ message: 'Tag already exists', tags: r.tags });
        return NextResponse.json({ message: 'Tag added', tags: r.tags });
    } catch (error) {
        console.error('Add tag error:', error);
        return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }
}

// Remove tag from customer
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { tag } = await request.json();

        if (!tag) {
            return NextResponse.json({ error: 'Tag required' }, { status: 400 });
        }

        const r = await removeCustomerTag(supabaseAdmin(), authShop.id, id, tag);
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
        return NextResponse.json({ message: 'Tag removed', tags: r.tags });
    } catch (error) {
        console.error('Remove tag error:', error);
        return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }
}
