import { describe, it, expect } from 'vitest';
import { WRITE_TOOLS, DELETE_TOOLS, ADMIN_TOOLS, getRiskTier, canRememberTool } from '../riskTiers';
import { WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES } from '../data-assistant/tools';

/**
 * riskTiers.ts нь tools.ts-ийн массивуудыг client-safe хуулбарлаж авдаг (Gemini SDK-г
 * client bundle-д татахгүйн тулд). Энэ тест хоёрын хооронд зөрүү (drift) гарвал алдаа өгнө.
 */
describe('riskTiers ↔ tools.ts drift guard', () => {
    it('WRITE_TOOLS matches WRITE_TOOL_NAMES', () => {
        expect([...WRITE_TOOLS].sort()).toEqual([...WRITE_TOOL_NAMES].sort());
    });
    it('DELETE_TOOLS matches DELETE_TOOL_NAMES', () => {
        expect([...DELETE_TOOLS].sort()).toEqual([...DELETE_TOOL_NAMES].sort());
    });
    it('ADMIN_TOOLS matches ADMIN_TOOL_NAMES', () => {
        expect([...ADMIN_TOOLS].sort()).toEqual([...ADMIN_TOOL_NAMES].sort());
    });
});

describe('getRiskTier', () => {
    it('classifies delete tools as danger', () => {
        expect(getRiskTier('delete_property')).toBe('danger');
        expect(getRiskTier('delete_lead')).toBe('danger');
    });
    it('classifies admin tools as admin', () => {
        expect(getRiskTier('invite_user')).toBe('admin');
        expect(getRiskTier('assign_role')).toBe('admin');
    });
    it('classifies write/unknown tools as safe', () => {
        expect(getRiskTier('create_lead')).toBe('safe');
        expect(getRiskTier('unknown_tool')).toBe('safe');
    });
});

describe('canRememberTool', () => {
    it('allows safe additive write tools', () => {
        expect(canRememberTool('create_lead')).toBe(true);
        expect(canRememberTool('schedule_viewing')).toBe(true);
    });
    it('never remembers delete or admin tools', () => {
        expect(canRememberTool('delete_property')).toBe(false);
        expect(canRememberTool('invite_user')).toBe(false);
    });
    it('excludes high-impact write tools', () => {
        expect(canRememberTool('bulk_update_leads')).toBe(false);
        expect(canRememberTool('process_contract_action')).toBe(false);
    });
});
