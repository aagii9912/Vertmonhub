import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserShop } from '@/lib/auth/supabase-auth';
import * as z from 'zod';

const contractSchema = z.object({
    channel_id: z.string().uuid('Зөв суваг сонгоно уу'),
    start_date: z.string().min(1, 'Эхлэх огноо оруулна уу'),
    end_date: z.string().optional().nullable(),
    budget: z.number().min(0, 'Төсөв эерэг тоо байх ёстой'),
    currency: z.string().default('MNT'),
    terms: z.string().optional(),
    kpi_target: z.string().optional(),
    status: z.enum(['draft', 'active', 'completed', 'cancelled']).default('active'),
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
        if (!authShop) return NextResponse.json({ error: 'Shop олдсонгүй' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const channelId = searchParams.get('channel_id');

        let query = supabase
            .from('channel_contracts')
            .select('*, marketing_channels(name)')
            .eq('shop_id', authShop.id)
            .order('start_date', { ascending: false });

        if (channelId) {
            query = query.eq('channel_id', channelId);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json({ contracts: data }, { status: 200 });
    } catch (error) {
        console.error('Channel Contracts GET API Error:', error);
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
        if (!authShop) return NextResponse.json({ error: 'Shop олдсонгүй' }, { status: 401 });

        const body = await req.json();

        // Zod validation
        const validatedData = contractSchema.parse(body);

        const { data, error } = await supabase
            .from('channel_contracts')
            .insert([{ ...validatedData, shop_id: authShop.id }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ message: 'Гэрээ амжилттай бүртгэгдлээ', contract: data }, { status: 201 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Буруу мэдээлэл', details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error('Channel Contracts POST API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}
