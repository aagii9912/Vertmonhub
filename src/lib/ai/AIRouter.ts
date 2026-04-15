/**
 * AIRouter - Routes AI requests to Gemini models
 * 
 * Strategy:
 * - All plans use Gemini models
 * - Plan determines capabilities (tool calling, vision, etc.)
 */

import { GoogleGenerativeAI, Content, SchemaType, Part } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import type { ChatContext, ChatMessage, ChatResponse, ImageAction } from '@/types/ai';
import { buildSystemPrompt } from './services/PromptService';
import { executeTool, ToolExecutionContext, ToolExecutionResult } from './services/ToolExecutor';
import { GEMINI_TOOLS, ToolName } from './tools/definitions';
import {
    PlanType,
    getPlanConfig,
    getPlanTypeFromSubscription,
    isToolEnabledForPlan,
    getEnabledToolsForPlan,
    checkMessageLimit,
    AIModel,
} from './config/plans';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Model mapping - Gemini models per plan tier
 */
const MODEL_MAPPING: Record<AIModel, string> = {
    'gemini-3-pro': 'gemini-2.5-flash',
};

/**
 * Extended ChatContext with plan information
 */
export interface RouterChatContext extends ChatContext {
    subscription?: {
        plan?: string;
        status?: string;
        trial_ends_at?: string;
    };
    messageCount?: number;
}

/**
 * Router response with usage info
 */
export interface RouterResponse extends ChatResponse {
    usage?: {
        plan: PlanType;
        model: string;
        messagesUsed: number;
        messagesRemaining: number;
        tokensUsed?: number;
    };
    limitReached?: boolean;
}

/**
 * Retry operation with exponential backoff
 */
async function retryOperation<T>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 1000
): Promise<T> {
    try {
        return await operation();
    } catch (error: unknown) {
        const err = error as { status?: number };
        if (retries > 0 && (err.status === 429 || err.status === 503)) {
            logger.warn(`API rate limited, retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
}

/**
 * Filter tools based on plan
 */
function getToolsForPlan(plan: PlanType): any[] {
    const enabledTools = getEnabledToolsForPlan(plan);
    return GEMINI_TOOLS.filter((tool: any) => {
        return enabledTools.includes(tool.name as ToolName);
    });
}

/**
 * Main AI Router - generates response based on plan configuration
 */
export async function routeToAI(
    message: string,
    context: RouterChatContext,
    previousHistory: ChatMessage[] = []
): Promise<RouterResponse> {
    // Determine plan type
    const planType = getPlanTypeFromSubscription(context.subscription);
    const planConfig = getPlanConfig(planType);

    // Check message limit
    const messageCount = context.messageCount || 0;
    const limitCheck = checkMessageLimit(planType, messageCount);

    if (!limitCheck.allowed) {
        logger.warn('Message limit reached', {
            plan: planType,
            count: messageCount,
            limit: limitCheck.limit
        });

        return {
            text: `Уучлаарай, та энэ сарын мессежийн лимитдээ хүрсэн байна (${limitCheck.limit} мессеж). Илүү олон мессеж авахын тулд план-аа шинэчлэнэ үү! 📈`,
            limitReached: true,
            usage: {
                plan: planType,
                model: planConfig.model,
                messagesUsed: messageCount,
                messagesRemaining: 0,
            },
        };
    }

    let imageAction: ImageAction | undefined;
    let quickReplies: Array<{ title: string; payload: string }> | undefined;

    try {
        const modelName = planConfig.model;
        const backendModel = MODEL_MAPPING[modelName];

        logger.info(`AIRouter: Routing to Gemini [${backendModel}] (Plan: ${planType})`);

        // Build system prompt
        const systemPrompt = buildSystemPrompt({
            ...context,
            planFeatures: {
                ai_model: modelName,
                sales_intelligence: planConfig.features.salesIntelligence,
                ai_memory: planConfig.features.memory,
                max_tokens: planConfig.maxTokens,
            },
        });

        // Get tools enabled for this plan
        const planTools = planConfig.features.toolCalling
            ? getToolsForPlan(planType)
            : undefined;

        // Configure Gemini model
        const model = genAI.getGenerativeModel({
            model: backendModel,
            systemInstruction: systemPrompt,
            tools: planTools && planTools.length > 0 ? [{ functionDeclarations: planTools }] : undefined,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: planConfig.maxTokens,
            },
        });

        // Convert history to Gemini format
        const geminiHistory: Content[] = previousHistory
            .filter(m => m.role && m.content && m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }] as Part[],
            }));

        return await retryOperation(async () => {
            logger.info(`Sending to Gemini ${backendModel}...`);

            const chat = model.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(message);
            const response = result.response;

            // Check for function calls
            const functionCalls = response.functionCalls();
            let finalResponseText = response.text() || '';

            if (functionCalls && functionCalls.length > 0 && planConfig.features.toolCalling) {
                logger.info('AI triggered function calls:', { count: functionCalls.length });

                const toolResults = [];

                // Create tool execution context
                const toolContext: ToolExecutionContext = {
                    shopId: context.shopId,
                    customerId: context.customerId,
                    customerName: context.customerName,
                    properties: context.properties,
                    notifySettings: context.notifySettings,
                };

                for (const fc of functionCalls) {
                    const functionName = fc.name as ToolName;

                    // Check if tool is enabled for this plan
                    if (!isToolEnabledForPlan(functionName, planType)) {
                        logger.warn(`Tool ${functionName} not enabled for ${planType} plan`);
                        toolResults.push({
                            functionResponse: {
                                name: fc.name,
                                response: { error: 'This feature is not available on your current plan.' },
                            },
                        });
                        continue;
                    }

                    const args = fc.args || {};
                    logger.info(`Executing tool: ${functionName}`, args as Record<string, unknown>);

                    const toolResult: ToolExecutionResult = await executeTool(
                        functionName,
                        args,
                        toolContext
                    );

                    if (toolResult.imageAction) {
                        imageAction = toolResult.imageAction;
                    }

                    if (toolResult.quickReplies && toolResult.quickReplies.length > 0) {
                        quickReplies = toolResult.quickReplies;
                    }

                    toolResults.push({
                        functionResponse: {
                            name: fc.name,
                            response: toolResult.success
                                ? { success: true, message: toolResult.message, ...toolResult.data }
                                : { error: toolResult.error },
                        },
                    });
                }

                // Send tool results back to Gemini
                const synthesisResult = await chat.sendMessage(
                    toolResults.map(tr => ({ functionResponse: tr.functionResponse }))
                );
                finalResponseText = synthesisResult.response.text() || '';
            }

            logger.success(`AIRouter response received (${planType}/Gemini)`);

            return {
                text: finalResponseText,
                imageAction,
                quickReplies,
                usage: {
                    plan: planType,
                    model: planConfig.model,
                    messagesUsed: messageCount + 1,
                    messagesRemaining: limitCheck.remaining - 1,
                },
            };
        });

    } catch (error: unknown) {
        const err = error as { message?: string; stack?: string; name?: string; status?: number };
        logger.error('AIRouter Error:', {
            message: err.message,
            stack: err.stack,
            name: err.name,
            status: err.status,
            plan: planType,
            model: planConfig.model,
        });
        throw error;
    }
}

/**
 * Analyze product image using Gemini vision (plan-dependent)
 */
export async function analyzeProductImageWithPlan(
    imageUrl: string,
    products: Array<{ id: string; name: string; description?: string }>,
    planType: PlanType = 'ultimate'
): Promise<{
    matchedProduct: string | null;
    confidence: number;
    description: string;
    isReceipt?: boolean;
    receiptAmount?: number;
}> {
    const planConfig = getPlanConfig(planType);

    if (!planConfig.features.vision) {
        return {
            matchedProduct: null,
            confidence: 0,
            description: 'Image analysis is not available on your current plan.',
        };
    }

    try {
        const backendModel = MODEL_MAPPING[planConfig.model];
        const productList = products.map(p => `- ${p.name}: ${p.description || ''}`).join('\n');

        const prompt = `Та бол дэлгүүрийн ухаалаг туслах юм. Энэ зургийг шинжилж, хоёр зүйлийн аль нэг гэж ангилна уу:
1. "product_inquiry": Хэрэглэгч барааны зураг явуулж, байгаа эсэхийг асууж байна.
2. "payment_receipt": Хэрэглэгч төлбөрийн баримт явуулж байна.

Боломжит бүтээгдэхүүнүүд:
${productList}

Зөвхөн JSON форматаар хариулна уу:
{
  "type": "product_inquiry" эсвэл "payment_receipt",
  "matchedProduct": "Тохирсон бүтээгдэхүүний нэр эсвэл null",
  "confidence": 0.0-1.0,
  "description": "Товч тайлбар",
  "receiptAmount": 0
}`;

        const model = genAI.getGenerativeModel({
            model: backendModel,
            generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
            },
        });

        // Fetch image and convert to base64 for Gemini
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

        const result = await model.generateContent([
            { text: prompt },
            { inlineData: { data: base64Image, mimeType } },
        ]);

        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);

        return {
            matchedProduct: parsed.matchedProduct,
            confidence: parsed.confidence,
            description: parsed.description,
            isReceipt: parsed.type === 'payment_receipt',
            receiptAmount: parsed.receiptAmount,
        };
    } catch (error) {
        logger.error('Vision Error:', { error });
        return { matchedProduct: null, confidence: 0, description: 'Зураг боловсруулахад алдаа гарлаа.' };
    }
}

// Re-export types
export type { PlanType, AIModel } from './config/plans';
export {
    getPlanConfig,
    getPlanTypeFromSubscription,
    checkMessageLimit,
    getEnabledToolsForPlan,
    PLAN_CONFIGS
} from './config/plans';
