/**
 * AI Types - Centralized type definitions for AI functionality
 */

import type { Property } from './property';

// AI Emotion/Personality types
export type AIEmotion = 'friendly' | 'professional' | 'enthusiastic' | 'calm' | 'playful';

// FAQ type for AI context
export interface AIFAQ {
    question: string;
    answer: string;
}

// Quick Reply type for AI context
export interface AIQuickReply {
    trigger_words: string[];
    response: string;
    is_exact_match?: boolean;
}

// Slogan type for AI context
export interface AISlogan {
    slogan: string;
    usage_context: string;
}

// Notification settings (real estate)
export interface NotifySettings {
    lead: boolean;
    viewing: boolean;
    contact: boolean;
    support: boolean;
}

// Chat context for AI
export interface ChatContext {
    shopId: string;
    customerId?: string;
    shopName: string;
    shopDescription?: string;
    aiInstructions?: string;
    aiEmotion?: AIEmotion;
    properties: Property[];
    customerName?: string;
    faqs?: AIFAQ[];
    quickReplies?: AIQuickReply[];
    slogans?: AISlogan[];
    notifySettings?: NotifySettings;
    customKnowledge?: Record<string, unknown>;
    // AI Memory: stored customer preferences (district, rooms, budget, etc.)
    customerMemory?: Record<string, string | string[] | number>;
    // Plan-based features for dynamic AI behavior
    planFeatures?: {
        ai_model?: 'gemini-3-nano' | 'gemini-3-flash' | 'gemini-3-pro';
        sales_intelligence?: boolean;
        ai_memory?: boolean;
        max_tokens?: number;
    };
}

// Chat message for history
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// Image action for property display
export interface ImageAction {
    type: 'single' | 'confirm' | 'attachment';
    properties?: PropertyImageData[];
    propertyIds?: string[];
    imageUrls?: string[];
}

export interface PropertyImageData {
    name: string;
    price: number;
    imageUrl: string;
    description?: string;
}

// Quick Reply for interactive buttons
export interface QuickReplyOption {
    title: string;      // Display text (max 20 chars)
    payload: string;    // Internal payload for handling
}

// AI Response
export interface ChatResponse {
    text: string;
    imageAction?: ImageAction;
    quickReplies?: QuickReplyOption[];
}

// Tool execution result
export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}
