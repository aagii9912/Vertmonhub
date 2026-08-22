/**
 * Data Assistant Tool Definitions (Gemini Function Calling)
 * 
 * Эрхийн загвар (executeDataTool дээр хэрэгждэг — src/lib/ai/data-assistant/index.ts):
 *   • read   — тухайн модулийн эрхтэй БҮХ хэрэглэгч (TOOL_MODULE_MAP-аар шалгагдана)
 *   • write  — perms.canWrite + модулийн эрх
 *   • delete — perms.canDelete + модулийн эрх (зөөлөн устгал)
 *   • admin  — зөвхөн role === 'super_admin'
 * Мутац хийх tool бүр confirm-gate дамжина (confirm=false үед зөвхөн урьдчилан харах).
 */

import { SchemaType } from '@google/generative-ai';

 
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
    },
    {
        name: 'get_marketing_summary',
        description: 'Маркетингийн нэгтгэл: зар сурталчилгааны кампанит ажил (зарцуулалт, харагдалт, клик, хөрвүүлэлт, CTR, CPA) ба сошиал постын гүйцэтгэл.',
        parameters: { type: SchemaType.OBJECT, properties: {} }
    },
    {
        name: 'get_marketing_budget_status',
        description: 'Маркетингийн ТӨСВИЙН байдал: сар бүрийн төсөв vs бодит зарцуулалт vs борлуулалтын орлого (гэрээний дүн), төлөв (ok=ногоон <80%, warn=шар 80-100%, over=улаан >100%), сувгийн зарцуулалтын задаргаа, өгөөж (ROI). Төсөв хэтэрсэн үү, хэр зарцуулсан бэ гэх асуултад.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                year: { type: SchemaType.NUMBER, description: 'Он (default: энэ он)' }
            }
        }
    },
    {
        name: 'get_market_indicators',
        description: 'Зах зээлийн үзүүлэлт: ипотекийн зээлийн хүү, банкны нөхцөл, макро мэдээлэл (судалгааны хэсэгт бүртгэсэн). Ипотек, банк, зээлийн нөхцөлтэй холбоотой асуултад.',
        parameters: { type: SchemaType.OBJECT, properties: {} }
    },
    {
        name: 'get_my_day',
        description: 'МЕНЕЖЕРИЙН ӨДРИЙН ТӨЛӨВЛӨГӨӨ: өнөөдрийн уулзалтууд, эргэж холбогдох ёстой (хугацаа хэтэрсэн ба өнөөдрийн) лийдүүд, дуусаагүй ажлууд, хараахан хөндөөгүй шинэ лийдүүд. «Өнөөдөр юу хийх вэ?», «Юунаас эхлэх вэ?», «Маргааш юу байна?» гэсэн асуултад ЭНЭ tool-ыг ашигла.',
        parameters: { type: SchemaType.OBJECT, properties: {} }
    },
    {
        name: 'list_my_leads',
        description: 'ЗӨВХӨН нэвтэрсэн менежерийн лийдүүд. «Миний лийдүүд», «би хэдэн лийдтэй вэ», «хэнд удаан залгаагүй байна» гэсэн асуултад. list_leads нь дэлгүүр даяарх лийдийг буцаадаг тул хувийн асуултад ЭНЭ tool-ыг ашигла.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Төлөвөөр шүүх' },
                source: { type: SchemaType.STRING, description: 'Эх үүсвэрээр шүүх' },
                stale_days: { type: SchemaType.NUMBER, description: 'Хэдэн хоног хөндөөгүй лийдүүдийг шүүх (ж: 5 = 5 хоног хөндөөгүй)' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн лийд авах (default: 20)' }
            }
        }
    },
    {
        name: 'list_viewings',
        description: 'УУЛЗАЛТЫН ХУВААРЬ. «Маргааш хэдэн уулзалттай вэ», «энэ долоо хоногийн үзлэгүүд», «өнөөдрийн уулзалт» гэсэн асуултад. Анхдагчаар зөвхөн өөрийн уулзалт (mine=false өгвөл бүх менежерийнх).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from: { type: SchemaType.STRING, description: 'Эхлэх огноо YYYY-MM-DD (default: өнөөдөр)' },
                days: { type: SchemaType.NUMBER, description: 'Хэдэн хоногийн хуваарь (default: 7)' },
                status: { type: SchemaType.STRING, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], description: 'Төлөвөөр шүүх' },
                mine: { type: SchemaType.BOOLEAN, description: 'false өгвөл бүх менежерийн уулзалт (default: true)' }
            }
        }
    }
];

 
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
        name: 'update_unit_status',
        description: 'Нэгжийн (property_units — Мандала Гарден маягийн бодит нөөц: ээлж→блок→нэгж) төлөвийг өөрчлөх. Байр/нэгжийг зарагдсан (sold), захиалсан (ordered), баталгаажсан (reserved), хүлээлгэн өгсөн (handed_over) болгоно. Мандала Гарден-ий байрны төлөв өөрчлөхөд ЭНЭ tool-ыг ашиглана (update_property_status биш).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                unit_id: { type: SchemaType.STRING, description: 'Нэгжийн ID' },
                code: { type: SchemaType.STRING, description: 'Нэгжийн код (жишээ: 201-440, 1489-1)' },
                unit_number: { type: SchemaType.STRING, description: 'Шинэ тоот' },
                block: { type: SchemaType.STRING, description: 'Блок/цамхаг (301, 302...) — олон нэгж олдвол тодруулахад' },
                phase: { type: SchemaType.STRING, description: 'Ээлж (Zoo Garden, Water Garden...)' },
                new_status: { type: SchemaType.STRING, enum: ['available', 'reserved', 'ordered', 'sold', 'handed_over'], description: 'Шинэ төлөв' }
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
        description: 'Гэрээний процесс: гарын үсэг (sign), бүрэн төлбөр (paid), цуцлалт (cancel). Нэгж/байр, гэрээ болон лийдийн статусыг автоматаар шинэчилнэ. Мандала Гарден-д НЭГЖийг код/блокоор (unit), гэрээг дугаараар (contract_number) заана. ЗӨВХӨН Super Admin.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: { type: SchemaType.STRING, enum: ['sign', 'paid', 'cancel'], description: 'sign=гэрээ гарын үсэг, paid=бүрэн төлбөр, cancel=цуцлах' },
                code: { type: SchemaType.STRING, description: 'Нэгжийн код (property_units, жишээ: 201-440)' },
                unit_number: { type: SchemaType.STRING, description: 'Нэгжийн шинэ тоот' },
                block: { type: SchemaType.STRING, description: 'Блок/цамхаг — олон нэгж олдвол тодруулахад' },
                phase: { type: SchemaType.STRING, description: 'Ээлж (Zoo Garden...)' },
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                property_id: { type: SchemaType.STRING, description: 'Listing байрны ID (property_units биш үед)' },
                property_name: { type: SchemaType.STRING, description: 'Listing байрны нэр' },
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
    },
    {
        name: 'schedule_viewing',
        description: 'Үл хөдлөхийн уулзалт товлох. Бичих эрхтэй ажилтан ашиглана. Баталгаажуулалт авна. Борлуулалтын менежерийн нэрээр хадгална.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                scheduled_at: { type: SchemaType.STRING, description: 'Уулзалтын огноо/цаг (ISO эсвэл "2026-06-20 14:00")' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр (лийдтэй холбоход)' },
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID (байвал)' },
                notes: { type: SchemaType.STRING, description: 'Тэмдэглэл' }
            },
            required: ['scheduled_at']
        }
    },
    {
        name: 'create_contract',
        description: 'Шинэ үл хөдлөхийн гэрээ үүсгэх. Бичих эрхтэй ажилтан ашиглана. Баталгаажуулалт авна. Борлуулалтын менежерийн нэрээр хадгална.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                customer_phone: { type: SchemaType.STRING, description: 'Утас' },
                total_price: { type: SchemaType.NUMBER, description: 'Нийт үнэ (MNT)' },
                block_name: { type: SchemaType.STRING, description: 'Төсөл/блокийн нэр' },
                unit_number: { type: SchemaType.STRING, description: 'Байрны дугаар' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                sales_channel: { type: SchemaType.STRING, description: 'Борлуулалтын суваг (default: ПРОПЕРТИС)' },
                product_type: { type: SchemaType.STRING, enum: ['residential', 'parking', 'industry', 'commercial'], description: 'Бүтээгдэхүүний төрөл (default: residential)' },
                lead_id: { type: SchemaType.STRING, description: 'Холбогдох лийдийн ID' },
                customer_id: { type: SchemaType.STRING, description: 'Холбогдох харилцагчийн ID' }
            },
            required: ['customer_name']
        }
    },
    {
        name: 'create_social_post',
        description: 'Сошиал постын ноорог эсвэл товлосон пост үүсгэх (DB-д хадгална, FB-д шууд нийтлэхгүй). Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                content: { type: SchemaType.STRING, description: 'Постын текст' },
                platform: { type: SchemaType.STRING, enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'], description: 'Суваг (default: facebook)' },
                media_url: { type: SchemaType.STRING, description: 'Зургийн URL (заавал биш)' },
                scheduled_at: { type: SchemaType.STRING, description: 'Товлох огноо/цаг (ISO). Байвал scheduled, үгүй бол draft' }
            },
            required: ['content']
        }
    },
    {
        name: 'remember_fact',
        description: 'Төслийн талаар чухал баримт/тохиргоог урт хугацааны санах ойд хадгалах (дараагийн ярианд автоматаар санана). Жишээ: "комисс: 2%", "ажлын цаг: 09-18".',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                key: { type: SchemaType.STRING, description: 'Богино түлхүүр (жишээ: комисс, ажлын цаг)' },
                value: { type: SchemaType.STRING, description: 'Утга' }
            },
            required: ['key', 'value']
        }
    },
    {
        name: 'bulk_update_leads',
        description: 'Олон лийдийн статусыг нэг дор шинэчлэх. from_status (тухайн статустай бүгд) эсвэл lead_ids (таслалаар) -ээр сонгоно. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from_status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Энэ статустай бүх лийдийг сонгох' },
                lead_ids: { type: SchemaType.STRING, description: 'Лийдийн ID-ууд (таслалаар)' },
                new_status: { type: SchemaType.STRING, enum: ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'], description: 'Шинэ статус' }
            },
            required: ['new_status']
        }
    },
    {
        name: 'attach_file',
        description: 'Хэрэглэгчийн чатад оруулсан файл/зургийг тодорхой бичлэгт (байр/лийд/харилцагч/гэрээ) хавсаргах. file_url-ийг хэрэглэгчийн хавсаргасан файлын мэдээллээс ав. Байрны зураг бол зургийн санд нь нэмэгдэнэ. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                entity_type: { type: SchemaType.STRING, enum: ['property', 'lead', 'customer', 'contract'], description: 'Хавсаргах бичлэгийн төрөл' },
                entity_id: { type: SchemaType.STRING, description: 'Бичлэгийн ID (мэдэж байвал)' },
                entity_name: { type: SchemaType.STRING, description: 'Байр/лийд/харилцагчийн нэрээр хайх' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар (entity_type=contract үед)' },
                file_url: { type: SchemaType.STRING, description: 'Хавсаргасан файлын URL (чатын хавсралтаас)' },
                file_name: { type: SchemaType.STRING, description: 'Файлын нэр' },
                mime_type: { type: SchemaType.STRING, description: 'Файлын MIME төрөл (жишээ: image/jpeg, application/pdf)' }
            },
            required: ['entity_type', 'file_url']
        }
    },
    {
        name: 'log_activity',
        description: 'ДУУДЛАГА / уулзалт / мессеж / тэмдэглэлийг бүртгэх — менежерийн өдрийн ажлын гол үйлдэл. «Болдод залгасан, авсангүй», «Сараатай уулзлаа», «маргааш эргэж залгана» гэх мэт ярианаас энэ tool-ыг дуудна. next_followup_days өгвөл дараагийн дагалтыг мөн товлоно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэрээр лийд хайх (lead_id мэдэхгүй үед)' },
                kind: { type: SchemaType.STRING, enum: ['call', 'sms', 'messenger', 'meeting', 'note'], description: 'Үйлдлийн төрөл (default: call)' },
                outcome: { type: SchemaType.STRING, enum: ['connected', 'no_answer', 'busy', 'wrong_number', 'scheduled', 'n/a'], description: 'Үр дүн — холбогдсон эсэх' },
                note: { type: SchemaType.STRING, description: 'Чөлөөт тэмдэглэл' },
                duration_sec: { type: SchemaType.NUMBER, description: 'Дуудлагын үргэлжлэх хугацаа (секунд)' },
                next_followup_days: { type: SchemaType.NUMBER, description: 'Хэдэн хоногийн дараа эргэж холбогдох (ж: 1 = маргааш)' }
            }
        }
    },
    {
        name: 'update_viewing',
        description: 'Уулзалтын ЦАГ/тэмдэглэл/төлөвийг өөрчлөх (хойшлуулах). «Уулзалтыг маргааш 3 цаг болгоё» гэх мэт. Уулзалт устгаад дахин үүсгэхийн оронд ЭНЭ tool-ыг ашигла.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                viewing_id: { type: SchemaType.STRING, description: 'Уулзалтын ID (list_viewings-ээс)' },
                scheduled_at: { type: SchemaType.STRING, description: 'Шинэ огноо/цаг ISO форматаар' },
                notes: { type: SchemaType.STRING, description: 'Тэмдэглэл' },
                status: { type: SchemaType.STRING, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], description: 'Төлөв' }
            },
            required: ['viewing_id']
        }
    },
    {
        name: 'complete_viewing',
        description: 'Уулзалтыг ДҮГНЭЖ хаах: ирсэн эсэх, сонирхлын түвшин (1-5), тэмдэглэл. «Үзлэг боллоо, их сонирхсон», «ирсэнгүй» гэх мэт.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                viewing_id: { type: SchemaType.STRING, description: 'Уулзалтын ID' },
                outcome: { type: SchemaType.STRING, enum: ['attended', 'no_show', 'cancelled'], description: 'Үр дүн (default: attended)' },
                interest_level: { type: SchemaType.NUMBER, description: 'Сонирхлын түвшин 1-5' },
                notes: { type: SchemaType.STRING, description: 'Харилцагчийн санал/тэмдэглэл' }
            },
            required: ['viewing_id']
        }
    },
    {
        name: 'set_lead_followup',
        description: 'Лийд дээр ДАРААГИЙН ДАГАЛТЫН огноо тавих эсвэл цуцлах. «Батыг 3 хоногийн дараа эргэж хараарай» гэх мэт. days эсвэл at-ын аль нэгийг өг; аль нь ч байхгүй бол цуцална.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                days: { type: SchemaType.NUMBER, description: 'Хэдэн хоногийн дараа (ж: 1 = маргааш 10:00)' },
                at: { type: SchemaType.STRING, description: 'Тодорхой огноо/цаг ISO форматаар' }
            },
            required: ['lead_id']
        }
    },
    {
        name: 'reassign_lead',
        description: 'Лийдийг ӨӨР МЕНЕЖЕРТ шилжүүлэх. «Энэ харилцагчийг Болдод өгье» гэх мэт. Хүлээн авагчийг борлуулалтын бүртгэлээс баталгаажуулна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                to_manager: { type: SchemaType.STRING, description: 'Хүлээн авах менежерийн нэр (бүртгэлд байгаа нэр)' }
            },
            required: ['lead_id', 'to_manager']
        }
    },
    {
        name: 'create_task',
        description: 'Өөртөө ХИЙХ АЖИЛ нэмэх (+ push сануулга). «Маргааш гэрээ бэлдэхээ санууллаа», «жагсаалтдаа нэмээрэй» гэх мэт. remind=true өгвөл хугацаанаас 2 цагийн өмнө сануулна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING, description: 'Ажлын нэр' },
                note: { type: SchemaType.STRING, description: 'Дэлгэрэнгүй тэмдэглэл' },
                due_in_days: { type: SchemaType.NUMBER, description: 'Хэдэн хоногийн дараа дуусах (ж: 1 = маргааш 18:00)' },
                due_at: { type: SchemaType.STRING, description: 'Дуусах хугацаа ISO форматаар' },
                remind: { type: SchemaType.BOOLEAN, description: 'true = хугацаанаас 2 цагийн өмнө сануулга' },
                remind_at: { type: SchemaType.STRING, description: 'Сануулах тодорхой цаг ISO форматаар' },
                priority: { type: SchemaType.STRING, enum: ['low', 'normal', 'high'], description: 'Ач холбогдол' }
            },
            required: ['title']
        }
    },
    {
        name: 'complete_task',
        description: 'Хийх ажлыг ДУУССАН болгох. «Гэрээ бэлдэх ажлыг хийчихлээ» гэх мэт. task_id мэдэхгүй бол нэрээр нь хай.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                task_id: { type: SchemaType.STRING, description: 'Ажлын ID' },
                title: { type: SchemaType.STRING, description: 'Ажлын нэрээр хайх' }
            }
        }
    }
];

 
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
    },
    {
        name: 'delete_viewing',
        description: 'Товлогдсон уулзалтыг устгах/цуцлах (soft delete — сэргээх боломжтой). Устгах эрхтэй ажилтан. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                viewing_id: { type: SchemaType.STRING, description: 'Уулзалтын ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр товлогдсон уулзалтыг хайх' },
                reason: { type: SchemaType.STRING, description: 'Устгах шалтгаан' }
            }
        }
    },
    {
        name: 'delete_contract',
        description: 'Гэрээг устгах/цуцлах (soft delete — сэргээх боломжтой). Устгах эрхтэй ажилтан. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэрээр хайх' },
                reason: { type: SchemaType.STRING, description: 'Устгах шалтгаан' }
            }
        }
    },
    {
        name: 'delete_customer',
        description: 'Харилцагчийг устгах (soft delete — сэргээх боломжтой). Устгах эрхтэй ажилтан. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                customer_id: { type: SchemaType.STRING, description: 'Харилцагчийн ID' },
                name: { type: SchemaType.STRING, description: 'Нэрээр хайх' },
                phone: { type: SchemaType.STRING, description: 'Утсаар хайх' },
                reason: { type: SchemaType.STRING, description: 'Устгах шалтгаан' }
            }
        }
    }
];

 
export const adminTools: any[] = [
    {
        name: 'invite_user',
        description: 'Шинэ хэрэглэгчийг түр нууц үгтэй үүсгэж, дүр (role) болон төслийн гишүүнчлэл онооно. Имэйл автоматаар илгээгдэхгүй — нэвтрэх мэдээлэл (имэйл+түр нууц үг+линк) буцаж ирэх тул админ тухайн хүнд дамжуулна. ЗӨВХӨН super_admin. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                email: { type: SchemaType.STRING, description: 'Урих хэрэглэгчийн имэйл' },
                role: { type: SchemaType.STRING, description: 'Оноох дүр: admin, sales_manager, marketing, finance_manager, accountant, viewer гэх мэт (default: viewer)' },
                shop_id: { type: SchemaType.STRING, description: 'Төслийн ID (default: одоогийн төсөл)' }
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

export const WRITE_TOOL_NAMES = ['update_property_status', 'update_unit_status', 'update_property_price', 'update_lead_status', 'add_lead_note', 'process_contract_action', 'create_property', 'create_lead', 'create_customer', 'schedule_viewing', 'create_contract', 'attach_file', 'bulk_update_leads', 'create_social_post', 'remember_fact',
    // Менежерийн өдрийн ажлын tool-ууд (2026-08-22)
    'log_activity', 'update_viewing', 'complete_viewing', 'set_lead_followup',
    'reassign_lead', 'create_task', 'complete_task'];
export const DELETE_TOOL_NAMES = ['delete_property', 'delete_lead', 'delete_viewing', 'delete_contract', 'delete_customer'];
export const ADMIN_TOOL_NAMES = ['invite_user', 'assign_role', 'create_role'];

/** Бодит өгөгдөл өөрчилдөг (баталгаажуулалт шаардах) бүх tool. */
export const MUTATING_TOOL_NAMES = [...WRITE_TOOL_NAMES, ...DELETE_TOOL_NAMES, ...ADMIN_TOOL_NAMES];

/**
 * Tool → шаардлагатай МОДУЛИЙН эрхүүд (аль нэгийг нь эзэмшсэн байхад хангалттай).
 *
 * ЯАГААД: өмнө нь AI зам зөвхөн canWrite/canDelete/super_admin-ыг шалгаж,
 * `permissions.modules`-ыг ОГТ хардаггүй байсан тул хажуугийн цэсэнд нуугдсан
 * хэсгүүдийн өгөгдлийг чатаар чөлөөтэй уншиж болдог байв (жишээ: маркетингийн
 * ролийн хэрэглэгч бүх гэрээний жагсаалт).
 *
 * Энд БАЙХГҮЙ tool нь модулийн хязгаargүй гэсэн үг (ж: remember_fact).
 * ADMIN_TOOL_NAMES нь тусад нь super_admin-аар хаагдана.
 */
export const TOOL_MODULE_MAP: Record<string, string[]> = {
    // Байр / үл хөдлөх
    list_properties: ['properties'],
    compare_properties: ['properties'],
    create_property: ['properties'],
    update_property_status: ['properties'],
    update_property_price: ['properties'],
    update_unit_status: ['properties'],
    delete_property: ['properties'],

    // Лийд
    list_leads: ['leads'],
    list_my_leads: ['leads'],
    get_lead_details: ['leads'],
    create_lead: ['leads'],
    update_lead_status: ['leads'],
    add_lead_note: ['leads'],
    bulk_update_leads: ['leads'],
    delete_lead: ['leads'],
    set_lead_followup: ['leads'],
    reassign_lead: ['leads'],
    log_activity: ['leads', 'customers'],

    // Харилцагч
    get_customer_insights: ['customers'],
    create_customer: ['customers'],
    delete_customer: ['customers'],

    // Уулзалт
    list_viewings: ['viewings'],
    schedule_viewing: ['viewings'],
    update_viewing: ['viewings'],
    complete_viewing: ['viewings'],
    delete_viewing: ['viewings'],

    // Гэрээ / санхүү
    list_contracts: ['contracts', 'finance'],
    get_contract_details: ['contracts', 'finance'],
    get_contracts_summary: ['contracts', 'finance'],
    create_contract: ['contracts', 'finance'],
    process_contract_action: ['contracts', 'finance'],
    delete_contract: ['contracts', 'finance'],

    // Аналитик
    get_dashboard_stats: ['dashboard', 'reports'],
    get_sales_summary: ['reports', 'contracts', 'finance'],
    get_sales_forecast: ['reports', 'contracts', 'finance'],

    // Маркетинг
    get_marketing_summary: ['marketing', 'marketing-roi'],
    get_marketing_budget_status: ['marketing', 'marketing-roi'],
    get_market_indicators: ['marketing', 'marketing-roi'],
    create_social_post: ['marketing', 'marketing-roi'],

    // Хувийн ажлын талбар — бүх нэвтэрсэн ажилтанд нээлттэй (dashboard/tasks)
    get_my_day: ['dashboard', 'tasks'],
    create_task: ['dashboard', 'tasks'],
    complete_task: ['dashboard', 'tasks'],

    // Файл хавсаргалт — зорилтот entity-ийн эрхийг функц дотор дахин шалгана
    attach_file: ['properties', 'leads', 'customers', 'contracts'],
};
