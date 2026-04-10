/**
 * Gemini Provider Implementation
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import type { ChatContext, ChatMessage, ChatResponse, AIProduct } from '@/types/ai';
import type { AIProviderInterface, VisionResult, ChatOptions } from './AIProvider';
import { buildSystemPrompt } from '../services/PromptService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Retry with exponential backoff
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await operation();
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '';
        if (retries > 0 && (errorMessage.includes('503') || errorMessage.includes('overloaded'))) {
            logger.warn(`Gemini overloaded, retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
}

/**
 * Gemini AI Provider
 */
export class GeminiProvider implements AIProviderInterface {
    readonly name = 'gemini';
    readonly model: string;

    constructor(model: string = 'gemini-3.1-flash-lite-preview') {
        this.model = model;
    }

    isAvailable(): boolean {
        return !!process.env.GEMINI_API_KEY;
    }

    async generateChatResponse(
        message: string,
        context: ChatContext,
        history: ChatMessage[],
        options?: ChatOptions
    ): Promise<ChatResponse> {
        const systemPrompt = buildSystemPrompt(context);

        // Convert ChatMessage to Gemini Content format
        const geminiHistory: Content[] = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        logger.info(`Gemini Provider: Sending to ${this.model}...`);

        return await retryOperation(async () => {
            const chatModel = genAI.getGenerativeModel({
                model: this.model,
                systemInstruction: systemPrompt,
                generationConfig: {
                    temperature: options?.temperature || 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: options?.maxTokens || 1024,
                },
            });

            const chat = chatModel.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(message);
            const responseText = result.response.text();

            logger.success('Gemini response received', { length: responseText.length });

            return { text: responseText };
        });
    }

    async analyzeImage(
        imageUrl: string,
        products: AIProduct[]
    ): Promise<VisionResult> {
        try {
            logger.info('Gemini Vision: Analyzing image...', { imageUrl: imageUrl.substring(0, 80) });

            const visionModel = genAI.getGenerativeModel({ model: this.model });

            // Fetch and convert image
            const imageResponse = await fetch(imageUrl);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');
            const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

            const productList = products.map(p => `- ${p.name}: ${p.description || ''}`).join('\n');

            const prompt = `Та бол дэлгүүрийн туслах юм. Энэ зургийг судалж, доорх бүтээгдэхүүнүүдийн алинтай нь тохирч байгааг хэлнэ үү.

Боломжит бүтээгдэхүүнүүд:
${productList}

Зөвхөн JSON форматаар хариулна уу:
{
  "matchedProduct": "Тохирсон бүтээгдэхүүний нэр (яг ижил нэрээр), эсвэл null",
  "confidence": 0.0-1.0 хооронд тоо,
  "description": "Зураг дээр юу харагдаж байгааг товч монголоор тайлбарла"
}`;

            const result = await visionModel.generateContent([
                { text: prompt },
                { inlineData: { mimeType, data: base64Image } }
            ]);

            const responseText = result.response.text();
            logger.success('Gemini Vision response received');

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                logger.success('Gemini Vision analysis complete', { matched: parsed.matchedProduct });
                return parsed;
            }

            return { matchedProduct: null, confidence: 0, description: 'Зургийг таньж чадсангүй.' };
        } catch (error: unknown) {
            const err = error as Error;
            logger.error('Gemini Vision Error:', { message: err.message });
            return { matchedProduct: null, confidence: 0, description: 'Зураг боловсруулахад алдаа гарлаа.' };
        }
    }
}
