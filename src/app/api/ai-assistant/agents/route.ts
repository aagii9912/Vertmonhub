import { requireModule } from '@/lib/auth/require-permission';
import { NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { AGENTS, isAdminOnlyAgent } from '@/lib/ai/orchestrator/agents';
import { groupToolsByKind } from '@/lib/ai/tool-catalog';
import { MAIN_MODEL, FAST_MODEL, hasOpenAIKey } from '@/lib/ai/openai/client';

/**
 * GET /api/ai-assistant/agents — orchestrator-ын БОДИТ агентууд (статик
 * тодорхойлолт): нэр, тайлбар, унших/бичих/устгах tool-ууд, зөвхөн-админ эсэх.
 * v1-ийн «AI Агентууд» хуудас хоосон `ai_agents` хүснэгтээс уншдаг байсан.
 */
export async function GET() {
    const denied = await requireModule('ai-assistant');
    if (denied) return denied;
    const user = await resolveApiUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const agents = Object.values(AGENTS).map((a) => {
        const tools = groupToolsByKind(a.toolNames);
        return {
            id: a.id,
            name: a.name,
            description: a.description,
            readTools: tools.read,
            writeTools: tools.write,
            deleteTools: tools.delete,
            adminTools: tools.admin,
            adminOnly: isAdminOnlyAgent(a),
        };
    });
    return NextResponse.json({ agents, provider: 'openai', model: MAIN_MODEL, fastModel: FAST_MODEL, configured: hasOpenAIKey() });
}
