import crypto from 'crypto';

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

// Meta recommends signing every Graph API call with appsecret_proof when the
// "Require App Secret Proof for Server API calls" toggle is on. Returns null
// when FACEBOOK_APP_SECRET is not configured, in which case the param is
// omitted (Meta accepts the call so long as the toggle is off).
export function appsecretProof(token: string): string | null {
    const secret = process.env.FACEBOOK_APP_SECRET;
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function buildSendUrl(pageAccessToken: string): string {
    const proof = appsecretProof(pageAccessToken);
    const base = `${GRAPH_API_URL}/me/messages?access_token=${pageAccessToken}`;
    return proof ? `${base}&appsecret_proof=${proof}` : base;
}

interface SendMessageOptions {
    recipientId: string;
    message: string;
    pageAccessToken: string;
}

interface QuickReply {
    content_type: 'text';
    title: string;
    payload: string;
}

// ... existing code ...
interface SendMessageWithQuickRepliesOptions extends SendMessageOptions {
    quickReplies: QuickReply[];
}

export async function sendSenderAction(
    recipientId: string,
    action: 'mark_seen' | 'typing_on' | 'typing_off',
    pageAccessToken: string
) {
    try {
        const response = await fetch(buildSendUrl(pageAccessToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                sender_action: action,
            }),
        });

        if (!response.ok) {
            console.warn(`⚠️ Sender action '${action}' failed but continuing...`);
        }
    } catch (error) {
        console.warn(`⚠️ Sender action '${action}' network error:`, error);
    }
}

export async function sendTextMessage({ recipientId, message, pageAccessToken }: SendMessageOptions) {
    const response = await fetch(buildSendUrl(pageAccessToken), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: { text: message },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Facebook API error:', error);
        throw new Error(`Failed to send message: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
}

export async function sendMessageWithQuickReplies({
    recipientId,
    message,
    quickReplies,
    pageAccessToken,
}: SendMessageWithQuickRepliesOptions) {
    const response = await fetch(buildSendUrl(pageAccessToken), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                text: message,
                quick_replies: quickReplies,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Facebook API error:', error);
        throw new Error(`Failed to send message: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
}

export async function sendProductCard({
    recipientId,
    product,
    pageAccessToken,
}: {
    recipientId: string;
    product: { name: string; description: string; price: number; imageUrl?: string };
    pageAccessToken: string;
}) {
    const response = await fetch(buildSendUrl(pageAccessToken), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: [
                            {
                                title: product.name,
                                subtitle: `${product.price.toLocaleString()}₮\n${product.description || ''}`,
                                image_url: product.imageUrl || undefined,
                                buttons: [
                                    {
                                        type: 'postback',
                                        title: 'Захиалах 🛒',
                                        payload: `ORDER_${product.name}`,
                                    },
                                    {
                                        type: 'postback',
                                        title: 'Дэлгэрэнгүй',
                                        payload: `DETAILS_${product.name}`,
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Facebook API error:', error);
        throw new Error(`Failed to send product card: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
}

// Send a single image
export async function sendImage({
    recipientId,
    imageUrl,
    pageAccessToken,
}: {
    recipientId: string;
    imageUrl: string;
    pageAccessToken: string;
}) {
    const response = await fetch(buildSendUrl(pageAccessToken), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachment: {
                    type: 'image',
                    payload: {
                        url: imageUrl,
                        is_reusable: true,
                    },
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Facebook API error:', error);
        throw new Error(`Failed to send image: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
}

// Send multiple products as carousel gallery (max 10)
export async function sendImageGallery({
    recipientId,
    products,
    pageAccessToken,
    confirmMode = false,
}: {
    recipientId: string;
    products: Array<{
        name: string;
        price: number;
        imageUrl: string;
        description?: string;
    }>;
    pageAccessToken: string;
    confirmMode?: boolean; // If true, shows "Энэ үү?" selection mode
}) {
    // Facebook allows max 10 elements in carousel
    const limitedProducts = products.slice(0, 10);

    const elements = limitedProducts.map((product) => ({
        title: product.name,
        subtitle: `${product.price.toLocaleString()}₮${product.description ? `\n${product.description}` : ''}`,
        image_url: product.imageUrl,
        buttons: confirmMode
            ? [
                {
                    type: 'postback',
                    title: 'Энэ нь! ✅',
                    payload: `SELECT_${product.name}`,
                },
            ]
            : [
                {
                    type: 'postback',
                    title: 'Захиалах 🛒',
                    payload: `ORDER_${product.name}`,
                },
                {
                    type: 'postback',
                    title: 'Дэлгэрэнгүй',
                    payload: `DETAILS_${product.name}`,
                },
            ],
    }));

    const response = await fetch(buildSendUrl(pageAccessToken), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            recipient: { id: recipientId },
            messaging_type: 'RESPONSE',
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements,
                    },
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Facebook API error:', error);
        throw new Error(`Failed to send image gallery: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
}

export function verifyWebhook(
    mode: string | null,
    token: string | null,
    challenge: string | null,
    verifyToken: string
): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
        return challenge;
    }
    return null;
}
