import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CreateLeadSchema, validateBody } from '@/lib/validations/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
    try {
        const { supabase } = await import('@/lib/supabase');
        const body = await request.json();

        // Validate input with Zod
        const validation = validateBody(CreateLeadSchema, body);
        if (!validation.success) return validation.response;
        const { name, phone, email, company, message } = validation.data;

        // Generate AI response
        let aiResponse = '';
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            
            const prompt = `Чи Vertmon компанийн найрсаг менежер шүү! 😊

Одоо ${name}${company ? ` (${company}-с)` : ''} Odoo ERP-ийн талаар сонирхож байна. Түүнд ээлтэй, хүн шиг хариулт өг.

${message ? `Түүний хэлсэн зүйл: "${message}"` : 'Ерөнхий сонирхол илэрхийлж байна.'}

Ингэж хариул:
✓ Хүн шиг, найрсаг (AI биш шиг!)
✓ 2-3 өгүүлбэр (богино л хангалттай)
✓ Дараа нь яах талаар санаа өг
✓ Emoji зөв хэрэглэ (хэтрүүлэхгүй)
✓ ${name}-ийн нэрийг ашигла

❌ Бүү хэл: "Танд тусалж чадахдаа баяртай байна", "Манай компани", "Бид таньд үйлчилнэ"
✅ Хэл: Товч, ойлгомжтой, найрсаг!

Хариулт:`;

            const result = await model.generateContent(prompt);
            aiResponse = result.response.text();
        } catch (aiError) {
            console.error('AI response error:', aiError);
            aiResponse = `Сайн байна уу ${name}! 😊

Таны хүсэлтийг хүлээн авлаа. Бид тантай удахгүй холбогдоно.

Яаралтай байвал ${phone} руу залгаарай!`;
        }

        // Save to database with AI response
        const { data, error } = await supabase
            .from('leads')
            .insert([{ 
                name, 
                phone, 
                email, 
                company, 
                message,
                ai_response: aiResponse 
            }])
            .select()
            .single();

        if (error) {
            console.error('Lead insert error:', error);
            return NextResponse.json(
                { error: 'Хүсэлт илгээхэд алдаа гарлаа' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data,
            aiResponse
        });

    } catch (error) {
        return safeErrorResponse(error, 'Хүсэлт илгээхэд алдаа гарлаа');
    }
}

