/**
 * AI туслах v3 — хөнгөн eval (бодит Claude + бодит DB).
 *
 * Хэрэглээ:  node --env-file=.env.local --import tsx scripts/eval/ai-assistant-eval.ts [shopId] [userId]
 * Шаардлага: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY. shopId/userId-г env AI_EVAL_SHOP_ID / AI_EVAL_USER_ID-ээс ч уншина.
 *
 * Case бүрт: хүлээгдэж буй tool-уудын аль нэг дуудагдсан эсэх, монгол хариу эсэх, латенси, токен.
 * Үр дүн scripts/eval/out/ai-assistant-<timestamp>.json-д хадгалагдана (прompt тохируулахад харьцуулна).
 */

import fs from 'node:fs';
import path from 'node:path';

interface Case { name: string; message: string; expectTools?: string[]; expectNoTool?: boolean; expectClarify?: boolean; readOnly?: boolean }

const CASES: Case[] = [
    { name: 'сарын борлуулалт', message: 'Энэ сарын борлуулалт хэд байна?', expectTools: ['get_sales_summary', 'get_contracts_summary', 'get_dashboard_stats'] },
    { name: 'шинэ лидүүд', message: 'Шинэ лидүүдийг харуулаач', expectTools: ['list_leads'] },
    { name: 'хугацаа хэтэрсэн', message: 'Хугацаа хэтэрсэн төлбөртэй гэрээнүүд аль нь вэ?', expectTools: ['list_contracts'] },
    { name: 'байр хайх', message: '3 өрөө, 400 сая₮-өөс доош боломжтой байр байна уу?', expectTools: ['list_properties'] },
    { name: 'тодруулга', message: 'Түүнд тэмдэглэл нэм', expectClarify: true },
    { name: 'олон домэйн', message: 'Энэ сарын бүрэн дүн шинжилгээ хий: борлуулалт, лид, маркетинг', expectTools: ['delegate_to_specialists', 'get_sales_summary', 'get_marketing_summary'] },
    { name: 'ерөнхий асуулт', message: 'Сайн уу, чи юу хийж чадах вэ?', expectNoTool: true },
    { name: 'үйлдэл (preview)', message: 'Тест Хэрэглэгч нэртэй, 99000000 утастай шинэ лид үүсгэ', expectTools: ['create_lead'] },
];

async function main() {
    if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY алга — eval ажиллахгүй.'); process.exit(1); }
    const shopId = process.argv[2] || process.env.AI_EVAL_SHOP_ID;
    const userId = process.argv[3] || process.env.AI_EVAL_USER_ID;
    if (!shopId || !userId) { console.error('shopId ба userId хэрэгтэй (arg эсвэл AI_EVAL_SHOP_ID / AI_EVAL_USER_ID).'); process.exit(1); }

    const { runOrchestrator } = await import('../../src/lib/ai/orchestrator');
    const results: Array<Record<string, unknown>> = [];
    let pass = 0;
    for (const c of CASES) {
        const started = Date.now();
        const tools: string[] = [];
        try {
            const r = await runOrchestrator(c.message, {
                shopId, userId, perms: { canWrite: true, canDelete: false, role: 'sales_manager' }, userName: 'Eval',
                onEvent: (e) => { if (e.type === 'tool_start') tools.push(e.tool); },
            });
            const cyrillic = /[А-Яа-яӨөҮү]/.test(r.text || (r.clarification?.question ?? ''));
            const toolOk = c.expectNoTool ? tools.length === 0 : c.expectTools ? c.expectTools.some((t) => tools.includes(t)) : true;
            const clarifyOk = c.expectClarify ? !!r.clarification : true;
            const ok = cyrillic && toolOk && clarifyOk;
            if (ok) pass++;
            const row = { name: c.name, ok, tools, clarification: r.clarification, latencyMs: Date.now() - started, tokens: r.trace.totalTokens, cacheRead: r.trace.cacheReadTokens, rounds: r.trace.rounds, pending: r.pendingActions.map((p) => p.tool), text: r.text.slice(0, 300) };
            results.push(row);
            console.log(`${ok ? '✅' : '❌'} ${c.name} — ${tools.join(', ') || 'tool-гүй'} · ${(row.latencyMs / 1000).toFixed(1)}с · ${row.tokens} токен`);
        } catch (e) {
            results.push({ name: c.name, ok: false, error: e instanceof Error ? e.message : String(e) });
            console.log(`💥 ${c.name} — ${e instanceof Error ? e.message : e}`);
        }
    }
    const outDir = path.join(process.cwd(), 'scripts/eval/out');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `ai-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify({ pass, total: CASES.length, results }, null, 2));
    console.log(`\n${pass}/${CASES.length} амжилттай → ${file}`);
}

void main();
