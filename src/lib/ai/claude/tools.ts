/**
 * Data-assistant tool тодорхойлолтуудыг (Gemini SchemaType хэлбэртэй) Claude-ийн
 * `input_schema` (JSON Schema) хэлбэрт хөрвүүлнэ. Gemini-ийн `SchemaType` утгууд нь
 * аль хэдийн JSON Schema-ийн жижиг үсгийн type нэрс ('object','string',…) тул
 * хөрвүүлэлт нь бүтцийг хадгалж, `parameters` → `input_schema` болгоно.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { readTools, writeTools, deleteTools, adminTools } from '@/lib/ai/data-assistant/tools';
import type { AssistantPerms } from '@/lib/ai/data-assistant';

/** Gemini маягийн tool тодорхойлолт (data-assistant/tools.ts). */
export interface LegacyToolDef {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}

function normalizeSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(normalizeSchema);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'type' && typeof v === 'string') out.type = v.toLowerCase();
        else if (k === 'nullable') continue; // JSON Schema-д байхгүй
        else out[k] = normalizeSchema(v);
    }
    return out;
}

/** Нэг legacy tool → Claude Tool. */
export function toClaudeTool(def: LegacyToolDef): Anthropic.Tool {
    const params = (normalizeSchema(def.parameters || { type: 'object', properties: {} }) as Record<string, unknown>);
    const input_schema = {
        ...params,
        type: 'object' as const,
        properties: (params.properties as Record<string, unknown>) || {},
    };
    return { name: def.name, description: def.description, input_schema };
}

/** Хэрэглэгчийн эрхэд тохирсон data tool-уудын бүрэн жагсаалт (RBAC-аар шүүсэн). */
export function dataToolsForPerms(perms: AssistantPerms): Anthropic.Tool[] {
    const defs: LegacyToolDef[] = [
        ...readTools,
        ...(perms.canWrite ? writeTools : []),
        ...(perms.canDelete ? deleteTools : []),
        ...(perms.role === 'super_admin' ? adminTools : []),
    ];
    // Хуучин e-commerce tool-ууд (list_orders, get_product_stats) — үл хөдлөхөд утгагүй, нуух.
    const hidden = new Set(['list_orders', 'get_product_stats']);
    return defs.filter((d) => !hidden.has(d.name)).map(toClaudeTool);
}

/** Нэрсийн дэд олонлогоор шүүх (дэд агентад). */
export function pickTools(all: Anthropic.Tool[], names: string[]): Anthropic.Tool[] {
    const set = new Set(names);
    return all.filter((t) => set.has(t.name));
}

/* ------------------------------------------------------------------ */
/* Orchestrator-ийн дотоод tool-ууд (DB-д хүрэхгүй)                     */
/* ------------------------------------------------------------------ */

export const ASK_USER_TOOL: Anthropic.Tool = {
    name: 'ask_user',
    description:
        'Хэрэглэгчээс ТОДРУУЛГА асуух. Даалгаврыг гүйцэтгэхэд заавал хэрэгтэй мэдээлэл дутуу (жишээ: аль лид, ямар огноо, аль байр) эсвэл хэд хэдэн боломжит утга байгаад таамаглах эрсдэлтэй үед ашигла. Энэ tool-ыг дуудсаны дараа ХАРИУГАА ДУУСГА — хэрэглэгч хариулсны дараа үргэлжлүүлнэ. Мэдээлэл хангалттай бол БҮҮ дууд.',
    input_schema: {
        type: 'object',
        properties: {
            question: { type: 'string', description: 'Асуулт (монголоор, товч)' },
            options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Хэрэглэгчийн сонгох боломжит хариултууд (2–5, заавал биш). Чөлөөт хариулт ч болно.',
            },
        },
        required: ['question'],
    },
};

export const DELEGATE_TOOL_NAME = 'delegate_to_specialists';

export function buildDelegateTool(agentRoster: Array<{ id: string; name: string; description: string }>): Anthropic.Tool {
    const roster = agentRoster.map((a) => `- ${a.id} (${a.name}): ${a.description}`).join('\n');
    return {
        name: DELEGATE_TOOL_NAME,
        description:
            `НАРИЙН, ОЛОН ДОМЭЙН хамарсан шинжилгээг мэргэшсэн дэд агентуудад ЗЭРЭГ хуваарилна (жишээ: "энэ сарын бүрэн тайлан — борлуулалт + лид + маркетинг"). ` +
            `Дэд агент бүр өөрийн tool-оор өгөгдөл цуглуулж, дүгнэлтээ текстээр буцаана; чи тэдгээрийг нэгтгэж эцсийн хариу бичнэ. ` +
            `Энгийн/нэг домэйны асуултад БҮҮ ашигла — өөрөө шууд tool дууд. Нэг дуудлагад 2–4 даалгавар.\n\nБОЛОМЖИТ ДЭД АГЕНТУУД:\n${roster}`,
        input_schema: {
            type: 'object',
            properties: {
                tasks: {
                    type: 'array',
                    description: 'Зэрэг гүйцэтгэх даалгаврууд',
                    items: {
                        type: 'object',
                        properties: {
                            agent: { type: 'string', description: 'Дэд агентын id' },
                            task: { type: 'string', description: 'Тухайн агентад өгөх тодорхой даалгавар (монголоор)' },
                        },
                        required: ['agent', 'task'],
                    },
                },
            },
            required: ['tasks'],
        },
    };
}
