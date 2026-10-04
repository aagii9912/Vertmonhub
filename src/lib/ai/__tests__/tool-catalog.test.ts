import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '../data-assistant/tools';
import {
    AUTO_TOOL_NAMES, MUTATING_TOOL_NAMES, TOOL_CATALOG, WRITE_TOOL_NAMES,
    canRememberTool, groupToolsByKind, isMutatingTool, toolKindDenial,
} from '../tool-catalog';

describe('tool catalog ↔ schema definitions', () => {
    it('registers every defined tool exactly once and defines every registered tool', () => {
        const defined = TOOL_DEFINITIONS.map((tool) => tool.name);
        expect(new Set(defined).size).toBe(defined.length);
        expect([...defined].sort()).toEqual(Object.keys(TOOL_CATALOG).sort());
    });

    it('keeps AUTO tools reversible writes and never auto-runs money, delete or outbound tools', () => {
        for (const tool of AUTO_TOOL_NAMES) expect(WRITE_TOOL_NAMES, tool).toContain(tool);
        for (const tool of ['delete_lead', 'add_contract_payment', 'mark_payment_paid', 'create_contract', 'reply_to_customer', 'assign_lead_manager']) {
            expect(AUTO_TOOL_NAMES, tool).not.toContain(tool);
        }
    });
});

describe('risk rules', () => {
    it('treats only registered non-read tools as mutating', () => {
        expect(isMutatingTool('delete_property')).toBe(true);
        expect(isMutatingTool('invite_user')).toBe(true);
        expect(isMutatingTool('list_leads')).toBe(false);
        expect(isMutatingTool('toString')).toBe(false);
        expect(MUTATING_TOOL_NAMES).toContain('log_call');
    });

    it('remembers only ordinary writes', () => {
        expect(canRememberTool('create_lead')).toBe(true);
        expect(canRememberTool('schedule_viewing')).toBe(true);
        for (const tool of ['delete_property', 'invite_user', 'list_leads', 'bulk_update_leads', 'process_contract_action', 'update_property_price',
            'create_contract', 'create_property', 'add_contract_payment', 'mark_payment_paid', 'merge_customers', 'reply_to_customer', 'set_marketing_budget']) {
            expect(canRememberTool(tool), tool).toBe(false);
        }
    });

    it('denies kinds the role cannot perform', () => {
        const viewer = { canWrite: false, canDelete: false, role: 'viewer' };
        expect(toolKindDenial('read', viewer)).toBeNull();
        expect(toolKindDenial('write', viewer)).toContain('бичих');
        expect(toolKindDenial('delete', { ...viewer, canWrite: true })).toContain('устгах');
        expect(toolKindDenial('admin', { canWrite: true, canDelete: true, role: 'admin' })).toContain('super_admin');
        expect(toolKindDenial('admin', { canWrite: true, canDelete: true, role: 'super_admin' })).toBeNull();
    });

    it('groups agent tool names by kind', () => {
        expect(groupToolsByKind(['list_leads', 'create_lead', 'delete_lead', 'invite_user', 'nope'])).toEqual({
            read: ['list_leads'], write: ['create_lead'], delete: ['delete_lead'], admin: ['invite_user'],
        });
    });
});
