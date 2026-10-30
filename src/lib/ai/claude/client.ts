import Anthropic from '@anthropic-ai/sdk';

// Provider-specific env names keep old OpenAI overrides from reaching Anthropic.
export const MAIN_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
export const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-5-5';

let client: Anthropic | undefined;
export function claude(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY_MISSING');
    return client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 45_000 });
}

export function hasClaudeKey(): boolean { return !!process.env.ANTHROPIC_API_KEY?.trim(); }

/** The model declined (stop_reason `refusal`) or stopped mid tool call; nothing from that round is executed. */
export class ClaudeStopError extends Error {
    constructor(readonly stopReason: string) { super(`Claude stopped: ${stopReason}`); this.name = 'ClaudeStopError'; }
}

export function describeClaudeError(error: unknown): { code: string; retryable: boolean; message: string } {
    if ((error instanceof Error && error.message === 'ANTHROPIC_API_KEY_MISSING') || error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return { code: 'auth', retryable: false, message: 'Claude үйлчилгээний түлхүүр тохируулаагүй эсвэл эрхгүй байна. Админ ANTHROPIC_API_KEY-г шалгана уу.' };
    }
    if (error instanceof ClaudeStopError) {
        return error.stopReason === 'refusal'
            ? { code: 'refusal', retryable: false, message: 'AI энэ хүсэлтэд хариулахаас татгалзлаа. Асуултаа өөрөөр томъёолж дахин оролдоно уу.' }
            : { code: 'truncated', retryable: false, message: 'AI-ийн хариу хэт урт болж тасарлаа. Асуултаа хэсэгчилж дахин илгээнэ үү.' };
    }
    if (error instanceof Anthropic.RateLimitError) return { code: 'rate_limit', retryable: true, message: 'Claude үйлчилгээний хэрэглээний хязгаарт хүрлээ. Админ API хэрэглээг шалгана уу.' };
    if (error instanceof Anthropic.APIUserAbortError || ((error instanceof Error || error instanceof DOMException) && ['AbortError', 'TimeoutError'].includes(error.name))) {
        return { code: 'timeout', retryable: false, message: 'AI ажиллагаа зогссон эсвэл хугацаа дууссан. Дахин ажиллуулахаас өмнө гүйцэтгэсэн үйлдлүүдийг шалгана уу.' };
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) return { code: 'timeout', retryable: true, message: 'Claude хугацаандаа хариулсангүй. Түр хүлээгээд дахин оролдоно уу.' };
    if (error instanceof Anthropic.APIConnectionError) return { code: 'network', retryable: true, message: 'Claude үйлчилгээтэй холбогдож чадсангүй.' };
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
        return { code: 'configuration', retryable: false, message: 'Claude модель эсвэл хүсэлтийн тохиргоо дэмжигдэхгүй байна. Админ ANTHROPIC_MODEL / ANTHROPIC_FAST_MODEL тохиргоог шалгана уу.' };
    }
    if (error instanceof Anthropic.InternalServerError) return { code: 'overloaded', retryable: true, message: 'Claude үйлчилгээ түр ачаалалтай байна. Түр хүлээгээд дахин оролдоно уу.' };
    return { code: 'server', retryable: false, message: 'AI ажиллагаа бүрэн дууссангүй. Гүйцэтгэсэн алхмуудыг шалгаад үргэлжлүүлнэ үү.' };
}
