import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const fileExt = file.name.split('.').pop();
        const fileName = `${authShop.id}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

        // Upload to Supabase Storage using Admin client (bypasses RLS)
        const { error } = await supabase.storage
            .from('products')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (error) {
            console.error('Supabase storage error:', error);
            throw error;
        }

        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('products')
            .getPublicUrl(fileName);

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error('Upload API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
