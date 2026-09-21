import { z } from 'zod';
import { dateSchema, MARKETING_CHANNELS } from './performance';

const owner = z.string().trim().min(1).max(120);
const channel = z.enum(Object.keys(MARKETING_CHANNELS) as [keyof typeof MARKETING_CHANNELS, ...(keyof typeof MARKETING_CHANNELS)[]]);
const amount = z.number().int().nonnegative().max(99999999999999);
export const MarketingRecordSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('activity'), id: z.string().uuid(), name: z.string().trim().min(1).max(255),
        project_id: z.string().uuid(), marketing_owner_name: owner, channel,
        external_campaign_id: z.string().trim().regex(/^\d{1,120}$/).nullable().optional(),
        activity_kind: z.enum(['campaign', 'content']), status: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']),
        start_date: dateSchema, completed_on: dateSchema.nullable(),
    }).refine(v => v.status !== 'completed' || (!!v.completed_on && v.completed_on >= v.start_date), 'Дууссан ажлын огноо эхлэх өдрөөс хойш байна'),
    z.object({ kind: z.literal('target'), id: z.string().uuid().optional(), project_id: z.string().uuid(), marketing_owner_name: owner,
        month: dateSchema.refine(v => v.endsWith('-01')), lead_target: z.number().int().min(0).max(10000000),
        deal_target: z.number().int().min(0).max(10000000), budget: amount }),
    z.object({ kind: z.literal('spend'), id: z.string().uuid(), marketing_campaign_id: z.string().uuid(),
        spent_at: dateSchema, amount, note: z.string().trim().max(1000).nullable() }),
    z.object({ kind: z.literal('attribution'), lead_id: z.string().uuid(), marketing_campaign_id: z.string().uuid().nullable(),
        project_id: z.string().uuid(), marketing_owner_name: owner, marketing_channel: channel }),
    z.object({ kind: z.literal('handoff'), lead_id: z.string().uuid() }),
]);
