import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserShop } from '@/lib/auth/supabase-auth';
import * as z from 'zod';

const channelSchema = z.object({
    name: z.string().min(1, 'Сувгийн нэр оруулна уу'),
    type: z.enum(['social', 'search', 'affiliate', 'direct']),
    status: z.enum(['active', 'paused', 'archived']).default('active'),
    description: z.string().optional(),
});

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                },
            }
        );

        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 401 });

        const { data, error } = await supabase
            .from('marketing_channels')
            .select('*')
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ channels: data }, { status: 200 });
    } catch (error) {
        console.error('Marketing Channels GET API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                },
            }
        );

        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 401 });

        const body = await req.json();
        const validatedData = channelSchema.parse(body);

        const { data, error } = await supabase
            .from('marketing_channels')
            .insert([{ ...validatedData, shop_id: authShop.id }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ message: 'Суваг амжилттай нэмэгдлээ', channel: data }, { status: 201 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Буруу мэдээлэл', details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error('Marketing Channels POST API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}
