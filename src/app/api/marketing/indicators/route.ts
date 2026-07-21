import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';

/**
 * GET/POST/DELETE /api/marketing/indicators — зах зээлийн үзүүлэлт
 * (ипотекийн хүү, банкны нөхцөл, макро мэдээлэл — market_indicators).
 * Судалгааны хэсэгт гараар бүртгэж, маркетингийн шийдвэрт ашиглана;
 * AI туслах get_market_indicators tool-оор уншина.
 */

const CreateSchema = z.object({
    category: z.enum(['mortgage', 'bank', 'macro', 'other']).default('mortgage'),
    name: z.string().trim().min(1).max(200),
    value: z.string().trim().min(1).max(200),
    note: z.string().max(2000).optional().nullable(),
    sourceUrl: z.string().url().max(500).optional().nullable(),
    recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || /market_indicators/i.test(error.message || '');
}

export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('market_indicators')
            .select('id, category, name, value, note, source_url, recorded_at, updated_at')
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('category', { ascending: true })
            .order('recorded_at', { ascending: false })
            .limit(200);

        if (error) {
            if (isMissingTable(error)) return NextResponse.json({ indicators: [], available: false });
            logger.error('[MarketIndicators] list error', { error: error.message });
            return NextResponse.json({ error: 'Үзүүлэлт унших алдаа' }, { status: 500 });
        }

        return NextResponse.json({ indicators: data || [], available: true });
    } catch (error) {
        return safeErrorResponse(error, 'Үзүүлэлт унших алдаа');
    }
}

export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('market_indicators')
            .insert({
                shop_id: authShop.id,
                category: parsed.data.category,
                name: parsed.data.name,
                value: parsed.data.value,
                note: parsed.data.note?.trim() || null,
                source_url: parsed.data.sourceUrl || null,
                recorded_at: parsed.data.recordedAt || new Date().toISOString().slice(0, 10),
            })
            .select('id, category, name, value, note, source_url, recorded_at')
            .single();

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json(
                    { error: 'market_indicators хүснэгт үүсээгүй байна — 20260721140000 миграцийг ажиллуулна уу' },
                    { status: 503 },
                );
            }
            logger.error('[MarketIndicators] create error', { error: error.message });
            return NextResponse.json({ error: 'Үзүүлэлт нэмэх алдаа' }, { status: 500 });
        }

        return NextResponse.json({ indicator: data });
    } catch (error) {
        return safeErrorResponse(error, 'Үзүүлэлт нэмэх алдаа');
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });

        const db = supabaseAdmin();
        const { error } = await db
            .from('market_indicators')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', authShop.id);

        if (error) {
            logger.error('[MarketIndicators] delete error', { error: error.message });
            return NextResponse.json({ error: 'Устгах алдаа' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Устгах алдаа');
    }
}
