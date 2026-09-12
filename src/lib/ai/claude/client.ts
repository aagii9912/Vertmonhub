/**
 * Claude (Anthropic) provider — dashboard AI туслахын цорын ганц модель давхарга.
 *
 * - `MAIN_MODEL`  — үндсэн туслах (agentic loop, streaming). Анхдагч: claude-opus-5.
 * - `FAST_MODEL`  — дэд агент, ярианы хураангуй зэрэг хямд/хурдан ажил. Анхдагч: claude-sonnet-5.
 * Хоёулаа env-ээр солигдоно (AI_MODEL / AI_FAST_MODEL).
 *
 * Алдааг SDK-ийн typed class-аар ялгаж, хэрэглэгчид ойлгомжтой монгол мессеж болгоно
 * (`describeClaudeError`). Regex string-matching ХИЙХГҮЙ.
 */

import Anthropic from '@anthropic-ai/sdk';

export const MAIN_MODEL = process.env.AI_MODEL || 'claude-opus-5';
export const FAST_MODEL = process.env.AI_FAST_MODEL || 'claude-sonnet-5';

let _client: Anthropic | null = null;

/** Lazy singleton — модуль ачаалахад түлхүүр шаардахгүй (тест/билд аюулгүй). */
export function claude(): Anthropic {
    if (!_client) {
        _client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
            maxRetries: 2,
            timeout: 55_000, // Vercel maxDuration=60 дотор багтана
        });
    }
    return _client;
}

export function hasClaudeKey(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
}

export interface ClaudeErrorInfo {
    /** Хэрэглэгчид харуулах монгол мессеж */
    message: string;
    /** Дахин оролдох утгатай эсэх */
    retryable: boolean;
    /** Лог/trace-д зориулсан богино код */
    code: 'auth' | 'rate_limit' | 'overloaded' | 'bad_request' | 'timeout' | 'network' | 'server' | 'unknown';
}

/** Anthropic SDK алдааг хэрэглэгчид ойлгомжтой мессеж болгоно. */
export function describeClaudeError(error: unknown): ClaudeErrorInfo {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return { code: 'auth', retryable: false, message: 'AI үйлчилгээний түлхүүр буруу эсвэл эрхгүй байна. Админ ANTHROPIC_API_KEY-г шалгана уу.' };
    }
    if (error instanceof Anthropic.RateLimitError) {
        return { code: 'rate_limit', retryable: true, message: 'AI систем түр ачаалалтай байна — 30 секундын дараа дахин оролдоно уу.' };
    }
    if (error instanceof Anthropic.InternalServerError) {
        return { code: 'overloaded', retryable: true, message: 'AI үйлчилгээ түр хариу өгөхгүй байна. Түр хүлээгээд дахин оролдоно уу.' };
    }
    if (error instanceof Anthropic.BadRequestError) {
        return { code: 'bad_request', retryable: false, message: `Хүсэлт буруу байна: ${error.message}` };
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
        return { code: 'timeout', retryable: true, message: 'AI хариу хугацаандаа амжсангүй — асуултаа арай тодорхой болгоод дахин оролдоно уу.' };
    }
    if (error instanceof Anthropic.APIConnectionError) {
        return { code: 'network', retryable: true, message: 'AI үйлчилгээтэй холбогдож чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.' };
    }
    if (error instanceof Anthropic.APIError) {
        return { code: 'server', retryable: (error.status ?? 500) >= 500, message: `AI үйлчилгээний алдаа (${error.status}): ${error.message}` };
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { code: 'unknown', retryable: true, message: msg || 'AI туслахад тодорхойгүй алдаа гарлаа.' };
}
