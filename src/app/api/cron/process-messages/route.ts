/**
 * Process Pending Messages API (Cron Job)
 * 
 * Runs every 5 seconds to batch and process collected messages
 * Groups messages by sender, combines them, and sends one AI response
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { routeToAI, analyzeProductImageWithPlan, getPlanTypeFromSubscription } from '@/lib/ai/AIRouter';
import { sendTextMessage, sendSenderAction } from '@/lib/facebook/messenger';
import { detectIntent } from '@/lib/ai/intent-detector';
import { logger } from '@/lib/utils/logger';
import {
    getAIFeatures,
    getChatHistory,
    saveChatHistory,
    incrementMessageCount,
    buildNotifySettings,
    generateFallbackResponse,
    processAIResponse,
} from '@/lib/webhook/WebhookService';
import type { ChatMessage, AIEmotion, AIProduct } from '@/types/ai';

// Verify cron secret (Vercel sets this)
const CRON_SECRET = process.env.CRON_SECRET;

interface PendingMessage {
    id: string;
    shop_id: string;
    customer_id: string;
    sender_id: string;
    platform: string;
    message_type: string;
    content: string | null;
    image_url: string | null;
    access_token: string;
    created_at: string;
}

interface ShopData {
    id: string;
    name: string;
    description: string | null;
    ai_instructions: string | null;
    ai_emotion: string | null;
    custom_knowledge: string | null;
    is_ai_active: boolean;
    subscription_plan: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
    products: Array<{
        id: string;
        name: string;
        description: string | null;
        price: number | null;
        stock: number | null;
        variants: string | null;
        discount_percent: number | null;
    }>;
}

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret in production
        if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
            const authHeader = request.headers.get('authorization');
            if (authHeader !== `Bearer ${CRON_SECRET}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const supabase = supabaseAdmin();
        const now = new Date().toISOString();

        // Get pending messages that are ready to process (process_after has passed)
        const { data: pendingMessages, error: fetchError } = await supabase
            .from('pending_messages')
            .select('id, shop_id, customer_id, sender_id, platform, message_type, content, image_url, access_token, process_after, created_at')
            .eq('processed', false)
            .lte('process_after', now)
            .order('created_at', { ascending: true });

        if (fetchError) {
            logger.error('Failed to fetch pending messages:', { error: fetchError });
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!pendingMessages || pendingMessages.length === 0) {
            return NextResponse.json({ processed: 0, message: 'No pending messages' });
        }

        // Group messages by shop_id + sender_id
        const groupedMessages = new Map<string, PendingMessage[]>();
        for (const msg of pendingMessages as PendingMessage[]) {
            const key = `${msg.shop_id}:${msg.sender_id}`;
            if (!groupedMessages.has(key)) {
                groupedMessages.set(key, []);
            }
            groupedMessages.get(key)!.push(msg);
        }

        let processedCount = 0;

        // Process each group
        for (const [key, messages] of groupedMessages) {
            try {
                await processMessageBatch(supabase, messages);
                processedCount += messages.length;
            } catch (err) {
                logger.error(`Failed to process batch ${key}:`, { error: err });
            }
        }

        // Cleanup old processed messages
        await supabase
            .from('pending_messages')
            .delete()
            .eq('processed', true)
            .lt('created_at', new Date(Date.now() - 3600000).toISOString());

        logger.info(`Processed ${processedCount} batched messages`);
        return NextResponse.json({
            processed: processedCount,
            batches: groupedMessages.size
        });

    } catch (error: unknown) {
        logger.error('Cron job error:', { error });
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

async function processMessageBatch(supabase: ReturnType<typeof supabaseAdmin>, messages: PendingMessage[]) {
    if (messages.length === 0) return;

    const firstMsg = messages[0];
    const shopId = firstMsg.shop_id;
    const senderId = firstMsg.sender_id;
    const customerId = firstMsg.customer_id;
    const accessToken = firstMsg.access_token;
    const messageIds = messages.map(m => m.id);

    // Mark as processed immediately to prevent duplicate processing
    await supabase
        .from('pending_messages')
        .update({ processed: true })
        .in('id', messageIds);

    // Get shop data with products
    const { data: shop } = await supabase
        .from('shops')
        .select(`
            id, name, description, ai_instructions, ai_emotion, custom_knowledge,
            is_ai_active, subscription_plan, subscription_status, trial_ends_at,
            products (id, name, description, price, stock, variants, discount_percent)
        `)
        .eq('id', shopId)
        .single();

    if (!shop || shop.is_ai_active === false) {
        logger.info(`Shop ${shopId} AI disabled, skipping batch`);
        return;
    }

    const shopData = shop as ShopData;

    // Get customer data
    const { data: customer } = await supabase
        .from('customers')
        .select('id, shop_id, facebook_id, name, phone, address, total_orders, total_spent, is_vip, ai_paused_until, message_count, created_at')
        .eq('id', customerId)
        .single();

    if (!customer) return;

    // Check AI pause
    if (customer.ai_paused_until && new Date(customer.ai_paused_until) > new Date()) {
        logger.info(`AI paused for customer ${customerId}`);
        return;
    }

    // Combine messages
    const textMessages: string[] = [];
    const imageUrls: string[] = [];

    for (const msg of messages) {
        if (msg.message_type === 'image' && msg.image_url) {
            imageUrls.push(msg.image_url);
        }
        if (msg.content) {
            textMessages.push(msg.content);
        }
    }

    // Combine text messages into one
    const combinedText = textMessages.join(' ');

    // Send typing indicator
    await sendSenderAction(senderId, 'typing_on', accessToken);

    // Get AI features
    const aiFeatures = await getAIFeatures(shopId);

    try {
        let aiResponse: string = '';
        let imageAnalysisResult: string | null = null;

        // Process images first if any
        if (imageUrls.length > 0) {
            const planType = getPlanTypeFromSubscription({
                plan: shopData.subscription_plan || 'starter',
                status: shopData.subscription_status || 'active',
            });

            const productsForAnalysis = shopData.products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || undefined,
            }));

            // Analyze the first image
            const imageAnalysis = await analyzeProductImageWithPlan(
                imageUrls[0],
                productsForAnalysis,
                planType
            );

            if (imageAnalysis.matchedProduct) {
                const matchedProduct = shopData.products.find(p =>
                    p.name.toLowerCase().includes(imageAnalysis.matchedProduct!.toLowerCase()) ||
                    imageAnalysis.matchedProduct!.toLowerCase().includes(p.name.toLowerCase())
                );

                if (matchedProduct) {
                    const sizeInfo = matchedProduct.variants ? `\n📏 ${matchedProduct.variants}` : '';
                    imageAnalysisResult = `🏷️ ${matchedProduct.name}\n💰 ${matchedProduct.price?.toLocaleString()}₮\n📦 ${matchedProduct.stock} ширхэг${sizeInfo}`;
                }
            }

            // If no match, describe what's in the image
            if (!imageAnalysisResult && imageAnalysis.description) {
                imageAnalysisResult = `Зурагт: ${imageAnalysis.description}`;
            }
        }

        // If there's text message, process with AI
        if (combinedText.trim()) {
            const intent = detectIntent(combinedText);
            const previousHistory: ChatMessage[] = await getChatHistory(shopId, customerId);

            const mappedProducts: AIProduct[] = shopData.products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || undefined,
                price: p.price || 0,
                stock: p.stock ?? 0,
                variants: undefined,
                discount_percent: p.discount_percent ?? undefined,
            }));

            const response = await routeToAI(
                combinedText,
                {
                    shopId: shopData.id,
                    customerId: customerId,
                    shopName: shopData.name,
                    shopDescription: shopData.description || undefined,
                    aiInstructions: shopData.ai_instructions || undefined,
                    aiEmotion: (shopData.ai_emotion || 'friendly') as AIEmotion,
                    customKnowledge: undefined,
                    products: mappedProducts,
                    customerName: customer.name || undefined,
                    orderHistory: customer.total_orders || 0,
                    faqs: aiFeatures.faqs,
                    quickReplies: aiFeatures.quickReplies,
                    slogans: aiFeatures.slogans,
                    notifySettings: buildNotifySettings(shopData as any),
                    subscription: {
                        plan: shopData.subscription_plan || 'starter',
                        status: shopData.subscription_status || 'active',
                    },
                    messageCount: customer.message_count || 0,
                },
                previousHistory
            );

            aiResponse = response.text;

            // Process product images if AI requested
            await processAIResponse(response, senderId, accessToken);
        }

        // Combine responses
        let finalResponse = '';
        if (imageAnalysisResult && aiResponse) {
            finalResponse = `${imageAnalysisResult}\n\n${aiResponse}`;
        } else if (imageAnalysisResult) {
            finalResponse = imageAnalysisResult;
        } else if (aiResponse) {
            finalResponse = aiResponse;
        } else {
            finalResponse = generateFallbackResponse({ intent: 'GREETING', confidence: 0, entities: {} }, shopData.name, shopData.products as any);
        }

        // Send response
        await sendTextMessage({
            recipientId: senderId,
            message: finalResponse,
            pageAccessToken: accessToken,
        });

        // Save to chat history (combined)
        const userMessageSummary = imageUrls.length > 0
            ? `[${imageUrls.length} зураг] ${combinedText}`.trim()
            : combinedText;

        await saveChatHistory(shopId, customerId, userMessageSummary, finalResponse, 'BATCHED');
        await incrementMessageCount(customerId);

        logger.success(`Processed batch of ${messages.length} messages for sender ${senderId}`);

    } catch (error: unknown) {
        logger.error('Batch processing error:', { error });

        // Send fallback message
        await sendTextMessage({
            recipientId: senderId,
            message: generateFallbackResponse({ intent: 'GREETING', confidence: 0, entities: {} }, shopData.name, shopData.products as any),
            pageAccessToken: accessToken,
        });
    }
}
