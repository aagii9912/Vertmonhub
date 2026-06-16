/**
 * Memory Tools - AI customer preference memory management
 * Allows AI to remember and recall customer preferences across sessions
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export interface RememberPreferenceArgs {
    key: string;
    value: string;
}

export interface CustomerMemory {
    [key: string]: string | string[] | number;
}

/**
 * Save a customer preference to their AI memory
 */
export async function saveCustomerPreference(
    customerId: string,
    key: string,
    value: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = supabaseAdmin();

        // Get current memory
        const { data: customer, error: fetchError } = await supabase
            .from('customers')
            .select('ai_memory')
            .eq('id', customerId)
            .single();

        if (fetchError) {
            logger.error('Failed to fetch customer memory:', { fetchError });
            return { success: false, error: 'Хэрэглэгчийн мэдээлэл олдсонгүй' };
        }

        // Merge new preference with existing memory
        const currentMemory: CustomerMemory = customer?.ai_memory || {};
        const updatedMemory = {
            ...currentMemory,
            [key]: value,
            last_updated: new Date().toISOString(),
        };

        // Save updated memory
        const { error: updateError } = await supabase
            .from('customers')
            .update({ ai_memory: updatedMemory })
            .eq('id', customerId);

        if (updateError) {
            logger.error('Failed to save customer preference:', { updateError });
            return { success: false, error: 'Хадгалахад алдаа гарлаа' };
        }

        logger.success('Customer preference saved:', { customerId, key, value });
        return { success: true };
    } catch (error) {
        logger.error('Error saving customer preference:', { error });
        return { success: false, error: 'Системийн алдаа' };
    }
}

/**
 * Get customer's AI memory
 */
export async function getCustomerMemory(
    customerId: string
): Promise<CustomerMemory | null> {
    try {
        const supabase = supabaseAdmin();

        const { data, error } = await supabase
            .from('customers')
            .select('ai_memory')
            .eq('id', customerId)
            .single();

        if (error) {
            logger.warn('Failed to get customer memory:', { error });
            return null;
        }

        return data?.ai_memory || null;
    } catch (error) {
        logger.error('Error getting customer memory:', { error });
        return null;
    }
}

/**
 * Format customer memory for AI prompt context
 */
export function formatMemoryForPrompt(memory: CustomerMemory | null): string {
    if (!memory || Object.keys(memory).length === 0) {
        return '';
    }

    // Filter out metadata keys
    const preferenceKeys = Object.keys(memory).filter(
        key => key !== 'last_updated'
    );

    if (preferenceKeys.length === 0) {
        return '';
    }

    const memoryLines = preferenceKeys.map(key => {
        const displayKey = formatKeyName(key);
        return `- ${displayKey}: ${sanitizeMemoryValue(memory[key])}`;
    });

    return `\nХЭРЭГЛЭГЧИЙН САНАХ ОЙ (Өмнө сурсан):\n${memoryLines.join('\n')}\n`;
}

/**
 * Санах ойн утгыг prompt-д оруулахын өмнө цэвэрлэнэ.
 *
 * Хэрэглэгчийн чатнаас гаралтай тул prompt injection-аас сэргийлж шинэ мөр,
 * удирдлагын тэмдэгт болон markdown тэмдэглэгээг (#, *, `) арилгаж, уртыг
 * хязгаарлана. Ингэснээр санах ойн агуулга системийн зааврыг дарж бичих
 * боломжгүй болно. char-code шүүлтүүр ашигласан нь эх кодод түүхий удирдлагын
 * тэмдэгт оруулахаас сэргийлнэ.
 */
export function sanitizeMemoryValue(value: string | string[] | number): string {
    const raw = Array.isArray(value) ? value.join(', ') : String(value);
    const flattened = raw.replace(/[\r\n]+/g, ' ');

    let out = '';
    for (const ch of flattened) {
        const code = ch.charCodeAt(0);
        if (code < 0x20) continue;                          // удирдлагын тэмдэгт
        if (ch === '`' || ch === '#' || ch === '*') continue; // markdown тэмдэглэгээ
        out += ch;
    }

    return out.trim().slice(0, 200); // хэт урт утгаас сэргийлэх
}

/**
 * Format key names for display
 */
function formatKeyName(key: string): string {
    const keyMap: Record<string, string> = {
        size: 'Размер',
        color: 'Өнгө',
        color_preference: 'Өнгөний сонголт',
        style: 'Стиль',
        budget: 'Төсөв',
        interests: 'Сонирхол',
        preferred_brands: 'Дуртай брэнд',
    };

    return keyMap[key] || key;
}
