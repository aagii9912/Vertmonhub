import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook, sendTextMessage, sendSenderAction, sendMessageWithQuickReplies } from '@/lib/facebook/messenger';
import { routeToAI, analyzeProductImageWithPlan, getPlanTypeFromSubscription } from '@/lib/ai/AIRouter';
import { detectIntent } from '@/lib/ai/intent-detector';
import { shouldReplyToComment } from '@/lib/ai/comment-detector';
import { getCustomerMemory } from '@/lib/ai/tools/memory';
import { logger } from '@/lib/utils/logger';
import { verifyWebhookSignature } from '@/lib/utils/verify-webhook-signature';
import {
    getShopByPageId,
    getShopByInstagramId,
    getAIFeatures,
    getOrCreateCustomer,
    getOrCreateInstagramCustomer,
    updateCustomerInfo,
    getChatHistory,
    saveChatHistory,
    incrementMessageCount,
    buildNotifySettings,
    generateFallbackResponse,
    processAIResponse,
    replyToComment,
    ShopWithProducts,
} from '@/lib/webhook/WebhookService';
import type { ChatMessage } from '@/types/ai';

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
    console.error('CRITICAL: FACEBOOK_VERIFY_TOKEN environment variable is required');
}

const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

/**
 * Facebook webhook entry type
 */
interface WebhookEntry {
    id: string;
    changes?: Array<{
        field: string;
        value?: {
            item?: string;
            message?: string;
            comment_id?: string;
            post_id?: string;
            from?: { id: string; name?: string };
        };
    }>;
    messaging?: Array<{
        sender: { id: string };
        message?: {
            text?: string;
            attachments?: Array<{
                type: string;
                payload?: { url?: string };
            }>;
        };
        postback?: { payload?: string };
    }>;
}

// Verify webhook (GET request from Facebook)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (!VERIFY_TOKEN) {
        logger.error('FACEBOOK_VERIFY_TOKEN not configured');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const result = verifyWebhook(mode, token, challenge, VERIFY_TOKEN);

    if (result) {
        logger.info('Webhook verified successfully');
        return new NextResponse(result, { status: 200 });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Handle incoming messages (POST request from Facebook/Instagram)
export async function POST(request: NextRequest) {
    try {
        // Verify webhook signature (X-Hub-Signature-256)
        const rawBody = await request.text();
        const signature = request.headers.get('x-hub-signature-256');

        if (APP_SECRET && process.env.NODE_ENV === 'production') {
            if (!verifyWebhookSignature(rawBody, signature, APP_SECRET)) {
                logger.warn('Webhook signature verification failed');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
            }
        }

        const body = JSON.parse(rawBody);

        // Determine platform type: 'page' for Messenger, 'instagram' for Instagram
        const platform: 'messenger' | 'instagram' = body.object === 'instagram' ? 'instagram' : 'messenger';

        // Validate object type (page or instagram)
        if (body.object !== 'page' && body.object !== 'instagram') {
            return NextResponse.json({ error: 'Invalid object type' }, { status: 400 });
        }

        logger.info(`Webhook received for platform: ${platform}`);

        // Process each entry
        for (const entry of body.entry as WebhookEntry[]) {
            const accountId = entry.id; // Page ID for Messenger, or Instagram Business Account ID

            // Get shop based on platform
            let shop: ShopWithProducts | null = null;
            if (platform === 'instagram') {
                shop = await getShopByInstagramId(accountId);
            } else {
                shop = await getShopByPageId(accountId);
            }

            if (!shop) {
                logger.warn(`No active shop found for ${platform} account ${accountId}`);
                continue;
            }

            // Get AI features for this shop
            const aiFeatures = await getAIFeatures(shop.id);

            // Get access token based on platform
            const accessToken = platform === 'instagram'
                ? (shop.instagram_access_token || shop.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN)
                : (shop.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN);

            if (!accessToken) {
                logger.warn(`No access token for shop ${shop.name} on ${platform}`);
                continue;
            }

            // Process Facebook Page feed events (comments) - only for Messenger platform
            if (platform === 'messenger') {
                for (const change of entry.changes || []) {
                    if (change.field === 'feed' && change.value?.item === 'comment') {
                        const commentData = change.value;
                        const commentMessage = commentData.message || '';
                        const commentId = commentData.comment_id;
                        const senderId = commentData.from?.id;

                        // Don't reply to own comments (from page)
                        if (senderId === accountId || !commentId) continue;

                        logger.info(`[${shop.name}] New comment received`, {
                            commentMessage,
                            senderName: commentData.from?.name
                        });

                        // Check if comment is product-related and reply
                        if (shouldReplyToComment(commentMessage)) {
                            logger.info(`[${shop.name}] Comment is product-related, replying...`);
                            await replyToComment(
                                shop.id,
                                shop.name,
                                shop.facebook_page_username,
                                commentId,
                                commentMessage,
                                accessToken
                            );
                        } else {
                            logger.debug(`[${shop.name}] Comment not product-related, skipping`);
                        }
                    }
                }
            }

            // Process messaging events (works for both Messenger and Instagram)
            for (const event of entry.messaging || []) {
                const senderId = event.sender.id;

                // Handle text messages
                if (event.message?.text) {
                    const userMessage = event.message.text;
                    logger.info(`[${shop.name}] Received ${platform} message`, { userMessage, senderId });

                    // Mark Seen & Typing indicators
                    await sendSenderAction(senderId, 'mark_seen', accessToken);
                    await sendSenderAction(senderId, 'typing_on', accessToken);

                    // Detect intent
                    const intent = detectIntent(userMessage);
                    logger.debug('Intent detected', { intent: intent.intent, confidence: intent.confidence });

                    // Get or create customer based on platform
                    let customer = platform === 'instagram'
                        ? await getOrCreateInstagramCustomer(shop.id, senderId, accessToken)
                        : await getOrCreateCustomer(shop.id, senderId, accessToken);

                    // Update customer info if needed
                    customer = await updateCustomerInfo(customer, senderId, accessToken, userMessage);

                    // CHECK: Global AI Switch
                    if (shop.is_ai_active === false) {
                        logger.info(`[${shop.name}] AI is globally disabled. Skipping response.`);
                        continue;
                    }

                    // CHECK: Admin Takeover (AI Paused)
                    if (customer.ai_paused_until && new Date(customer.ai_paused_until) > new Date()) {
                        logger.info(`[${shop.name}] AI paused for customer ${customer.id} until ${customer.ai_paused_until}. Skipping.`);
                        continue;
                    }

                    // Generate AI response
                    let aiResponse: string;
                    let aiQuickReplies: Array<{ title: string; payload: string }> | undefined;
                    try {
                        logger.info(`[${shop.name}] Generating AI response...`);

                        // Get chat history for context
                        const previousHistory: ChatMessage[] = await getChatHistory(shop.id, customer.id);

                        // Map products to ensure null values are converted to undefined
                        const mappedProducts = shop.properties?.map(p => ({
                            ...p,
                            discount_percent: p.discount_percent ?? undefined,
                        }));

                        // Get customer memory (preferences saved by AI)
                        const customerMemory = customer.id
                            ? await getCustomerMemory(customer.id)
                            : undefined;

                        // Generate response with minimum delay for typing animation
                        const [response] = await Promise.all([
                            routeToAI(
                                userMessage,
                                {
                                    shopId: shop.id,
                                    customerId: customer.id,
                                    shopName: shop.name,
                                    shopDescription: shop.description || undefined,
                                    aiInstructions: shop.ai_instructions || undefined,
                                    aiEmotion: shop.ai_emotion || 'friendly',
                                    customKnowledge: shop.custom_knowledge || undefined,
                                    products: mappedProducts || [],
                                    customerName: customer.name || undefined,
                                    orderHistory: customer.total_orders || 0,
                                    faqs: aiFeatures.faqs,
                                    quickReplies: aiFeatures.quickReplies,
                                    slogans: aiFeatures.slogans,
                                    notifySettings: buildNotifySettings(shop),
                                    customerMemory: customerMemory || undefined,
                                    // Add subscription for plan-based AI routing
                                    subscription: {
                                        plan: shop.subscription_plan || 'starter',
                                        status: shop.subscription_status || 'active',
                                        trial_ends_at: shop.trial_ends_at || undefined,
                                    },
                                    messageCount: customer.message_count || 0,
                                },
                                previousHistory
                            ),
                            new Promise(resolve => setTimeout(resolve, 1500))
                        ]);

                        aiResponse = response.text;
                        aiQuickReplies = response.quickReplies;
                        logger.success('AI response generated', {
                            preview: aiResponse.substring(0, 100) + '...',
                            hasImage: !!response.imageAction,
                            hasQuickReplies: !!aiQuickReplies
                        });

                        // Process and send product images if AI requested
                        await processAIResponse(response, senderId, accessToken);

                    } catch (aiError) {
                        const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown error';
                        const errorStack = aiError instanceof Error ? aiError.stack : undefined;
                        logger.error('AI Error:', { message: errorMessage, stack: errorStack });

                        // Generate fallback response based on intent
                        aiResponse = generateFallbackResponse(intent, shop.name, shop.properties);
                    }

                    // Save chat history
                    await saveChatHistory(shop.id, customer.id, userMessage, aiResponse, intent.intent);

                    // Increment message count
                    await incrementMessageCount(customer.id);

                    // Send the AI response via Messenger API (works for both platforms)
                    if (aiQuickReplies && aiQuickReplies.length > 0) {
                        await sendMessageWithQuickReplies({
                            recipientId: senderId,
                            message: aiResponse,
                            pageAccessToken: accessToken,
                            quickReplies: aiQuickReplies.map(qr => ({
                                content_type: 'text' as const,
                                title: qr.title,
                                payload: qr.payload,
                            })),
                        });
                    } else {
                        await sendTextMessage({
                            recipientId: senderId,
                            message: aiResponse,
                            pageAccessToken: accessToken,
                        });
                    }
                }

                // Handle image attachments
                else if (event.message?.attachments) {
                    for (const attachment of event.message.attachments) {
                        if (attachment.type === 'image' && attachment.payload?.url) {
                            const imageUrl = attachment.payload.url;
                            logger.info(`[${shop.name}] Received image from ${platform}`, { imageUrl });

                            // Get or create customer for image processing
                            const customer = platform === 'instagram'
                                ? await getOrCreateInstagramCustomer(shop.id, senderId, accessToken)
                                : await getOrCreateCustomer(shop.id, senderId, accessToken);

                            // Send typing indicator
                            await sendSenderAction(senderId, 'typing_on', accessToken);

                            try {
                                // Get subscription plan for image analysis
                                const planType = getPlanTypeFromSubscription({
                                    plan: shop.subscription_plan || 'starter',
                                    status: shop.subscription_status || 'active',
                                    trial_ends_at: shop.trial_ends_at || undefined,
                                });

                                // Analyze the image with shop products for matching
                                const productsForAnalysis = shop.properties?.map(p => ({
                                    id: p.id,
                                    name: p.name,
                                    description: p.description || undefined,
                                }));
                                const imageAnalysis = await analyzeProductImageWithPlan(imageUrl, productsForAnalysis || [], planType);

                                if (imageAnalysis.matchedProduct || imageAnalysis.description) {
                                    // Try to match with shop products
                                    const description = imageAnalysis.description || '';
                                    const matchedProducts = shop.properties?.filter(p =>
                                        description.toLowerCase().includes(p.name.toLowerCase())
                                    );

                                    let responseMessage: string;
                                    if ((matchedProducts || []).length > 0) {
                                        const product = (matchedProducts || [])[0];
                                        responseMessage = `Зурагнаас "${product.name}" байрыг таньлаа! 🎯\n\n` +
                                            `💰 Үнэ: ${product.price?.toLocaleString()}₮\n\n` +
                                            `Үзэх уу? 📋`;
                                    } else {
                                        responseMessage = `Зурагт: ${description}\n\n` +
                                            `Энэ байр манай жагсаалтад одоохондоо байхгүй байна. ` +
                                            `Өөр байр хайж байна уу? 🔍`;
                                    }

                                    await sendTextMessage({
                                        recipientId: senderId,
                                        message: responseMessage,
                                        pageAccessToken: accessToken,
                                    });

                                    // Save to chat history
                                    await saveChatHistory(shop.id, customer.id, '[Зураг илгээсэн]', responseMessage, 'IMAGE_ANALYSIS');
                                } else {
                                    await sendTextMessage({
                                        recipientId: senderId,
                                        message: 'Зургийг таньж чадсангүй. Бүтээгдэхүүний нэрийг бичиж өгнө үү! 📝',
                                        pageAccessToken: accessToken,
                                    });
                                }
                            } catch (imageError) {
                                logger.error('Image analysis error:', { error: imageError });
                                await sendTextMessage({
                                    recipientId: senderId,
                                    message: 'Зургийг таньж чадсангүй. Бүтээгдэхүүний нэрийг бичиж өгнө үү! 📝',
                                    pageAccessToken: accessToken,
                                });
                            }
                        }
                    }
                }

                // Handle postback (button clicks)
                if (event.postback?.payload) {
                    const payload = event.postback.payload;

                    if (payload.startsWith('ORDER_')) {
                        const productName = payload.replace('ORDER_', '');
                        await sendTextMessage({
                            recipientId: senderId,
                            message: `"${productName}" захиалахыг хүсч байна уу? Хэдэн ширхэг авах вэ? 🛒`,
                            pageAccessToken: accessToken,
                        });
                    }
                }
            }
        }

        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        logger.error('Webhook error:', { error });
        return NextResponse.json({
            error: 'Internal server error',
        }, { status: 500 });
    }
}
