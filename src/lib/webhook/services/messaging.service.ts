import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendImage, sendImageGallery } from '@/lib/facebook/messenger';
import { generateCommentReply } from '@/lib/ai/comment-detector';
import type { AIProduct } from '@/types/ai';
import { IntentResult } from '@/lib/ai/intent-detector';

export function generateFallbackResponse(
    intent: IntentResult,
    shopName: string,
    products: AIProduct[]
): string {
    const productList = products.slice(0, 3)
        .map(p => `${p.name} (${Number(p.price).toLocaleString()}₮)`)
        .join(', ');

    switch (intent.intent) {
        case 'GREETING':
            return `Сайн байна уу! 😊 ${shopName}-д тавтай морил! Танд яаж туслах вэ?`;
        case 'PRODUCT_INQUIRY':
        case 'STOCK_CHECK':
            return productList
                ? `Манайд ${productList} зэрэг бүтээгдэхүүн байна! 😊 Аль нь сонирхож байна вэ?`
                : 'Бүтээгдэхүүний мэдээлэл удахгүй орно!';
        case 'PRICE_CHECK':
            return 'Ямар бүтээгдэхүүний үнийг мэдэхийг хүсч байна вэ? 💰';
        case 'ORDER_CREATE':
            return 'Захиалга өгөхийг хүсвэл бүтээгдэхүүний нэр, тоо ширхэг, утасны дугаар, хаягаа бичнэ үү! 📦';
        case 'ORDER_STATUS':
            return 'Захиалгын дугаараа хэлнэ үү, би шалгаад хэлье! 🔍';
        case 'THANK_YOU':
            return 'Баярлалаа! Дахиад ирээрэй 😊';
        case 'COMPLAINT':
            return 'Уучлаарай, танд тохиромжгүй байдал үүссэнд харамсаж байна. Асуудлаа дэлгэрэнгүй хэлнэ үү, бид шийдвэрлэхийг хичээнэ! 🙏';
        default:
            return 'Уучлаарай, одоо системд түр алдаа гарлаа. Удахгүй хариулах болно! 🙏';
    }
}

export async function processAIResponse(
    response: { text: string; imageAction?: { type: 'single' | 'confirm'; products: Array<{ name: string; price: number; imageUrl: string; description?: string }> } },
    senderId: string,
    pageAccessToken: string
): Promise<void> {
    const { imageAction } = response;

    if (imageAction && imageAction.products.length > 0) {
        try {
            if (imageAction.products.length === 1 && imageAction.type === 'single') {
                await sendImage({
                    recipientId: senderId,
                    imageUrl: imageAction.products[0].imageUrl,
                    pageAccessToken,
                });
            } else {
                await sendImageGallery({
                    recipientId: senderId,
                    products: imageAction.products,
                    pageAccessToken,
                    confirmMode: imageAction.type === 'confirm',
                });
            }
            logger.success(`Sent ${imageAction.products.length} product image(s) in ${imageAction.type} mode`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to send product images:', { message: errorMessage });
        }
    }
}

export async function replyToComment(
    shopId: string,
    shopName: string,
    pageUsername: string | null | undefined,
    commentId: string,
    commentMessage: string,
    pageAccessToken: string
): Promise<boolean> {
    const supabase = supabaseAdmin();
    const replyMessage = generateCommentReply(shopName, pageUsername || undefined);

    try {
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${commentId}/comments`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: replyMessage,
                    access_token: pageAccessToken,
                }),
            }
        );

        if (response.ok) {
            logger.success(`[${shopName}] Comment reply sent successfully!`);

            await supabase.from('chat_history').insert({
                shop_id: shopId,
                message: `[FB Comment] ${commentMessage}`,
                response: replyMessage,
                intent: 'COMMENT_REPLY'
            });
            return true;
        } else {
            const errorData = await response.json();
            logger.error(`[${shopName}] Failed to reply to comment`, { error: errorData });
            return false;
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[${shopName}] Error replying to comment`, { error: errorMessage });
        return false;
    }
}
