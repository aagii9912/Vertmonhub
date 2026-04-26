/**
 * Vertmon Hub AI Configuration
 * 
 * Internal company app — all employees have full access.
 * Single config using Gemini 3 Pro model.
 */

import type { ToolName } from '../tools/definitions';

// ============================================
// AI Model Configuration
// ============================================

export type AIProvider = 'google';
export type AIModel = 'gemini-3-pro';

export interface AIConfig {
    provider: AIProvider;
    model: AIModel;
    maxTokens: number;
    features: {
        toolCalling: boolean;
        vision: boolean;
        memory: boolean;
        salesIntelligence: boolean;
        leadManagement: boolean;
        viewingScheduler: boolean;
        loanCalculator: boolean;
        crmAnalytics: 'full';
        autoTagging: boolean;
        appointmentBooking: boolean;
        bulkMarketing: boolean;
        excelExport: boolean;
    };
    enabledTools: ToolName[];
}

/**
 * Single AI configuration — full access for all Vertmon employees
 */
export const AI_CONFIG: AIConfig = {
    provider: 'google',
    model: 'gemini-3-pro',
    maxTokens: 1500,
    features: {
        toolCalling: true,
        vision: true,
        memory: true,
        salesIntelligence: true,
        leadManagement: true,
        viewingScheduler: true,
        loanCalculator: true,
        crmAnalytics: 'full',
        autoTagging: true,
        appointmentBooking: true,
        bulkMarketing: true,
        excelExport: true,
    },
    enabledTools: [
        'search_properties',
        'show_property_images',
        'calculate_loan',
        'schedule_viewing',
        'create_lead',
        'collect_contact_info',
        'request_human_support',
        'remember_preference',
        'check_payment_status',
        'log_service_request',
    ],
};

// ============================================
// Helper functions (simplified — no plan logic)
// ============================================

/** Get the AI config */
export function getAIConfig(): AIConfig {
    return AI_CONFIG;
}

/** Check if a tool is enabled */
export function isToolEnabled(toolName: ToolName): boolean {
    return AI_CONFIG.enabledTools.includes(toolName);
}

/** Get all enabled tools */
export function getEnabledTools(): ToolName[] {
    return AI_CONFIG.enabledTools;
}

/** Model display name for UI */
export const MODEL_DISPLAY_NAME = 'Gemini 3 Pro';

// ============================================
// Legacy compatibility — keeps AIRouter working
// without changing every import
// ============================================

/** @deprecated Use AI_CONFIG directly */
export type PlanType = 'ultimate';

/** @deprecated Use AI_CONFIG directly */
export type PlanAIConfig = AIConfig;

/** @deprecated Use AI_CONFIG directly */
export const PLAN_CONFIGS = { ultimate: AI_CONFIG } as Record<string, AIConfig>;

/** @deprecated Use getAIConfig() */
export function getPlanConfig(_plan?: string): AIConfig {
    return AI_CONFIG;
}

/** @deprecated No longer needed — always returns 'ultimate' */
export function getPlanTypeFromSubscription(_subscription?: unknown): PlanType {
    return 'ultimate';
}

/** @deprecated Use isToolEnabled() */
export function isToolEnabledForPlan(toolName: ToolName, _plan?: string): boolean {
    return isToolEnabled(toolName);
}

/** @deprecated Use getEnabledTools() */
export function getEnabledToolsForPlan(_plan?: string): ToolName[] {
    return getEnabledTools();
}

/** @deprecated No message limits — always allowed */
export function checkMessageLimit(_plan?: string, _currentCount?: number) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
}

/** @deprecated No shop limits */
export function checkShopLimit(_plan?: string, _currentCount?: number) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
}

/** @deprecated Use MODEL_DISPLAY_NAME */
export const MODEL_DISPLAY_NAMES = { 'gemini-3-pro': 'Gemini 3 Pro' } as Record<string, string>;

/** @deprecated No plan display names needed */
export const PLAN_DISPLAY_NAMES = { ultimate: 'Vertmon Hub' } as Record<string, string>;
