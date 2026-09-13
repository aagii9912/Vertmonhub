/** Responses API boundary; reuse the existing tool/input schemas without changing business actions. */
import type Anthropic from '@anthropic-ai/sdk';
import type { FunctionTool, Response, ResponseInput, ResponseInputContent, ResponseInputItem } from 'openai/resources/responses/responses';
import { openai } from './client';

export function toResponseTools(tools: Anthropic.Tool[]): FunctionTool[] {
    // Explicit non-strict mode preserves optional legacy arguments. Server-side validation/RBAC remains authoritative.
    return tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: false }));
}

export function toResponseInput(messages: Anthropic.MessageParam[]): ResponseInput {
    return messages.map((m): ResponseInputItem => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content };
        const content: ResponseInputContent[] = m.content.flatMap((b): ResponseInputContent[] => {
            if (b.type === 'text') return [{ type: 'input_text', text: b.text }];
            if (b.type === 'image' && b.source.type === 'base64') return [{ type: 'input_image', image_url: `data:${b.source.media_type};base64,${b.source.data}`, detail: 'auto' }];
            if (b.type === 'document' && b.source.type === 'base64') return [{ type: 'input_file', filename: 'attachment.pdf', file_data: `data:application/pdf;base64,${b.source.data}` }];
            throw new Error('Unsupported assistant input block');
        });
        return { role: m.role, content };
    });
}

export function responseText(response: Response): string {
    return response.output.flatMap((item) => item.type === 'message' ? item.content.flatMap((c) => c.type === 'output_text' ? [c.text] : c.type === 'refusal' ? [c.refusal] : []) : []).join('\n').trim();
}

export interface ResponseRoundOptions {
    model: string;
    instructions: string;
    input: ResponseInput;
    tools: FunctionTool[];
    signal?: AbortSignal;
    deadlineAt?: number;
    effort?: 'low' | 'medium' | 'high';
    maxTokens?: number;
    onText?: (delta: string) => void;
}

export async function streamResponse(o: ResponseRoundOptions): Promise<Response> {
    o.signal?.throwIfAborted();
    const remaining = Math.min(45_000, (o.deadlineAt ?? Date.now() + 45_000) - Date.now());
    if (remaining <= 0) throw new DOMException('AI deadline reached', 'TimeoutError');
    const timeout = AbortSignal.timeout(remaining);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
    const stream = await openai().responses.create({
        model: o.model, instructions: o.instructions, input: o.input, tools: o.tools,
        reasoning: { effort: o.effort ?? 'medium' }, max_output_tokens: o.maxTokens ?? 8000,
        stream: true, store: false, include: ['reasoning.encrypted_content'],
    }, { signal });
    let completed: Response | undefined;
    for await (const event of stream) {
        if (event.type === 'response.output_text.delta') o.onText?.(event.delta);
        if (event.type === 'response.completed') completed = event.response;
        if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
            throw new Error(`OpenAI response did not complete: ${event.type}`);
        }
    }
    // Never execute a partial function call after a truncated/disconnected stream.
    if (!completed || completed.status !== 'completed') throw new Error('OpenAI stream ended before completion');
    return completed;
}
