import { afterEach, expect, it, vi } from 'vitest';
import { claude, ClaudeStopError, describeClaudeError, hasClaudeKey } from '../client';

afterEach(() => vi.unstubAllEnvs());
it('requires an Anthropic key and never falls back to an OpenAI key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'existing-other-provider-key');
    expect(hasClaudeKey()).toBe(false);
    expect(claude).toThrow('ANTHROPIC_API_KEY_MISSING');
    expect(describeClaudeError(new Error('ANTHROPIC_API_KEY_MISSING'))).toMatchObject({ code: 'auth', retryable: false });
});

it('explains refusals and truncated tool calls in Mongolian', () => {
    expect(describeClaudeError(new ClaudeStopError('refusal'))).toMatchObject({ code: 'refusal', retryable: false });
    expect(describeClaudeError(new ClaudeStopError('max_tokens'))).toMatchObject({ code: 'truncated' });
});
