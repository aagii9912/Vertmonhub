/**
 * Data Assistant Tool Definitions (Gemini Function Calling)
 * 
 * Read tools: Available to all admins
 * Write tools: Super Admin only
 */

import { SchemaType } from '@google/generative-ai';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readTools: any[] = [
    {
        name: 'get_dashboard_stats',
        description: 'Ерөнхий статистик авах: нийт орлого, захиалга тоо, харилцагч тоо, лийд тоо, байрны тоо. Хугацаагаар шүүж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                timeRange: { type: SchemaType.STRING, enum: ['today', 'week', 'month', 'year', 'all_time'], description: 'Хугацааны эрээлт' }
            }
        }
    },
    {
        name: 'list_orders',
        description: 'Захиалгын жагсаалт авах. Статус, тоогоор шүүж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], description: 'Захиалгын статус' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн захиалга авах (default: 10)' }
            }
        }
    },
    {
        name: 'get_product_stats',
        description: 'Бүтээгдэхүүний статистик: хамгийн их борлуулсан, нөөц бага, үнэ гэх мэт.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: { type: SchemaType.STRING, enum: ['top_selling', 'low_stock', 'all'], description: 'Ямар төрлийн статистик авах' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн бүтээгдэхүүн авах' }
            }
        }
    },
    {
        name: 'list_properties',
        description: 'Байрны жагсаалт авах. Төрөл, үнэ, дүүрэг, статус, өрөөний тоогоор шүүж болно. Mandala Garden, Mandala Tower, Elysium гэх мэт.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: { type: SchemaType.STRING, description: 'Байрны төрөл: apartment, house, office, land, commercial' },
                status: { type: SchemaType.STRING, enum: ['available', 'reserved', 'sold', 'rented', 'barter'], description: 'Байрны статус' },
                min_price: { type: SchemaType.NUMBER, description: 'Хамгийн бага үнэ (MNT)' },
                max_price: { type: SchemaType.NUMBER, description: 'Хамгийн их үнэ (MNT)' },
                rooms: { type: SchemaType.NUMBER, description: 'Өрөөний тоо' },
                district: { type: SchemaType.STRING, description: 'Дүүрэг/Байршил' },
                name_search: { type: SchemaType.STRING, description: 'Нэрээр хайх (Mandala, Elysium гэх мэт)' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн байр авах (default: 10)' }
            }
        }
    },
    {
        name: 'list_leads',
        description: 'Лийд/сонирхогчдийн жагсаалт авах. Статус, эх үүсвэр, яаралтай эсэхээр шүүж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Лийдийн статус' },
                source: { type: SchemaType.STRING, enum: ['messenger', 'instagram', 'website', 'referral', 'phone', 'other'], description: 'Эх үүсвэр' },
                urgency: { type: SchemaType.STRING, enum: ['urgent', 'normal', 'flexible'], description: 'Яаралтай эсэх' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн лийд авах (default: 10)' }
            }
        }
    },
    {
        name: 'get_lead_details',
        description: 'Нэг лийдийн дэлгэрэнгүй мэдээллийг авах: харилцагчийн мэдээлэл, төсөв, сонирхол, тэмдэглэлүүд, холбогдох байр.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' }
            }
        }
    },
    {
        name: 'get_customer_insights',
        description: 'Харилцагчийн мэдээлэл авах. customer_id өгсөн бол тухайн харилцагчийн дэлгэрэнгүй (хаяг, тагууд, тэмдэглэл, мессеж тоо, лийдүүд, гэрээнүүд) буцаана. Үгүй бол жагсаалт буцаана (нэр/утас/тагаар шүүж болно).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                customer_id: { type: SchemaType.STRING, description: 'Харилцагчийн ID (UUID)' },
                customer_name: { type: SchemaType.STRING, description: 'Нэрээр хайх (хэсэгчилсэн ч болно)' },
                phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх (хэсэгчилсэн)' },
                tag: { type: SchemaType.STRING, description: 'Тагаар шүүх. Жишээ: "source:facebook", "interest:apartment", "stage:hot_lead"' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн харилцагч авах (default: 10)' }
            }
        }
    },
    {
        name: 'list_contracts',
        description: 'Үл хөдлөхийн гэрээний (property_contracts) жагсаалт авах. Статус, харилцагч, борлуулагч менежер, төсөл, гэрээний дугаараар шүүж болно. Хугацаа хэтэрсэн (overdue_only) болон үлдэгдэлтэй (has_balance) гэрээг тусгайлан хайх боломжтой.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: ['active', 'closed'], description: 'Гэрээний төлөв (active=идэвхтэй, closed=хаагдсан)' },
                customer_search: { type: SchemaType.STRING, description: 'Харилцагчийн нэр/утас/регистер дугаараар хайх' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                sales_manager: { type: SchemaType.STRING, description: 'Борлуулагч менежерийн нэр' },
                sales_channel: { type: SchemaType.STRING, description: 'Борлуулалтын суваг (ПРОПЕРТИС, БАРТЕР, ТҮРЭЭС гэх мэт)' },
                block_name: { type: SchemaType.STRING, description: 'Төсөл/блокийн нэр (Mandala Garden, Elysium Б1 г.м.)' },
                overdue_only: { type: SchemaType.BOOLEAN, description: 'Зөвхөн хугацаа хэтэрсэн гэрээ' },
                has_balance: { type: SchemaType.BOOLEAN, description: 'Зөвхөн үлдэгдэл төлбөртэй гэрээ' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн гэрээ авах (default: 20, max: 100)' }
            }
        }
    },
    {
        name: 'get_contract_details',
        description: 'Нэг гэрээний бүх мэдээлэл авах: үнийн задаргаа (1-р үнэ, м²-ийн үнэ, нийт, төлсөн, үлдэгдэл), төлбөрийн нөхцөл, урьдчилгаа, гарын үсэг/ашиглалтын огноо, борлуулагч менежер, банкны/бартерын төлөв.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID (UUID)' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_phone: { type: SchemaType.STRING, description: 'Харилцагчийн утсаар (нэг гэрээ олдоно)' }
            }
        }
    },
    {
        name: 'get_contracts_summary',
        description: 'Бүх гэрээний нэгтгэсэн статистик: нийт гэрээ тоо, идэвхтэй/хаагдсан, нийт үнийн дүн, нийт цуглуулсан, үлдэгдэл, цуглуулалтын хувь, хугацаа хэтэрсэн гэрээ тоо, ТОП-5 менежер, суваг ба төслөөр задаргаа.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                block_name: { type: SchemaType.STRING, description: 'Зөвхөн нэг төслийн статистик' },
                sales_channel: { type: SchemaType.STRING, description: 'Зөвхөн нэг сувгийн статистик' }
            }
        }
    },
    {
        name: 'get_sales_summary',
        description: 'Борлуулалтын нэгтгэл: хэдэн байр зарагдсан, нийт орлого, дундаж үнэ, статусаар ангилал, хамгийн эрэлттэй байрны төрөл. Төслөөр шүүж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                period: { type: SchemaType.STRING, enum: ['week', 'month', 'quarter', 'year'], description: 'Хугацаа (default: month)' },
                project_name: { type: SchemaType.STRING, description: 'Төслийн нэрээр шүүх (Mandala, Elysium)' }
            }
        }
    },
    {
        name: 'get_sales_forecast',
        description: 'AI борлуулалтын прогноз: одоогийн хурдаар хэзээ бүгд зарагдах, ирэх сарын прогноз, demand шинжилгээ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                project_name: { type: SchemaType.STRING, description: 'Төслийн нэр' }
            }
        }
    },
    {
        name: 'compare_properties',
        description: 'Байрнуудыг харьцуулах: үнэ, хэмжээ, м²-ийн үнэ, давхар, харагдац. 2-5 байр зэрэг.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_names: { type: SchemaType.STRING, description: 'Байрнуудын нэрүүд (таслалаар)' },
                property_ids: { type: SchemaType.STRING, description: 'Байрнуудын ID-ууд (таслалаар)' }
            }
        }
    }
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const writeTools: any[] = [
    {
        name: 'update_property_status',
        description: 'Байрны статусыг өөрчлөх. ЗӨВХӨН Super Admin ашиглах боломжтой.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                new_status: { type: SchemaType.STRING, enum: ['available', 'reserved', 'sold', 'rented', 'barter'], description: 'Шинэ статус' }
            },
            required: ['new_status']
        }
    },
    {
        name: 'update_property_price',
        description: 'Байрны үнийг өөрчлөх. ЗӨВХӨН Super Admin.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                new_price: { type: SchemaType.NUMBER, description: 'Шинэ үнэ (MNT)' }
            },
            required: ['new_price']
        }
    },
    {
        name: 'update_lead_status',
        description: 'Лийдийн статусыг өөрчлөх. ЗӨВХӨН Super Admin.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' },
                new_status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Шинэ статус' }
            },
            required: ['new_status']
        }
    },
    {
        name: 'add_lead_note',
        description: 'Лийдэд тэмдэглэл нэмэх. ЗӨВХӨН Super Admin.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' },
                note: { type: SchemaType.STRING, description: 'Тэмдэглэл' }
            },
            required: ['note']
        }
    },
    {
        name: 'process_contract_action',
        description: 'Гэрээний процесс: гарын үсэг, төлбөр, цуцлалт. Байр болон лийдийн статусыг автоматаар шинэчилнэ. ЗӨВХӨН Super Admin.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: { type: SchemaType.STRING, enum: ['sign', 'paid', 'cancel'], description: 'sign=гэрээ гарын үсэг, paid=бүрэн төлбөр, cancel=цуцлах' },
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID (байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' }
            },
            required: ['action']
        }
    },
    {
        name: 'create_property',
        description: 'Шинэ үл хөдлөх хөрөнгө (байр) нэмэх. Бичих эрхтэй ажилтан ашиглана. Үйлдэл хийхээс өмнө хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: 'Байрны нэр' },
                type: { type: SchemaType.STRING, enum: ['apartment', 'house', 'office', 'land', 'commercial'], description: 'Байрны төрөл' },
                price: { type: SchemaType.NUMBER, description: 'Үнэ (MNT)' },
                price_per_sqm: { type: SchemaType.NUMBER, description: 'м²-ийн үнэ (MNT)' },
                size_sqm: { type: SchemaType.NUMBER, description: 'Талбай (м²)' },
                rooms: { type: SchemaType.NUMBER, description: 'Өрөөний тоо' },
                district: { type: SchemaType.STRING, description: 'Дүүрэг/Байршил' },
                address: { type: SchemaType.STRING, description: 'Хаяг' },
                description: { type: SchemaType.STRING, description: 'Тайлбар' },
                status: { type: SchemaType.STRING, enum: ['available', 'reserved', 'sold', 'rented', 'barter'], description: 'Статус (default: available)' }
            },
            required: ['name', 'type', 'price']
        }
    },
    {
        name: 'create_lead',
        description: 'Шинэ лийд/сонирхогч үүсгэх. Бичих эрхтэй ажилтан ашиглана. Үйлдэл хийхээс өмнө хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаар' },
                customer_email: { type: SchemaType.STRING, description: 'Имэйл' },
                status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Статус (default: new)' },
                source: { type: SchemaType.STRING, enum: ['messenger', 'instagram', 'website', 'referral', 'phone', 'facebook_ads', 'google_ads', 'other'], description: 'Эх үүсвэр' },
                budget_min: { type: SchemaType.NUMBER, description: 'Доод төсөв (MNT)' },
                budget_max: { type: SchemaType.NUMBER, description: 'Дээд төсөв (MNT)' },
                preferred_district: { type: SchemaType.STRING, description: 'Сонирхсон дүүрэг' },
                preferred_rooms: { type: SchemaType.NUMBER, description: 'Сонирхсон өрөөний тоо' },
                notes: { type: SchemaType.STRING, description: 'Тэмдэглэл' }
            },
            required: ['customer_name']
        }
    },
    {
        name: 'create_customer',
        description: 'Шинэ харилцагч үүсгэх. Утас/имэйлээр давхардлыг шалгана. Үйлдэл хийхээс өмнө хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                phone: { type: SchemaType.STRING, description: 'Утас' },
                email: { type: SchemaType.STRING, description: 'Имэйл' },
                address: { type: SchemaType.STRING, description: 'Хаяг' },
                notes: { type: SchemaType.STRING, description: 'Тэмдэглэл' }
            },
            required: ['name']
        }
    }
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteTools: any[] = [
    {
        name: 'delete_property',
        description: 'Байрыг устгах (soft delete — сэргээх боломжтой). Устгах эрхтэй ажилтан ашиглана. Хэрэглэгчээс заавал баталгаажуулалт авна. Шалтгаан/гэрээний баримтын линк хавсаргаж болно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                reason: { type: SchemaType.STRING, description: 'Устгах шалтгаан' },
                document_url: { type: SchemaType.STRING, description: 'Холбогдох баримт/гэрээний зургийн линк' }
            }
        }
    },
    {
        name: 'delete_lead',
        description: 'Лийдийг устгах (soft delete — сэргээх боломжтой). Устгах эрхтэй ажилтан ашиглана. Хэрэглэгчээс заавал баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэрээр хайх' },
                reason: { type: SchemaType.STRING, description: 'Устгах шалтгаан' }
            }
        }
    }
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminTools: any[] = [
    {
        name: 'invite_user',
        description: 'Шинэ хэрэглэгчийг имэйлээр урьж, дүр (role) болон дэлгүүрийн гишүүнчлэл онооно. ЗӨВХӨН super_admin. Хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                email: { type: SchemaType.STRING, description: 'Урих хэрэглэгчийн имэйл' },
                role: { type: SchemaType.STRING, description: 'Оноох дүр: admin, sales_manager, marketing, finance_manager, accountant, viewer гэх мэт (default: viewer)' },
                shop_id: { type: SchemaType.STRING, description: 'Дэлгүүрийн ID (default: одоогийн дэлгүүр)' }
            },
            required: ['email']
        }
    },
    {
        name: 'assign_role',
        description: 'Бүртгэлтэй хэрэглэгчид (имэйлээр) дүр оноох/солих. ЗӨВХӨН super_admin. Хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                email: { type: SchemaType.STRING, description: 'Хэрэглэгчийн имэйл' },
                role: { type: SchemaType.STRING, description: 'Шинэ дүр (role нэр)' }
            },
            required: ['email', 'role']
        }
    },
    {
        name: 'create_role',
        description: 'Шинэ дүр (role) ба модулийн эрхүүдийг үүсгэх. ЗӨВХӨН super_admin. Хэрэглэгчээс баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: 'Дүрийн систем нэр (англиар, жишээ: junior_sales)' },
                display_name_mn: { type: SchemaType.STRING, description: 'Монгол нэр' },
                display_name: { type: SchemaType.STRING, description: 'Англи харагдах нэр' },
                description: { type: SchemaType.STRING, description: 'Тайлбар' },
                can_write: { type: SchemaType.BOOLEAN, description: 'Бичих эрх' },
                can_delete: { type: SchemaType.BOOLEAN, description: 'Устгах эрх' },
                can_access_admin: { type: SchemaType.BOOLEAN, description: 'Админ хандах эрх' },
                modules: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Эрх олгох модулиуд: dashboard, properties, leads, viewings, contracts, customers, inbox, reports, marketing-roi, surveys, ai-assistant, ai-settings, settings' }
            },
            required: ['name', 'display_name_mn']
        }
    }
];

export const WRITE_TOOL_NAMES = ['update_property_status', 'update_property_price', 'update_lead_status', 'add_lead_note', 'process_contract_action', 'create_property', 'create_lead', 'create_customer'];
export const DELETE_TOOL_NAMES = ['delete_property', 'delete_lead'];
export const ADMIN_TOOL_NAMES = ['invite_user', 'assign_role', 'create_role'];

/** Бодит өгөгдөл өөрчилдөг (баталгаажуулалт шаардах) бүх tool. */
export const MUTATING_TOOL_NAMES = [...WRITE_TOOL_NAMES, ...DELETE_TOOL_NAMES, ...ADMIN_TOOL_NAMES];
