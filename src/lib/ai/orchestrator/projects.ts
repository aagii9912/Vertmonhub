import type Anthropic from '@anthropic-ai/sdk';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { isCatalogTool } from '@/lib/ai/tool-catalog';
import type { OrchestratorContext } from './types';

export const IN_PROJECT_TOOL_NAME = 'in_project';

/**
 * Shop = төсөл тул туслах нэг ярианд зөвхөн идэвхтэй төслөө хардаг. `in_project` нь хэрэглэгчийн
 * хандах (owner ∪ shop_members, серверийн тооцоолсон) өөр төсөлд нэг data tool-ыг тэр shop-ийн эрх,
 * борлуулалтын хүрээгээр ажиллуулна. Бичих үйлдэл (AUTO ч) зөвхөн тухайн shop-той карт үүсгэнэ.
 */
export function buildInProjectTool(ctx: Pick<OrchestratorContext, 'shopId' | 'projects' | 'perms' | 'userId' | 'userName'>) {
    const others = (ctx.projects ?? []).filter(project => project.shopId !== ctx.shopId);
    if (!others.length) return null;
    const current = ctx.projects?.find(project => project.shopId === ctx.shopId)?.name;
    const tool: Anthropic.Tool = {
        name: IN_PROJECT_TOOL_NAME,
        description: `Өөр төслийн өгөгдлийг унших эсвэл тэнд үйлдэл санал болгох. Одоогийн төсөлд${current ? ` («${current}»)` : ''} энэ tool хэрэггүй — tool-оо шууд дууд. `
            + 'Нэг дуудлага = нэг төсөл, нэг data tool; args нь тухайн tool-ын аргумент. «Бүх төсөл» гэвэл төсөл бүрт тусад нь дуудаж нэгтгэ. '
            + 'Бичих үйлдэл зөвхөн тухайн төслийн баталгаажуулалтын карт үүсгэнэ.',
        input_schema: {
            type: 'object',
            properties: {
                project: { type: 'string', enum: others.map(project => project.name), description: 'Төслийн нэр' },
                tool: { type: 'string', description: 'Data tool-ын нэр (жишээ: list_properties, get_dashboard_stats, list_leads)' },
                args: { type: 'object', description: 'Тухайн tool-ын аргумент' },
            },
            required: ['project', 'tool'],
        },
    };
    const run = async (args: Record<string, unknown>): Promise<unknown> => {
        const target = others.find(project => project.name === args.project || project.shopId === args.project);
        if (!target) return { error: `Төсөл олдсонгүй эсвэл хандах эрхгүй. Боломжтой: ${others.map(project => project.name).join(', ')}` };
        const name = String(args.tool ?? '');
        if (!isCatalogTool(name)) return { error: `«${name}» гэсэн data tool алга` };
        const toolArgs = args.args && typeof args.args === 'object' && !Array.isArray(args.args) ? args.args as Record<string, unknown> : {};
        const result = await executeDataTool(name, toolArgs, target.shopId, ctx.perms, ctx.userId, false, ctx.userName || '');
        if (result && typeof result === 'object' && !Array.isArray(result) && result.requiresConfirmation) {
            return { ...result, shopId: target.shopId, label: `${target.name}: ${result.label}` };
        }
        if (Array.isArray(result)) return { project: target.name, items: result };
        return result && typeof result === 'object' ? { project: target.name, ...result } : { project: target.name, result };
    };
    return { tool, run };
}
