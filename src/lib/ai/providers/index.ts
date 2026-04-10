/**
 * AI Provider Factory - Gemini only
 */

import type { AIProviderInterface } from './AIProvider';
import { GeminiProvider } from './GeminiProvider';
import type { AIModel } from '../config/plans';
import { logger } from '@/lib/utils/logger';

// Singleton instance
let geminiProvider: GeminiProvider | null = null;

/**
 * Get Gemini provider instance
 */
export function getProvider(
    _providerType?: string,
    model?: AIModel
): AIProviderInterface {
    if (!process.env.GEMINI_API_KEY) {
        logger.error('GEMINI_API_KEY not configured');
        throw new Error('GEMINI_API_KEY is required');
    }

    const modelName = model || 'gemini-3.1-flash-lite-preview';

    if (!geminiProvider || geminiProvider.model !== modelName) {
        geminiProvider = new GeminiProvider(modelName);
    }
    return geminiProvider;
}

/**
 * Get the best available provider (always Gemini)
 */
export function getBestAvailableProvider(
    _preferred?: string,
    model?: AIModel
): AIProviderInterface {
    return getProvider('gemini', model);
}

// Re-exports
export type { AIProviderInterface, VisionResult, ChatOptions } from './AIProvider';
export { GeminiProvider } from './GeminiProvider';
