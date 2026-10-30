/** Messages API boundary: one streamed round, returned only once the message is complete. */
import type Anthropic from '@anthropic-ai/sdk';
import { claude, ClaudeStopError } from './client';

export function messageText(message: Anthropic.Message): string {
    return message.content.flatMap((b) => b.type === 'text' ? [b.text] : []).join('\n').trim();
}

export interface MessageRoundOptions {
    model: string;
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
    /** `none` keeps tool definitions (required once history holds tool_use blocks) but forbids new calls. */
    toolChoice?: 'auto' | 'none';
    signal?: AbortSignal;
    deadlineAt?: number;
    effort?: 'low' | 'medium' | 'high';
    maxTokens?: number;
    onText?: (delta: string) => void;
}

export async function streamMessage(o: MessageRoundOptions): Promise<Anthropic.Message> {
    o.signal?.throwIfAborted();
    const remaining = Math.min(45_000, (o.deadlineAt ?? Date.now() + 45_000) - Date.now());
    if (remaining <= 0) throw new DOMException('AI deadline reached', 'TimeoutError');
    const timeout = AbortSignal.timeout(remaining);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
    const stream = claude().messages.stream({
        model: o.model, system: o.system, messages: o.messages, max_tokens: o.maxTokens ?? 16_000,
        thinking: { type: 'adaptive' }, output_config: { effort: o.effort ?? 'medium' },
        // Rolling breakpoint: each tool round re-reads the previous rounds from cache.
        cache_control: { type: 'ephemeral' },
        ...(o.tools.length ? { tools: o.tools, tool_choice: { type: o.toolChoice ?? 'auto' } } : {}),
    }, { signal });
    if (o.onText) stream.on('text', (delta) => o.onText!(delta));
    const message = await stream.finalMessage();
    // Never execute a tool call cut off by the token cap, and never treat a refusal as an answer.
    if (message.stop_reason === 'refusal') throw new ClaudeStopError('refusal');
    if ((message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') && message.content.some((b) => b.type === 'tool_use')) {
        throw new ClaudeStopError(message.stop_reason);
    }
    return message;
}
