import { NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { AGENTS } from '@/lib/ai/orchestrator/agents';
import { MAIN_MODEL, FAST_MODEL } from '@/lib/ai/claude/client';

/**
 * GET /api/ai-assistant/agents — orchestrator-ын БОДИТ агентууд (статик
 * тодорхойлолт): нэр, тайлбар, унших/бичих/устгах tool-ууд, зөвхөн-админ эсэх.
 * v1-ийн «AI Агентууд» хуудас хоосон `ai_agents` хүснэгтээс уншдаг байсан.
 */
export async function GET() {
    const user = await resolveApiUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const agents = Object.values(AGENTS).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,

        readTools: a.readToolNames,
        writeTools: a.writeToolNames,
        deleteTools: a.deleteToolNames ?? [],
        adminTools: a.adminToolNames ?? [],
        adminOnly: (a.adminToolNames ?? []).length > 0 && a.readToolNames.length <= 1,
    }));
    return NextResponse.json({ agents, model: MAIN_MODEL, fastModel: FAST_MODEL });
}
