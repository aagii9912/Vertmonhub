/**
 * AI Settings API
 * CRUD operations for FAQ, Quick Replies, Slogans, and AI Stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

// GET - Fetch all AI settings (FAQs, Quick Replies, Slogans, Stats)
export async function GET(request: NextRequest) {
    try {
        const shop = await getClerkUserShop();

        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type'); // 'faqs', 'quick_replies', 'slogans', 'stats', or null for all

        const result: Record<string, any> = {};

        // FAQs
        if (!type || type === 'faqs') {
            const { data: faqs, error } = await supabase
                .from('shop_faqs')
                .select('*')
                .eq('shop_id', shop.id)
                .order('sort_order', { ascending: true });

            if (!error) result.faqs = faqs || [];
        }

        // Quick Replies
        if (!type || type === 'quick_replies') {
            const { data: quickReplies, error } = await supabase
                .from('shop_quick_replies')
                .select('*')
                .eq('shop_id', shop.id)
                .order('created_at', { ascending: false });

            if (!error) result.quickReplies = quickReplies || [];
        }

        // Slogans
        if (!type || type === 'slogans') {
            const { data: slogans, error } = await supabase
                .from('shop_slogans')
                .select('*')
                .eq('shop_id', shop.id)
                .order('created_at', { ascending: false });

            if (!error) result.slogans = slogans || [];
        }

        // Stats
        if (!type || type === 'stats') {
            // Get shop AI stats from shops table
            const { data: shopStats } = await supabase
                .from('shops')
                .select('ai_total_conversations, ai_total_messages, ai_conversion_rate')
                .eq('id', shop.id)
                .single();

            const aiStats = {
                total_conversations: shopStats?.ai_total_conversations || 0,
                total_messages: shopStats?.ai_total_messages || 0,
                conversion_rate: shopStats?.ai_conversion_rate || 0
            };

            // Get top questions (may not exist yet if tables not created)
            let topQuestions: any[] = [];
            try {
                const { data } = await supabase
                    .from('ai_question_stats')
                    .select('question_pattern, sample_question, category, count')
                    .eq('shop_id', shop.id)
                    .order('count', { ascending: false })
                    .limit(10);
                topQuestions = data || [];
            } catch (e) {
                // Table might not exist yet
            }

            // Get recent conversations count (last 7 days)
            let recentConversations = 0;
            try {
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const { count } = await supabase
                    .from('ai_conversations')
                    .select('*', { count: 'exact', head: true })
                    .eq('shop_id', shop.id)
                    .gte('started_at', weekAgo);
                recentConversations = count || 0;
            } catch (e) {
                // Table might not exist yet
            }

            result.stats = {
                ...aiStats,
                recent_conversations: recentConversations,
                top_questions: topQuestions
            };
        }

        return NextResponse.json(result);
    } catch (error) {
        return safeErrorResponse(error, 'AI тохиргоо унших үед алдаа гарлаа');
    }
}

// POST - Create new FAQ, Quick Reply, or Slogan
export async function POST(request: NextRequest) {
    try {
        const shop = await getClerkUserShop();

        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { type, ...data } = body;

        if (!type) {
            return NextResponse.json({ error: 'Type is required (faqs, quick_replies, slogans)' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        let tableName: string;
        let insertData: Record<string, any>;

        switch (type) {
            case 'faqs':
                tableName = 'shop_faqs';
                insertData = {
                    shop_id: shop.id,
                    question: data.question,
                    answer: data.answer,
                    category: data.category || 'general',
                    sort_order: data.sort_order || 0
                };
                break;
            case 'quick_replies':
                tableName = 'shop_quick_replies';
                insertData = {
                    shop_id: shop.id,
                    name: data.name,
                    trigger_words: Array.isArray(data.trigger_words)
                        ? data.trigger_words
                        : data.trigger_words.split(',').map((t: string) => t.trim()),
                    response: data.response,
                    is_exact_match: data.is_exact_match || false
                };
                break;
            case 'slogans':
                tableName = 'shop_slogans';
                insertData = {
                    shop_id: shop.id,
                    slogan: data.slogan,
                    usage_context: data.usage_context || 'any'
                };
                break;
            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const { data: created, error } = await supabase
            .from(tableName)
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data: created });
    } catch (error) {
        return safeErrorResponse(error, 'AI тохиргоо нэмэх үед алдаа гарлаа');
    }
}

// PATCH - Update FAQ, Quick Reply, or Slogan
export async function PATCH(request: NextRequest) {
    try {
        const shop = await getClerkUserShop();

        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { type, id, ...data } = body;

        if (!type || !id) {
            return NextResponse.json({ error: 'Type and ID are required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        let tableName: string;

        switch (type) {
            case 'faqs':
                tableName = 'shop_faqs';
                break;
            case 'quick_replies':
                tableName = 'shop_quick_replies';
                // Convert trigger_words string to array if needed
                if (data.trigger_words && typeof data.trigger_words === 'string') {
                    data.trigger_words = data.trigger_words.split(',').map((t: string) => t.trim());
                }
                break;
            case 'slogans':
                tableName = 'shop_slogans';
                break;
            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const { data: updated, error } = await supabase
            .from(tableName)
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', shop.id) // Security: only update own shop's items
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        return safeErrorResponse(error, 'AI тохиргоо шинэчлэх үед алдаа гарлаа');
    }
}

// DELETE - Remove FAQ, Quick Reply, or Slogan
export async function DELETE(request: NextRequest) {
    try {
        const shop = await getClerkUserShop();

        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');

        if (!type || !id) {
            return NextResponse.json({ error: 'Type and ID are required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        let tableName: string;

        switch (type) {
            case 'faqs':
                tableName = 'shop_faqs';
                break;
            case 'quick_replies':
                tableName = 'shop_quick_replies';
                break;
            case 'slogans':
                tableName = 'shop_slogans';
                break;
            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', id)
            .eq('shop_id', shop.id); // Security: only delete own shop's items

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'AI тохиргоо устгах үед алдаа гарлаа');
    }
}
