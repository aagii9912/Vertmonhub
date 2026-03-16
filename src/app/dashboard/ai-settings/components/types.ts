// Shared types for AI Settings components
export type Tab = 'general' | 'faqs' | 'quick_replies' | 'slogans' | 'notifications' | 'knowledge' | 'policies' | 'stats' | 'import';
export type AiEmotion = 'friendly' | 'professional' | 'enthusiastic' | 'calm' | 'playful';

export interface FAQ {
    id: string;
    question: string;
    answer: string;
    category: string;
    is_active: boolean;
    usage_count: number;
}

export interface QuickReply {
    id: string;
    name: string;
    trigger_words: string[];
    response: string;
    is_exact_match: boolean;
    is_active: boolean;
    usage_count: number;
}

export interface Slogan {
    id: string;
    slogan: string;
    usage_context: string;
    is_active: boolean;
}

export interface AIStats {
    total_conversations: number;
    total_messages: number;
    conversion_rate: number;
    recent_conversations: number;
    top_questions: Array<{
        question_pattern: string;
        sample_question: string;
        category: string;
        count: number;
    }>;
}
