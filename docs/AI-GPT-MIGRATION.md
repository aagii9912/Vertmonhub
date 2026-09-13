# Dashboard AI — GPT Responses

2026-09-13. Local implementation. Main assistant, specialists and summaries use GPT-5.6 Luna following the owner's cost preference; there is no automatic escalation to Astra. Deployment is separate.

## Configuration

Set server-only `OPENAI_API_KEY` in `.env.local` for local use and in the deployment environment before publishing. Never use a `NEXT_PUBLIC_` key or paste credentials into a chat.

| Workload | Default | Override |
| --- | --- | --- |
| Main assistant | `gpt-5.6-luna` | `OPENAI_MODEL` |
| Specialists and conversation summaries | `gpt-5.6-luna` | `OPENAI_FAST_MODEL` |

Missing OpenAI credentials return 503. Model-access/configuration failures return a visible error; no Anthropic or Gemini fallback occurs. The agents page displays configured models and missing-key status. FB/IG DM routing remains its separate Gemini workflow.

## Execution

- The official OpenAI SDK calls Responses with streaming and `reasoning.effort=medium`; summaries use `low`. No temperature parameter is sent.
- Existing business actions, RBAC/module filtering, tenant identity, and confirmation cards remain in use. `lib/ai/claude/tools.ts` is currently a legacy schema bridge; its presence does not mean dashboard requests call Claude.
- `lib/ai/openai/responses.ts` converts tool schemas and image/PDF inputs. Explicit `strict:false` preserves existing optional arguments; business handlers must still validate inputs.
- Responses use `store:false`. Encrypted reasoning output and original `call_id` values are carried forward within the request so tool continuation works without server-stored response IDs. This is not a claim about provider-wide data retention.
- Function calls execute only after a completed response. Broken streams, malformed arguments and tools outside the current agent's allowlist cannot execute actions.
- Read-only calls may run concurrently. Mutations run in order; repeated identical mutations within one loop reuse their first result, including errors. This is not database idempotency across separate HTTP requests or specialist loops.
- `ask_user` suspends the other proposed actions in that response. Financial/destructive actions retain confirmation gates. Dependent actions must wait for actual successful results, not preview cards.
- Client cancellation and per-request deadlines reach the provider. SDK automatic retries are disabled. The JSON and streaming endpoints both set a 50-second execution deadline. Optional summary generation has its own 4-second limit.
- Trace metadata reports the model returned by OpenAI and usage from completed responses, including successful specialist runs. It is not a billing/quota meter; failed/interrupted provider calls and separate summary calls are not included.

## Verification

Focused tests cover multi-round function calling, reasoning continuity, input conversion, tool authorization, confirmations, duplicate writes, business errors, malformed arguments, clarification, cancellation, deadlines, incomplete streams and missing keys. They mock OpenAI and do not access customer data.

Before live rollout, run an authorized read-only business question, a disposable personal task and a payment preview. Check the trace, actual stored result and confirmation boundary. Follow-up verification on 2026-09-13 found the local key configured: a synthetic, tool-free Responses request returned `Холболт хэвийн` from `gpt-5.6-luna` (22 input + 10 output tokens). This confirms provider connectivity/model access; authenticated business execution and the deployment environment still require release verification.

## Official references

- [GPT model migration](https://developers.openai.com/api/docs/guides/latest-model)
- [Function calling and reasoning continuation](https://developers.openai.com/api/docs/guides/function-calling)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
