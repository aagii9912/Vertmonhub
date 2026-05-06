/**
 * AI Tool Definitions for Vertmon Hub
 * Real Estate Platform AI Function Calling Tools
 * Now using Gemini format (SchemaType)
 */

import { SchemaType } from '@google/generative-ai';

/**
 * All available AI tools for Gemini function calling
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GEMINI_TOOLS: any[] = [
    // ============================================
    // REAL ESTATE TOOLS
    // ============================================
    {
        name: 'search_properties',
        description: 'Хэрэглэгчийн хүсэлтээр үл хөдлөх хөрөнгө хайх. Үнэ, хэмжээ, өрөөний тоо, байршил зэргээр шүүж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: {
                    type: SchemaType.STRING,
                    enum: ['apartment', 'house', 'office', 'land', 'commercial'],
                    description: 'Үл хөдлөхийн төрөл'
                },
                min_price: { type: SchemaType.NUMBER, description: 'Доод үнэ (MNT)' },
                max_price: { type: SchemaType.NUMBER, description: 'Дээд үнэ (MNT)' },
                rooms: { type: SchemaType.NUMBER, description: 'Өрөөний тоо' },
                district: { type: SchemaType.STRING, description: 'Дүүрэг/байршил' },
                min_size: { type: SchemaType.NUMBER, description: 'Доод хэмжээ (м²)' },
                max_size: { type: SchemaType.NUMBER, description: 'Дээд хэмжээ (м²)' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн үр дүн харуулах (default: 5)' }
            }
        }
    },
    {
        name: 'show_property_images',
        description: 'Тодорхой үл хөдлөхийн зураг харуулах.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Үл хөдлөхийн ID' },
                property_name: { type: SchemaType.STRING, description: 'Үл хөдлөхийн нэр (ID байхгүй бол)' }
            }
        }
    },
    {
        name: 'calculate_loan',
        description: 'Орон сууцны зээлийн тооцоолол. Сарын төлбөр, нийт дүн тооцох.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                amount: { type: SchemaType.NUMBER, description: 'Зээлийн хэмжээ (MNT)' },
                rate: { type: SchemaType.NUMBER, description: 'Жилийн хүү (%, default: 12)' },
                years: { type: SchemaType.NUMBER, description: 'Зээлийн хугацаа (жил)' },
                down_payment: { type: SchemaType.NUMBER, description: 'Урьдчилгаа төлбөр (MNT, optional)' }
            },
            required: ['amount', 'years']
        }
    },
    {
        name: 'schedule_viewing',
        description: 'Үл хөдлөх үзэх уулзалт товлох. Хэрэглэгч үзлэг хийхийг хүссэн үед.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Үл хөдлөхийн ID' },
                property_name: { type: SchemaType.STRING, description: 'Үл хөдлөхийн нэр' },
                preferred_date: { type: SchemaType.STRING, description: 'Хүссэн огноо (YYYY-MM-DD)' },
                preferred_time: { type: SchemaType.STRING, description: 'Хүссэн цаг' },
                customer_phone: { type: SchemaType.STRING, description: 'Хэрэглэгчийн утас' }
            },
            required: ['property_name']
        }
    },
    {
        name: 'create_lead',
        description: 'Шинэ lead/сонирхогч үүсгэх. Хэрэглэгч үл хөдлөхийн талаар сонирхол илэрхийлэхэд автоматаар үүсгэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Сонирхсон үл хөдлөхийн ID' },
                budget_min: { type: SchemaType.NUMBER, description: 'Төсвийн доод хязгаар (MNT)' },
                budget_max: { type: SchemaType.NUMBER, description: 'Төсвийн дээд хязгаар (MNT)' },
                preferred_type: {
                    type: SchemaType.STRING,
                    enum: ['apartment', 'house', 'office', 'land', 'commercial'],
                    description: 'Сонирхсон төрөл'
                },
                preferred_district: { type: SchemaType.STRING, description: 'Сонирхсон байршил' },
                preferred_rooms: { type: SchemaType.NUMBER, description: 'Хүссэн өрөөний тоо' },
                notes: { type: SchemaType.STRING, description: 'Нэмэлт тэмдэглэл' }
            }
        }
    },
    // ============================================
    // GENERAL TOOLS
    // ============================================
    {
        name: 'collect_contact_info',
        description: 'Хэрэглэгчийн холбоо барих мэдээлэл цуглуулах. Утас, имэйл, нэр.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                phone: { type: SchemaType.STRING, description: 'Утасны дугаар' },
                email: { type: SchemaType.STRING, description: 'Имэйл хаяг' },
                name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэр' }
            }
        }
    },
    {
        name: 'request_human_support',
        description: 'Хүнтэй холбогдохыг хүссэн үед. Оператор, менежер, хүн гэх мэт.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                reason: { type: SchemaType.STRING, description: 'Хүсэлтийн шалтгаан' }
            },
            required: ['reason']
        }
    },
    {
        name: 'remember_preference',
        description: 'Хэрэглэгчийн сонголт, давуу талыг санах.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                key: { type: SchemaType.STRING, description: 'Санах түлхүүр' },
                value: { type: SchemaType.STRING, description: 'Санах утга' }
            },
            required: ['key', 'value']
        }
    },
    {
        name: 'tag_customer_behavior',
        description: 'Харилцагчийн зан төлөвийг tag-аар тэмдэглэх. Жишээ: "interest:apartment", "budget:300m", "urgency:high", "stage:browsing", "stage:hot_lead". Чат явц дунд хэрэглэгчийн талаар ойлгож авсан зан төлөвийг тэмдэглэхэд ашигла.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                tags: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: 'Tag-уудын жагсаалт. category:value форматтай (жишээ: ["interest:apartment", "budget:300m", "urgency:high"])'
                }
            },
            required: ['tags']
        }
    },
    {
        name: 'append_customer_note',
        description: 'Харилцагчийн talaar AI-ийн товч тэмдэглэл бичих. Sales manager-т хүлээлгэн өгөхийн өмнө эсвэл чухал мэдээлэл цуглуулсны дараа дуудна. 1-2 өгүүлбэрийн товч Mongolian summary бичнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                summary: {
                    type: SchemaType.STRING,
                    description: 'Mongolian, 1-2 өгүүлбэрийн товч summary. Хэрэглэгчийн хэрэгцээ, төсөв, шийдвэр гаргах хугацаа гэх мэт.'
                }
            },
            required: ['summary']
        }
    },
    // ============================================
    // CUSTOMER SERVICE TOOLS
    // ============================================
    {
        name: 'check_payment_status',
        description: 'Худалдан авагчийн гэрээний төлбөрийн байдлыг шалгах. Төлсөн дүн, үлдэгдэл, хоцрогдлыг мэдээлнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                customer_phone: { type: SchemaType.STRING, description: 'Худалдан авагчийн утасны дугаар' },
                customer_name: { type: SchemaType.STRING, description: 'Худалдан авагчийн нэр (утас байхгүй бол)' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар (тодорхой бол)' }
            }
        }
    },
    {
        name: 'log_service_request',
        description: 'Худалдан авагчийн гомдол, хүсэлт, засварын хүсэлт бүртгэх.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                subject: { type: SchemaType.STRING, description: 'Хүсэлтийн товч тайлбар' },
                type: {
                    type: SchemaType.STRING,
                    enum: ['inquiry', 'complaint', 'maintenance', 'payment', 'other'],
                    description: 'Хүсэлтийн төрөл'
                },
                priority: {
                    type: SchemaType.STRING,
                    enum: ['low', 'medium', 'high', 'urgent'],
                    description: 'Чухлал'
                },
                description: { type: SchemaType.STRING, description: 'Дэлгэрэнгүй тайлбар' }
            },
            required: ['subject']
        }
    }
];

// Keep backward compat alias
export const AI_TOOLS = GEMINI_TOOLS;

// ============================================
// TOOL ARGUMENT INTERFACES
// ============================================

export interface SearchPropertiesArgs {
    type?: 'apartment' | 'house' | 'office' | 'land' | 'commercial';
    min_price?: number;
    max_price?: number;
    rooms?: number;
    district?: string;
    min_size?: number;
    max_size?: number;
    limit?: number;
}

export interface ShowPropertyImagesArgs {
    property_id?: string;
    property_name?: string;
}

export interface CalculateLoanArgs {
    amount: number;
    rate?: number;
    years: number;
    down_payment?: number;
}

export interface ScheduleViewingArgs {
    property_id?: string;
    property_name?: string;
    preferred_date?: string;
    preferred_time?: string;
    customer_phone?: string;
}

export interface CreateLeadArgs {
    property_id?: string;
    budget_min?: number;
    budget_max?: number;
    preferred_type?: 'apartment' | 'house' | 'office' | 'land' | 'commercial';
    preferred_district?: string;
    preferred_rooms?: number;
    notes?: string;
}

export interface CollectContactArgs {
    phone?: string;
    email?: string;
    name?: string;
}

export interface RequestHumanSupportArgs {
    reason: string;
}

export interface RememberPreferenceArgs {
    key: string;
    value: string;
}

export interface TagCustomerBehaviorArgs {
    tags: string[];
}

export interface AppendCustomerNoteArgs {
    summary: string;
}

export interface CheckPaymentStatusArgs {
    customer_phone?: string;
    customer_name?: string;
    contract_number?: string;
}

export interface LogServiceRequestArgs {
    subject: string;
    type?: 'inquiry' | 'complaint' | 'maintenance' | 'payment' | 'other';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    description?: string;
}

/**
 * Union type for all tool arguments
 */
export type ToolArgs =
    | SearchPropertiesArgs
    | ShowPropertyImagesArgs
    | CalculateLoanArgs
    | ScheduleViewingArgs
    | CreateLeadArgs
    | CollectContactArgs
    | RequestHumanSupportArgs
    | RememberPreferenceArgs
    | TagCustomerBehaviorArgs
    | AppendCustomerNoteArgs
    | CheckPaymentStatusArgs
    | LogServiceRequestArgs;

/**
 * Tool names type
 */
export type ToolName =
    | 'search_properties'
    | 'show_property_images'
    | 'calculate_loan'
    | 'schedule_viewing'
    | 'create_lead'
    | 'collect_contact_info'
    | 'request_human_support'
    | 'remember_preference'
    | 'tag_customer_behavior'
    | 'append_customer_note'
    | 'check_payment_status'
    | 'log_service_request';
