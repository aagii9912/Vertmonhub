import Anthropic from '@anthropic-ai/sdk';
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

it('says the Anthropic credit ran out instead of a generic or configuration failure', () => {
    const lowBalance = Anthropic.APIError.generate(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, undefined, new Headers());
    const billing = Anthropic.APIError.generate(402, { type: 'error', error: { type: 'billing_error', message: 'Payment required' } }, undefined, new Headers());
    expect(describeClaudeError(lowBalance)).toMatchObject({ code: 'billing', retryable: false });
    expect(describeClaudeError(billing)).toMatchObject({ code: 'billing', retryable: false });
    expect(describeClaudeError(billing).message).toContain('кредит');
    const badModel = Anthropic.APIError.generate(400, { type: 'error', error: { type: 'invalid_request_error', message: 'model: claude-x not found' } }, undefined, new Headers());
    expect(describeClaudeError(badModel)).toMatchObject({ code: 'configuration' });
});
