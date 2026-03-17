import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
    try {
        const { shopId } = await req.json();

        if (!shopId) {
            return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Fetch recent chat history
        const { data: recentChats, error } = await supabase
            .from('chat_history')
            .select('role, content')
            .eq('shop_id', shopId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching chat history:', error);
            return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
        }

        if (!recentChats || recentChats.length === 0) {
            return NextResponse.json({
                faqs: [],
                positiveTraits: [],
                negativeTraits: [],
                summary: "Хангалттай чатын түүх олдсонгүй."
            });
        }

        // Filter to only user messages
        const userMessages = recentChats
            .filter(chat => chat.role === 'user')
            .map(chat => chat.content)
            .join('\n---\n');

        const prompt = `
You are a sentiment and trend analysis AI for a Mongolian business.
Analyze the following customer messages and provide a JSON response with the following structure:
{
    "faqs": [
        { "q": "The question in Mongolian", "count": estimated frequency number, "trend": "up" | "down" | "flat" }
    ],
    "positiveTraits": ["trait 1", "trait 2", "trait 3"],
    "negativeTraits": ["issue 1", "issue 2", "issue 3"],
    "positivePercent": number (0-100),
    "negativePercent": number (0-100),
    "summary": "A concise 2-sentence summary in Mongolian of the user feedback trends."
}

Messages to analyze:
${userMessages}
`;

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
            },
        });

        const result = await model.generateContent(prompt);
        const resultText = result.response.text();
        const analysisResult = JSON.parse(resultText);

        return NextResponse.json(analysisResult);

    } catch (error) {
        return safeErrorResponse(error, 'Message analyze алдаа');
    }
}
