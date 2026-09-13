import { afterEach, expect, it, vi } from 'vitest';
import { describeOpenAIError, hasOpenAIKey, openai } from '../client';

afterEach(() => vi.unstubAllEnvs());
it('requires an OpenAI key and never falls back to an Anthropic key', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'existing-other-provider-key');
    expect(hasOpenAIKey()).toBe(false);
    expect(openai).toThrow('OPENAI_API_KEY_MISSING');
    expect(describeOpenAIError(new Error('OPENAI_API_KEY_MISSING'))).toMatchObject({ code: 'auth', retryable: false });
});
