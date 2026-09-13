import OpenAI from 'openai';

// Provider-specific env names prevent old Claude overrides reaching OpenAI.
export const MAIN_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
export const FAST_MODEL = process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna';

let client: OpenAI | undefined;
export function openai(): OpenAI {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY_MISSING');
    return client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45_000 });
}

export function hasOpenAIKey(): boolean { return !!process.env.OPENAI_API_KEY?.trim(); }

export function describeOpenAIError(error: unknown): { code: string; retryable: boolean; message: string } {
    if ((error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING') || error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
        return { code: 'auth', retryable: false, message: 'GPT үйлчилгээний түлхүүр тохируулаагүй эсвэл эрхгүй байна. Админ OPENAI_API_KEY-г шалгана уу.' };
    }
    if (error instanceof OpenAI.RateLimitError) return { code: 'rate_limit', retryable: true, message: 'GPT үйлчилгээний хэрэглээний хязгаарт хүрлээ. Админ API хэрэглээг шалгана уу.' };
    if (error instanceof OpenAI.APIUserAbortError || ((error instanceof Error || error instanceof DOMException) && ['AbortError', 'TimeoutError'].includes(error.name))) {
        return { code: 'timeout', retryable: false, message: 'AI ажиллагаа зогссон эсвэл хугацаа дууссан. Дахин ажиллуулахаас өмнө гүйцэтгэсэн үйлдлүүдийг шалгана уу.' };
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) return { code: 'timeout', retryable: true, message: 'GPT хугацаандаа хариулсангүй. Түр хүлээгээд дахин оролдоно уу.' };
    if (error instanceof OpenAI.APIConnectionError) return { code: 'network', retryable: true, message: 'GPT үйлчилгээтэй холбогдож чадсангүй.' };
    if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.NotFoundError) {
        return { code: 'configuration', retryable: false, message: 'GPT модель эсвэл хүсэлтийн тохиргоо дэмжигдэхгүй байна. Админ OPENAI_MODEL / OPENAI_FAST_MODEL тохиргоог шалгана уу.' };
    }
    return { code: 'server', retryable: false, message: 'AI ажиллагаа бүрэн дууссангүй. Гүйцэтгэсэн алхмуудыг шалгаад үргэлжлүүлнэ үү.' };
}
