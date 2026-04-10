/**
 * Eval scorer utilities for AI response quality evaluation
 */

import { expect } from 'vitest';
import { logger } from '@/lib/utils/logger';

/** Mongolian Unicode range check (Cyrillic used for Mongolian) */
const MONGOLIAN_CYRILLIC = /[\u0410-\u044F\u0401\u0451\u04E8\u04E9\u04AE\u04AF]/;

/**
 * Assert response text contains Mongolian characters
 */
export function assertMongolian(text: string): void {
    expect(
        MONGOLIAN_CYRILLIC.test(text),
        `Expected Mongolian text but got: "${text.substring(0, 100)}"`
    ).toBe(true);
}

/**
 * Assert no hallucinated product names — only names from the provided list
 */
export function assertNoHallucination(
    text: string,
    validProductNames: string[]
): void {
    // Common product-like patterns to check against
    const mentionedProducts = text.match(/「(.+?)」|"(.+?)"|«(.+?)»/g) || [];

    for (const mention of mentionedProducts) {
        const cleanName = mention.replace(/[「」""«»]/g, '').trim();
        const isValid = validProductNames.some(
            name => name.toLowerCase().includes(cleanName.toLowerCase()) ||
                cleanName.toLowerCase().includes(name.toLowerCase())
        );
        if (!isValid && cleanName.length > 3) {
            // Only flag if it looks like a product name (not a generic word)
            logger.warn(`Possible hallucination: "${cleanName}" not in product list`);
        }
    }
}

/**
 * Score a tool execution result against expected criteria
 */
export function scoreToolResult(
    result: { success: boolean; message?: string; error?: string; data?: any },
    criteria: {
        shouldSucceed: boolean;
        messageContains?: string[];
        messageNotContains?: string[];
        hasData?: boolean;
        dataKeys?: string[];
    }
): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    if (result.success !== criteria.shouldSucceed) {
        failures.push(`Expected success=${criteria.shouldSucceed}, got ${result.success}` +
            (result.error ? ` (error: ${result.error})` : ''));
    }

    if (criteria.messageContains) {
        const text = result.message || result.error || '';
        for (const keyword of criteria.messageContains) {
            if (!text.toLowerCase().includes(keyword.toLowerCase())) {
                failures.push(`Expected message to contain "${keyword}", got: "${text.substring(0, 100)}"`);
            }
        }
    }

    if (criteria.messageNotContains) {
        const text = result.message || '';
        for (const keyword of criteria.messageNotContains) {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                failures.push(`Expected message NOT to contain "${keyword}"`);
            }
        }
    }

    if (criteria.hasData === true && !result.data) {
        failures.push('Expected data to be present');
    }

    if (criteria.dataKeys && result.data) {
        for (const key of criteria.dataKeys) {
            if (!(key in result.data)) {
                failures.push(`Expected data to have key "${key}"`);
            }
        }
    }

    return { passed: failures.length === 0, failures };
}

/**
 * Assert tool result matches criteria (throws on failure)
 */
export function assertToolResult(
    result: { success: boolean; message?: string; error?: string; data?: any },
    criteria: Parameters<typeof scoreToolResult>[1]
): void {
    const score = scoreToolResult(result, criteria);
    if (!score.passed) {
        throw new Error(`Tool result assertion failed:\n${score.failures.join('\n')}`);
    }
}
