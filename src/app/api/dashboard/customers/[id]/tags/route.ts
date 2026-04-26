import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

// Add tag to customer
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { tag } = await request.json();

        if (!tag) {
            return NextResponse.json({ error: 'Tag required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get current tags
        const { data: customer } = await supabase
            .from('customers')
            .select('tags')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const currentTags: string[] = customer.tags || [];

        // Don't add duplicate
        if (currentTags.includes(tag)) {
            return NextResponse.json({ message: 'Tag already exists', tags: currentTags });
        }

        const newTags = [...currentTags, tag];

        const { data, error } = await supabase
            .from('customers')
            .update({ tags: newTags })
            .eq('id', id)
            .select('tags')
            .single();

        if (error) throw error;

        return NextResponse.json({ message: 'Tag added', tags: data.tags });
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
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { tag } = await request.json();

        if (!tag) {
            return NextResponse.json({ error: 'Tag required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get current tags
        const { data: customer } = await supabase
            .from('customers')
            .select('tags')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const currentTags: string[] = customer.tags || [];
        const newTags = currentTags.filter(t => t !== tag);

        const { data, error } = await supabase
            .from('customers')
            .update({ tags: newTags })
            .eq('id', id)
            .select('tags')
            .single();

        if (error) throw error;

        return NextResponse.json({ message: 'Tag removed', tags: data.tags });
    } catch (error) {
        console.error('Remove tag error:', error);
        return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }
}
