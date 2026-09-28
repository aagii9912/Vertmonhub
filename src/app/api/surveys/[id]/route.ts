import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import * as z from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

const submitResponseSchema = z.object({
    answers: z.record(z.string(), z.any()),
    customer_id: z.string().uuid().optional(),
    source: z.enum(['online', 'offline']).optional(),
    respondent_name: z.string().max(255).optional(),
    respondent_phone: z.string().max(50).optional(),
    notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const supabase = supabaseAdmin();

        const resolvedParams = await params;
        const surveyId = resolvedParams.id;
        const body = await req.json();
        const validatedData = submitResponseSchema.parse(body);
        const source = validatedData.source ?? 'online';
        let staffShopId: string | null = null;
        // CRM links and staff notes are privileged even if a caller labels the
        // response "online". Public responses may only submit respondent data.
        if (source === 'offline' || validatedData.customer_id || validatedData.notes) {
            const denied = await requireModuleWrite('surveys');
            if (denied) return denied;
            const shop = await getUserShop();
            if (!shop) return NextResponse.json({ error: 'Хандах эрхгүй' }, { status: 403 });
            staffShopId = shop.id;
        }

        // Check if survey exists and is active
        const { data: survey, error: surveyError } = await supabase
            .from('surveys')
            .select('is_active, shop_id')
            .eq('id', surveyId)
            .single();

        if (surveyError || !survey) {
            return NextResponse.json({ error: 'Судалгаа олдсонгүй' }, { status: 404 });
        }
        if (!survey.is_active) {
            return NextResponse.json({ error: 'Судалгаа хаагдсан байна' }, { status: 400 });
        }
        if (staffShopId && staffShopId !== survey.shop_id) {
            return NextResponse.json({ error: 'Хандах эрхгүй' }, { status: 403 });
        }
        if (validatedData.customer_id) {
            const { data: customer, error: customerError } = await supabase.from('customers')
                .select('id').eq('id', validatedData.customer_id).eq('shop_id', survey.shop_id).maybeSingle();
            if (customerError) throw customerError;
            if (!customer) return NextResponse.json({ error: 'Харилцагч олдсонгүй' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('survey_responses')
            .insert([{
                survey_id: surveyId,
                shop_id: survey.shop_id,
                answers: validatedData.answers,
                customer_id: validatedData.customer_id,
                source,
                respondent_name: validatedData.respondent_name ?? null,
                respondent_phone: validatedData.respondent_phone ?? null,
                notes: validatedData.notes ?? null,
            }])
            .select()
            .single();

        if (error) {
            console.error('Submit response error:', error);
            return NextResponse.json({ error: 'Хариу илгээхэд алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Амжилттай илгээлээ', response: data }, { status: 201 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Буруу мэдээлэл', details: error.flatten().fieldErrors }, { status: 400 });
        }
        console.error('Submit Survey API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}

// GET: Generate AI Summary for Survey Responses
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModule('surveys');
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Хандах эрхгүй' }, { status: 403 });
        const supabase = supabaseAdmin();

        const resolvedParams = await params;
        const surveyId = resolvedParams.id;

        // Fetch survey definition to know the questions
        const { data: survey, error: surveyError } = await supabase
            .from('surveys')
            .select('*')
            .eq('id', surveyId)
            .eq('shop_id', shop.id)
            .single();

        if (surveyError || !survey) {
            return NextResponse.json({ error: 'Судалгаа олдсонгүй' }, { status: 404 });
        }

        // Fetch all responses
        const { data: responses, error: responsesError } = await supabase
            .from('survey_responses')
            .select('*')
            .eq('survey_id', surveyId)
            .eq('shop_id', shop.id);

        if (responsesError) {
            return NextResponse.json({ error: 'Хариултууд татахад алдаа гарлаа' }, { status: 500 });
        }

        if (!responses || responses.length === 0) {
            return NextResponse.json({ summary: 'Одоогоор хариулт ирээгүй байна.', responseCount: 0 }, { status: 200 });
        }

        // Generate AI Summary using Gemini
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'AI тохиргоо олдсонгүй' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `
Та бол өгөгдлийн шинжээч AI байна. Дараах судалгааны асуултууд болон өгөгдсөн хариултуудад дүн шинжилгээ хийж, удирдлагын багт зориулсан товч бөгөөд ойлгомжтой тайлан (summary) гаргаж өгнө үү. Тайланг Монгол хэлээр гаргах хэрэгтэй.

**Судалгааны гарчиг:** ${survey.title}
**Судалгааны зорилго:** ${survey.description || 'Тодорхойгүй'}
**Нийт хариулсан хүний тоо:** ${responses.length}

**Асуултууд:**
${JSON.stringify(survey.questions, null, 2)}

**Цуглуулсан хариултууд:**
${JSON.stringify(responses.map(r => r.answers), null, 2)}

**Шаардлага:**
1. Нийтлэг гарсан хандлагуудыг дурдах
2. Хэрэглэгчдийн сэтгэл ханамжийн тойм (хэрэв үнэлгээ байвал)
3. Урт болон богино бичвэр хариултуудаас чухал санаануудыг түүж бичих
4. Цаашид анхаарах зүйлс эсвэл сайжруулах санал (дохио өгөх)

Тайланг цэгцтэй (bullet points ашиглаж) гаргана уу.
`;

        const result = await model.generateContent(prompt);
        const aiSummary = result.response.text();

        const onlineCount = responses.filter(r => (r.source ?? 'online') === 'online').length;
        const offlineCount = responses.length - onlineCount;

        return NextResponse.json({
            summary: aiSummary,
            responseCount: responses.length,
            onlineCount,
            offlineCount,
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description,
                questions: survey.questions,
            },
            responses,
        }, { status: 200 });

    } catch (error) {
        console.error('Survey Summary API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}
