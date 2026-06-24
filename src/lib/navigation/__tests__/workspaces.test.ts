import { describe, it, expect } from 'vitest';
import {
    getWorkspaceForPath,
    getNavTitle,
    WORKSPACES,
    WORKSPACE_ORDER,
} from '../workspaces';

describe('getWorkspaceForPath (longest-prefix match)', () => {
    it('maps /dashboard and sales sub-routes to sales', () => {
        expect(getWorkspaceForPath('/dashboard').id).toBe('sales');
        expect(getWorkspaceForPath('/dashboard/properties').id).toBe('sales');
        expect(getWorkspaceForPath('/dashboard/leads/pipeline').id).toBe('sales');
        expect(getWorkspaceForPath('/dashboard/contracts').id).toBe('sales');
    });

    it('maps AI routes to ai (longer prefix beats /dashboard)', () => {
        expect(getWorkspaceForPath('/dashboard/ai-assistant').id).toBe('ai');
        expect(getWorkspaceForPath('/dashboard/ai-assistant/agents').id).toBe('ai');
        expect(getWorkspaceForPath('/dashboard/inbox').id).toBe('ai');
        expect(getWorkspaceForPath('/dashboard/ai-settings').id).toBe('ai');
    });

    it('maps both marketing trees to marketing', () => {
        expect(getWorkspaceForPath('/marketing').id).toBe('marketing');
        expect(getWorkspaceForPath('/marketing/social').id).toBe('marketing');
        expect(getWorkspaceForPath('/dashboard/marketing-roi').id).toBe('marketing');
        expect(getWorkspaceForPath('/dashboard/surveys').id).toBe('marketing');
    });

    it('falls back to sales for unmatched routes', () => {
        expect(getWorkspaceForPath('/help').id).toBe('sales');
        expect(getWorkspaceForPath('/dashboard/settings').id).toBe('sales');
    });
});

describe('getNavTitle (deepest matching item)', () => {
    it('returns the label of the deepest matching nav item', () => {
        expect(getNavTitle('/dashboard/properties')).toBe('Үл хөдлөх');
        expect(getNavTitle('/dashboard/ai-assistant/agents')).toBe('AI Агентууд');
        expect(getNavTitle('/marketing/social')).toBe('Социал медиа');
        expect(getNavTitle('/dashboard/settings')).toBe('Тохиргоо');
    });

    it('falls back to a default title for unknown routes', () => {
        expect(getNavTitle('/totally/unknown')).toBe('Хянах самбар');
    });
});

describe('workspace order / hero', () => {
    it('orders sales, ai (hero center), marketing', () => {
        expect(WORKSPACE_ORDER).toEqual(['sales', 'ai', 'marketing']);
    });

    it('marks only AI as the emphasized hero', () => {
        expect(WORKSPACES.find((w) => w.id === 'ai')?.emphasis).toBe(true);
        expect(WORKSPACES.find((w) => w.id === 'sales')?.emphasis).toBeFalsy();
        expect(WORKSPACES.find((w) => w.id === 'marketing')?.emphasis).toBeFalsy();
    });

    it('keeps marketing ungated (always reachable, mirrors legacy shell)', () => {
        expect(WORKSPACES.find((w) => w.id === 'marketing')?.accessModules).toEqual([]);
    });
});
