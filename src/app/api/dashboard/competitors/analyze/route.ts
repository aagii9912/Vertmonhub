import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { withRetry } from '@/lib/ai/orchestrator/retry';
import { logger } from '@/lib/utils/logger';

// ============================================
// POST /api/dashboard/competitors/analyze
// Өрсөлдөгчдийн бүртгэл + өөрийн төслийн үнийн статистикийг Gemini-ээр
// харьцуулж монгол хэлээр стратегийн дүгнэлт (markdown) гаргана.
// ============================================

const MODEL = 'gemini-3.5-flash';
const CATEGORY = 'competitor';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface CompetitorValue {
    name: string;
    location?: string | null;
    district?: string | null;
    num_blocks?: number | null;
    planning?: string | null;
    payment_terms?: string | null;
    price_per_sqm?: number | null;
    notes?: string | null;
}

export async function POST() {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

        const supabase = supabaseAdmin();

        const [{ data: rows }, { data: contracts }, { data: units }] = await Promise.all([
            supabase
                .from('ai_knowledge_base')
                .select('value')
                .eq('shop_id', authShop.id)
                .eq('category', CATEGORY),
            // Өөрийн төслийн бодит м.кв дундаж үнэ (идэвхтэй гэрээнүүдээс)
            supabase
                .from('property_contracts')
                .select('price_per_sqm')
                .eq('shop_id', authShop.id)
                .is('deleted_at', null)
                .not('price_per_sqm', 'is', null)
                .limit(1000),
            // Нөөцийн байдал (нийт/боломжит нэгж)
            supabase
                .from('property_units')
                .select('status')
                .eq('shop_id', authShop.id)
                .limit(10000),
        ]);

        const competitors = (rows || []).map((r) => r.value as CompetitorValue).filter((c) => c?.name);
        if (competitors.length === 0) {
            return NextResponse.json(
                { error: 'Анализ хийхийн тулд эхлээд өрсөлдөгч бүртгэнэ үү' },
                { status: 400 },
            );
        }

        const ownPrices = (contracts || [])
            .map((c) => Number(c.price_per_sqm))
            .filter((n) => Number.isFinite(n) && n > 0);
        const ownAvgPrice = ownPrices.length
            ? Math.round(ownPrices.reduce((s, n) => s + n, 0) / ownPrices.length)
            : null;
        const unitRows = units || [];
        const totalUnits = unitRows.length;
        const availableUnits = unitRows.filter((u) => u.status === 'available').length;

        const competitorLines = competitors
            .map((c) => {
                const parts = [
                    `Нэр: ${c.name}`,
                    c.district ? `Дүүрэг: ${c.district}` : null,
                    c.location ? `Байршил: ${c.location}` : null,
                    c.num_blocks != null ? `Блок: ${c.num_blocks}` : null,
                    c.planning ? `Төлөвлөлт: ${c.planning}` : null,
                    c.price_per_sqm ? `М.кв үнэ: ${Number(c.price_per_sqm).toLocaleString('mn-MN')}₮` : null,
                    c.payment_terms ? `Төлбөрийн нөхцөл: ${c.payment_terms}` : null,
                    c.notes ? `Тэмдэглэл: ${c.notes}` : null,
                ].filter(Boolean);
                return `- ${parts.join(' · ')}`;
            })
            .join('\n');

        const ownContext = [
            `Төслийн нэр: ${authShop.name || 'Манай төсөл'}`,
            ownAvgPrice ? `Гэрээнүүдийн м.кв дундаж үнэ: ${ownAvgPrice.toLocaleString('mn-MN')}₮` : null,
            totalUnits > 0 ? `Нийт нэгж: ${totalUnits}, боломжит (зарагдаагүй): ${availableUnits}` : null,
        ]
            .filter(Boolean)
            .join('\n');

        const prompt = `Чи Монголын үл хөдлөх хөрөнгийн зах зээлийн шинжээч. Доорх өгөгдөлд тулгуурлан өрсөлдөгчийн харьцуулсан анализ хий.

## Манай төсөл
${ownContext}

## Өрсөлдөгчид (${competitors.length})
${competitorLines}

Дараах бүтэцтэй, товч бөгөөд ажил хэрэгч markdown тайлан бич (зөвхөн өгөгдөлд байгаа баримтад тулгуурла, таамаг зохиож болохгүй):

## Үнийн байршуулалт
Манай үнэ өрсөлдөгчидтэй харьцуулахад хаана байгаа, юу гэсэн үг вэ.

## Өрсөлдөгчдийн давуу/сул тал
Өрсөлдөгч тус бүрийн онцлох давуу болон сул тал (байршил, үнэ, төлбөрийн нөхцөл).

## Бидний боломж
Өгөгдлөөс харагдаж буй ялгарах боломжууд (3-5 зүйл).

## Зөвлөмж
Борлуулалт/маркетингийн багт өгөх тодорхой алхмууд (3-5 зүйл).`;

        const model = genAI.getGenerativeModel({ model: MODEL });
        const result = await withRetry(() => model.generateContent(prompt));
        const analysis = result.response.text();

        return NextResponse.json({
            analysis,
            meta: {
                competitors: competitors.length,
                ownAvgPrice,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        logger.error('[Competitors analyze] error:', { error });
        return NextResponse.json({ error: 'AI анализ хийхэд алдаа гарлаа' }, { status: 500 });
    }
}
