/**
 * Data Assistant tool-уудын schema — JSON Schema маягийн `parameters`
 * (`lib/ai/claude/tools.ts` → model-ийн `input_schema` болгож хөрвүүлнэ).
 * Эрхийн төрөл, модуль, AUTO, төслийн хүрээ нь `lib/ai/tool-catalog.ts`-д; доорх
 * бүлэглэл зөвхөн уншихад хялбар болгох зорилготой.
 */

import { SPEND_CHANNELS } from '@/lib/marketing/budget';
import { ACTIVE_STATUSES, LEAD_STATUSES, SOURCES } from '@/lib/leads/labels';

const SchemaType = { OBJECT: 'object', STRING: 'string', NUMBER: 'number', INTEGER: 'integer', BOOLEAN: 'boolean', ARRAY: 'array' } as const;

export interface ToolDefinition {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}

 
const readDefinitions: ToolDefinition[] = [
    {
        name: 'list_lead_projects', description: 'Лид бүртгэхэд ашиглах эрхтэй төслийн UUID ба нэрийг авна. Төслийг таамгаар сонгохгүй; хэрэглэгчээс сонголтыг тодруулна.',
        parameters: { type: SchemaType.OBJECT, properties: {} },
    },
    {
        name: 'get_marketing_performance',
        description: 'Маркетингийн нэгдсэн самбар, албаны KPI-ийн зургаан ангиллын жин ба бодит нотолгоо, багийн гүйцэтгэл: төсөл/суваг/кампанит ажил/контентын Lead–Sales–Deal, өмнөх хугацааны харьцуулалт, маркетингийн менежерийн сарын зорилт, төсөв, зардал, хэтрэлт. Dashboard-ийн AI дүгнэлтэд энэ tool ашиглана. basis, quality, KPI-ийн дутуу шалгуурыг тайлбартаа хадгал; дутуу зорилтыг 0 гэж үзэхгүй. Qualified Lead, Site Visit, нийлбэр оноог таамгаар гаргахгүй.',
        parameters: { type: SchemaType.OBJECT, properties: {
            from: { type: SchemaType.STRING, description: 'Эхлэх өдөр YYYY-MM-DD' },
            to: { type: SchemaType.STRING, description: 'Дуусах өдөр YYYY-MM-DD, оруулна' },
            project: { type: SchemaType.STRING, description: 'Төслийн UUID; орхивол бүх төсөл' },
        } },
    },
    {
        name: 'get_operations_report',
        description: 'Байгууллагын үйл ажиллагааны тайланг системийн бодит бүртгэлээс нэгтгэнэ: хугацааны гэрээний дүн ба сарын зорилт, огноотой гүйлгээний мөнгөн урсгал, урьдчилгаа гэж ангилсан хугацааны мөнгөн орлого, гэрээнд хадгалсан урьдчилгааны импорт/өмнөх бүртгэлийн дүн, эзэнгүй/холбоогүй/дараагийн алхамгүй/хугацаа хэтэрсэн лид. Орлого, урьдчилгаа, Excel-гүй тайлан хүсэхэд ашигла. Өгөгдлийн хамрах хүрээ, дутуу бүртгэлийн тайлбарыг хариундаа заавал хадгал. Ангилаагүй орлогыг урьдчилгаа гэж таамаглахгүй. Гэрээнд хадгалсан урьдчилгааг шинэ гүйлгээ автоматаар өөрчлөхгүй; хугацааны урьдчилгаатай нэмж нийлбэрлэхгүй. Мөнгөн урсгал зөвхөн finance эрхтэй хүнд ирнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from: { type: SchemaType.STRING, description: 'Эхлэх өдөр YYYY-MM-DD; орхивол энэ сарын эхэн' },
                to: { type: SchemaType.STRING, description: 'Дуусах өдөр YYYY-MM-DD, тухайн өдрийг оруулна; орхивол энэ сарын сүүл' },
            },
        },
    },
    {
        name: 'get_dashboard_stats',
        description: 'Самбарын статистик: гэрээний тоо ба нийт үнэ (бодит мөнгөн орлого биш), харилцагч, лийд, орон сууцны нэгжийн нөөц. inventory нь property_units сангийн зөвхөн residential ангиллын нийт/боломжтой/зарагдсан/хүлээгдэж буй тоо, statusCounts-ийг өгнө; зарагдсанд handed_over орно. Хугацаа зөвхөн гэрээ, лийдэд үйлчилнэ; нөөц ба харилцагч нь одоогийн нийт тоо.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                timeRange: { type: SchemaType.STRING, enum: ['today', 'week', 'month', 'year', 'all_time'], description: 'Хугацааны эрээлт' }
            }
        }
    },
    {
        name: 'list_properties',
        description: 'Байрны бодит нөөц ба зарын сангаас хайх. "2 өрөө байр байна уу?" гэхэд rooms=2-оор шууд хайна. Анхдагч төлөв available, нэгжийн ангилал residential. Жагсаалт хязгаартай, нийт тоо биш. Нэгжийн үнэ байхгүй: үнийн шалгууртай үед unverifiedUnits нь төсөвт багтсан гэсэн үг биш, үнийг тодруулна. Дүүргийг зөвхөн бүртгэлтэй төслийн байршлаар батална; байршилгүй нэгж дүүргийн хайлтад орохгүй. Mandala Garden, Mandala Tower, Elysium гэх мэт.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: { type: SchemaType.STRING, description: 'Байрны төрөл: apartment, house, office, land, commercial' },
                status: { type: SchemaType.STRING, enum: ['available', 'reserved', 'ordered', 'sold', 'handed_over', 'rented', 'barter', 'all'], description: 'Анхдагч available (худалдаанд). sold нэгжид handed_over орно. all бүх төлөвийг хайна; rented/barter зөвхөн зарын сан.' },
                min_price: { type: SchemaType.NUMBER, description: 'Хамгийн бага үнэ (MNT)' },
                max_price: { type: SchemaType.NUMBER, description: 'Хамгийн их үнэ (MNT)' },
                rooms: { type: SchemaType.NUMBER, description: 'Өрөөний тоо' },
                district: { type: SchemaType.STRING, description: 'Дүүрэг/Байршил' },
                name_search: { type: SchemaType.STRING, description: 'Төсөл, ээлж, блок, код эсвэл зарын нэрээр хайх (Mandala, Elysium гэх мэт)' },
                category: { type: SchemaType.STRING, enum: ['residential', 'commercial', 'parking', 'industry'], description: 'Нэгжийн ангилал. Анхдагч residential (орон сууц); apartment=residential, office/commercial=commercial.' },
                phase: { type: SchemaType.STRING, description: 'Нэгжийн ээлжийн яг бүртгэлтэй нэр (Zoo Garden гэх мэт)' },
                block: { type: SchemaType.STRING, description: 'Нэгжийн блокийн дугаар (201 гэх мэт)' },
                code: { type: SchemaType.STRING, description: 'Нэгжийн яг код (201-440 гэх мэт); ээлж/ангиллаар давхцаж болно' },
                project_id: { type: SchemaType.STRING, description: 'Төслийн ID; тухайн байгууллагын дотор шүүнэ' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн хувилбар харуулах (default 10, дээд 100); нийт нөөцийн тоо биш' }
            }
        }
    },
    {
        name: 'list_leads',
        description: 'Лидийн ажлын жагсаалт: хариуцагч, холбооны цагтай. queue-ээр анхаарах лидүүдийг, manager_name-ээр хариуцагчийг шүүнэ. Буцаасан жагсаалт хязгаартай; байгууллагын нийт тоог get_operations_report-оос авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: LEAD_STATUSES, description: 'Лийдийн статус' },
                source: { type: SchemaType.STRING, enum: ['messenger', 'instagram', 'website', 'referral', 'phone', 'other'], description: 'Эх үүсвэр' },
                urgency: { type: SchemaType.STRING, enum: ['urgent', 'normal', 'flexible'], description: 'Яаралтай эсэх' },
                queue: { type: SchemaType.STRING, enum: ['unassigned', 'uncontacted', 'no_followup', 'overdue'], description: 'Хариуцагчгүй, холбоо бүртгээгүй, дараагийн алхамгүй, хугацаа хэтэрсэн лидүүд' },
                manager_name: { type: SchemaType.STRING, description: 'Хариуцагчийн канон нэр (яг бүртгэлээр)' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн лид харуулах (default 10, дээд 100); нийт тоо биш' }
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
                customer_search: { type: SchemaType.STRING, description: 'Харилцагчийн нэр/утас/регистер дугаараар хайх (шилжүүлсэн гэрээний өмнөх эзэмшигч ч орно)' },
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
        description: 'Нэг гэрээний бүх мэдээлэл авах: үнийн задаргаа (1-р үнэ, м²-ийн үнэ, нийт, төлсөн, үлдэгдэл), төлбөрийн нөхцөл, урьдчилгаа, гарын үсэг/ашиглалтын огноо, борлуулагч менежер, банкны/бартерын төлөв, эзэмшигчийн түүх (шилжүүлэг/нэр засвар, transfers).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID (UUID)' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_phone: { type: SchemaType.STRING, description: 'Харилцагчийн утсаар (нэг гэрээ олдоно; өмнөх эзэмшигчийн утсаар ч олдоно)' }
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
    }
,
    {
        name: 'list_viewings',
        description: 'Уулзалтын жагсаалт: өнөөдрийн / удахгүй болох / өнгөрсөн. Лид, байр, менежер, статус, сонирхлын оноотой.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                range: { type: SchemaType.STRING, enum: ['today', 'upcoming', 'past', 'all'], description: 'Хугацаа (default: upcoming)' },
                status: { type: SchemaType.STRING, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], description: 'Статус' },
                manager: { type: SchemaType.STRING, description: 'Менежерийн нэрээр шүүх' },
                lead_id: { type: SchemaType.STRING, description: 'Тодорхой лидийн уулзалтууд' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн уулзалт (default 20)' }
            }
        }
    },
    {
        name: 'list_my_tasks',
        description: 'Нэвтэрсэн хэрэглэгчийн ХУВИЙН ажлын жагсаалт (to-do). Дуусаагүй (pending) эсвэл дууссан (done).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING, enum: ['pending', 'done', 'all'], description: 'default: pending' },
                limit: { type: SchemaType.NUMBER, description: 'Хэдэн ажил (default 30)' }
            }
        }
    },
    {
        name: 'list_contract_payments',
        description: 'Гэрээний төлбөрийн хуваарь (мөр бүр: дугаар, төлөх огноо, дүн, төлсөн, статус). Гэрээг id/дугаар/харилцагчийн нэрээр олно.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' }
            }
        }
    }
,
    {
        name: 'get_kpi_report',
        description: 'Менежерийн САРЫН KPI тайлан: шинэ лид (статус/эх үүсвэрээр), уулзалт, гэрээ, борлуулалт, дуусгасан ажил, өмнөх сартай харьцуулалт, багийн зорилт. plainText талбар нь хуулах бэлэн тайлан. manager нь зөвхөн админ/тайлангийн эрхтэй хэрэглэгчид ажиллана.',
        parameters: { type: SchemaType.OBJECT, properties: {
            year: { type: SchemaType.NUMBER, description: 'Он (default: одоо)' },
            month: { type: SchemaType.NUMBER, description: 'Сар 1–12 (default: одоо)' },
            manager: { type: SchemaType.STRING, description: 'Менежерийн нэр (өөрийн тайланд хоосон)' } } }
    },
    {
        name: 'get_manager_performance',
        description: 'Бүх менежерийн гүйцэтгэлийн харьцуулалт: гэрээний тоо, борлуулалт, цуглуулалт, үлдэгдэл, цуглуулалтын %, багийн жилийн зорилт/гүйцэтгэл. Лидерборд, «хэн хамгийн сайн» асуултад.',
        parameters: { type: SchemaType.OBJECT, properties: {} }
    },
    {
        name: 'get_export_link',
        description: 'Excel файл татах линк өгнө (properties | leads | customers | contracts | manager). Хэрэглэгч «excel-ээр өг», «татаж авмаар» гэвэл ашигла.',
        parameters: { type: SchemaType.OBJECT, properties: { type: { type: SchemaType.STRING, enum: ['properties', 'leads', 'customers', 'contracts', 'manager'], description: 'Юуг экспортлох' } }, required: ['type'] }
    },
    {
        name: 'list_marketing_spend',
        description: 'Маркетингийн гар бүртгэсэн зарцуулалтын жагсаалт (сувгаар нэгтгэлтэй) — жил/сараар.',
        parameters: { type: SchemaType.OBJECT, properties: { year: { type: SchemaType.NUMBER }, month: { type: SchemaType.NUMBER, description: '1–12 (заавал биш)' } } }
    },
];



 
const writeDefinitions: ToolDefinition[] = [
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
        description: 'Лидийн төлөв өөрчлөх. closed_won нь хүчинтэй дугаар/дүнтэй гэрээ, closed_lost нь lost_reason шаарддаг. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' },
                new_status: { type: SchemaType.STRING, enum: LEAD_STATUSES, description: 'Шинэ статус' },
                lost_reason: { type: SchemaType.STRING, description: 'closed_lost үед алдсан бодит шалтгаан; хэрэглэгчээс тодруулна, таамаглахгүй' }
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
                customer_name: { type: SchemaType.STRING, description: 'Хэрэглэгчийн нэрээр хайх' },
                lost_reason: { type: SchemaType.STRING, description: 'cancel-тай хамт лид хаахад алдсан шалтгаан шаардлагатай' }
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
        description: 'Шинэ лид үүсгэх. Нэвтэрсэн ажилтан идэвхтэй борлуулалтын менежер бол өөрт нь хариуцуулна; бусад ажилтан үүсгэвэл хариуцагчгүй үлдээнэ. Үйлдэл хийхээс өмнө баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                project_id: { type: SchemaType.STRING, description: 'Төслийн UUID; list_lead_projects-оос авч хэрэглэгчээр сонгуулна' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаар' },
                customer_email: { type: SchemaType.STRING, description: 'Имэйл' },
                status: { type: SchemaType.STRING, enum: ACTIVE_STATUSES, description: 'Идэвхтэй төлөв (default: new); үүсгэхдээ хаахгүй' },
                source: { type: SchemaType.STRING, enum: SOURCES, description: 'Эх үүсвэр' },
                budget_min: { type: SchemaType.NUMBER, description: 'Доод төсөв (MNT)' },
                budget_max: { type: SchemaType.NUMBER, description: 'Дээд төсөв (MNT)' },
                preferred_district: { type: SchemaType.STRING, description: 'Сонирхсон дүүрэг' },
                preferred_rooms: { type: SchemaType.NUMBER, description: 'Сонирхсон өрөөний тоо' },
                notes: { type: SchemaType.STRING, description: 'Тэмдэглэл' }
            },
            required: ['customer_name', 'project_id']
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
        description: 'Үл хөдлөхийн уулзалт товлох. Байр сонгоогүй бол property_id/property_name шаардахгүй. Лидийн төлөв, түүхийг шинэчилнэ. Баталгаажуулалт авна. Борлуулалтын менежерийн нэрээр хадгална.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                project_id: { type: SchemaType.STRING, description: 'Төслийн UUID; list_lead_projects-оос авч хэрэглэгчээр сонгуулна' },
                property_id: { type: SchemaType.STRING, description: 'Байрны ID' },
                property_name: { type: SchemaType.STRING, description: 'Байрны нэрээр хайх' },
                scheduled_at: { type: SchemaType.STRING, description: 'Уулзалтын огноо/цаг, цагийн бүстэй ISO 8601 (жишээ: 2026-09-20T14:00:00+08:00)' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр (лийдтэй холбоход)' },
                customer_phone: { type: SchemaType.STRING, description: 'Харилцагчийн утас (нэр давхардвал ялгахад)' },
                lead_id: { type: SchemaType.STRING, description: 'Лийдийн ID (байвал)' },
                meeting_type: { type: SchemaType.STRING, enum: ['new_customer', 'repeat_customer', 'existing_buyer'] },
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
        name: 'transfer_contract',
        description: 'Гэрээг өөр хүний нэр дээр шилжүүлэх (kind=transfer) эсвэл ижил эзэмшигчийн нэрийг засах (kind=rename). Төлсөн дүн, төлбөрийн график, менежер, гэрээний огноо, дугаар хэвээр; түүх, аудит хадгалагдана. Шилжүүлэхэд шинэ эзэмшигчийн нэр, регистр, шалтгаан заавал — хэрэглэгчээс тодруул, бүү зохио. Нэр засвар регистрийг солихгүй (регистр өөр бол kind=transfer). Шилжүүлгийн хураамжийг энд биш add_contract_payment (receipt_kind=other)-оор бүртгэнэ. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                current_holder_name: { type: SchemaType.STRING, description: 'Одоогийн эзэмшигчийн нэрээр гэрээ хайх' },
                kind: { type: SchemaType.STRING, enum: ['transfer', 'rename'], description: 'transfer = өөр хүнд шилжүүлэх, rename = ижил хүний нэр засах' },
                customer_name: { type: SchemaType.STRING, description: 'Шинэ (эсвэл зассан) эзэмшигчийн бүтэн нэр' },
                customer_last_name: { type: SchemaType.STRING, description: 'Овог' },
                customer_first_name: { type: SchemaType.STRING, description: 'Нэр' },
                customer_registration: { type: SchemaType.STRING, description: 'Шинэ эзэмшигчийн регистр/паспорт (transfer үед заавал; rename үед өгөхгүй)' },
                customer_phone: { type: SchemaType.STRING, description: 'Шинэ эзэмшигчийн утас (rename үед зөвхөн хэрэглэгч утсаа солих гэвэл)' },
                effective_date: { type: SchemaType.STRING, description: 'Шилжүүлсэн огноо YYYY-MM-DD (default өнөөдөр)' },
                reason: { type: SchemaType.STRING, description: 'Шалтгаан / тэмдэглэл (transfer үед заавал)' }
            },
            required: ['kind', 'customer_name']
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
        description: '100 хүртэл лидийг идэвхтэй төлөвт нэг дор шинэчлэх. Хаах бол лид тус бүрт update_lead_status ашиглана. from_status эсвэл lead_ids-ээр сонгоно; баталгаажуулсан ID-уудыг л өөрчилнө.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from_status: { type: SchemaType.STRING, enum: LEAD_STATUSES, description: 'Энэ статустай бүх лийдийг сонгох' },
                lead_ids: { type: SchemaType.STRING, description: 'Лийдийн ID-ууд (таслалаар)' },
                new_status: { type: SchemaType.STRING, enum: ACTIVE_STATUSES, description: 'Шинэ идэвхтэй төлөв; бөөнөөр хаахгүй' }
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
    }
,
    {
        name: 'log_call',
        description: 'Лидтэй ЗАЛГАСАН/ярьсныг бүртгэх: ярианы товч + сонголтоор дараагийн холбоо барих цаг. last_contact_at шинэчлэгдэнэ. Эрсдэлгүй — баталгаажуулалтгүй шууд гүйцэтгэгдэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лидийн ID (мэдэгдэж байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Лидийн нэрээр хайх' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх' },
                summary: { type: SchemaType.STRING, description: 'Ярианы товч агуулга (монголоор)' },
                next_followup_at: { type: SchemaType.STRING, description: 'Дараагийн холбоо барих огноо/цаг (ISO 8601, Улаанбаатар +08:00)' }
            },
            required: ['summary']
        }
    },
    {
        name: 'set_followup',
        description: 'Лидийн дараагийн холбоо барих (follow-up) огноог тавих/цуцлах. «Өнөөдөр» дэлгэцийн залгах жагсаалтад гарна. Шууд гүйцэтгэгдэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лидийн ID (мэдэгдэж байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Лидийн нэрээр хайх' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх' },
                next_followup_at: { type: SchemaType.STRING, description: 'ISO 8601 огноо/цаг; цуцлах бол null/хоосон' },
                note: { type: SchemaType.STRING, description: 'Тэмдэглэл (заавал биш)' }
            }
        }
    },
    {
        name: 'assign_lead_manager',
        description: 'Лидийг өөр борлуулалтын менежерт шилжүүлэх/оноох. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                lead_id: { type: SchemaType.STRING, description: 'Лидийн ID (мэдэгдэж байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Лидийн нэрээр хайх' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх' },
                manager_name: { type: SchemaType.STRING, description: 'Шинэ менежерийн нэр (яг roster-ийн нэрээр)' }
            },
            required: ['manager_name']
        }
    },
    {
        name: 'record_viewing_outcome',
        description: 'Болсон уулзалтын ҮР ДҮН бүртгэх: болсон/ирээгүй/цуцалсан, сонирхол 1–5, харилцагчийн санал, дараагийн холбоо. viewing_id мэдэхгүй бол лидийн сүүлийн товлогдсон уулзалтыг олно. Шууд гүйцэтгэгдэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                viewing_id: { type: SchemaType.STRING, description: 'Уулзалтын ID (мэдэгдэж байвал)' },
                lead_id: { type: SchemaType.STRING, description: 'Лидийн ID (мэдэгдэж байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Лидийн нэрээр хайх' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх' },
                status: { type: SchemaType.STRING, enum: ['completed', 'no_show', 'cancelled'], description: 'default: completed' },
                interest_level: { type: SchemaType.NUMBER, description: 'Сонирхол 1–5' },
                feedback: { type: SchemaType.STRING, description: 'Харилцагчийн санал/хүсэлт' },
                notes: { type: SchemaType.STRING, description: 'Менежерийн тэмдэглэл' },
                next_followup_at: { type: SchemaType.STRING, description: 'Дараагийн холбоо (ISO 8601)' }
            }
        }
    },
    {
        name: 'reschedule_viewing',
        description: 'Товлогдсон уулзалтын цагийг зөөх. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                viewing_id: { type: SchemaType.STRING, description: 'Уулзалтын ID' },
                lead_id: { type: SchemaType.STRING, description: 'Лидийн ID (мэдэгдэж байвал)' },
                customer_name: { type: SchemaType.STRING, description: 'Лидийн нэрээр хайх' },
                customer_phone: { type: SchemaType.STRING, description: 'Утасны дугаараар хайх' },
                scheduled_at: { type: SchemaType.STRING, description: 'Шинэ огноо/цаг (ISO 8601, +08:00)' }
            },
            required: ['scheduled_at']
        }
    },
    {
        name: 'create_task',
        description: 'Нэвтэрсэн хэрэглэгчийн ХУВИЙН ажил (to-do) нэмэх; due_at → «Хийх ажлууд» widget, remind_at → push сануулга. Шууд гүйцэтгэгдэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING, description: 'Ажлын гарчиг' },
                note: { type: SchemaType.STRING, description: 'Тайлбар' },
                due_at: { type: SchemaType.STRING, description: 'Дуусах хугацаа (ISO 8601)' },
                remind_at: { type: SchemaType.STRING, description: 'Сануулах цаг (ISO 8601)' }
            },
            required: ['title']
        }
    },
    {
        name: 'complete_task',
        description: 'Хувийн ажлыг дууссан болгох (task_id эсвэл гарчгийн хэсгээр). Шууд гүйцэтгэгдэнэ.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                task_id: { type: SchemaType.STRING, description: 'Ажлын ID' },
                title: { type: SchemaType.STRING, description: 'Гарчгийн хэсэг' }
            }
        }
    },
    {
        name: 'add_contract_payment',
        description: 'Гэрээнд төлбөрийн хуваарийн мөр нэмэх. Төлсөн дүн өгвөл receipt_kind ба payment_method-ийг хэрэглэгчээс тодруулна; бартерыг мөнгөн орлого гэж тооцохгүй. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                amount: { type: SchemaType.NUMBER, description: 'Мөрийн дүн (₮)' },
                due_date: { type: SchemaType.STRING, description: 'Төлөх огноо YYYY-MM-DD (default өнөөдөр)' },
                paid_amount: { type: SchemaType.NUMBER, description: 'Аль хэдийн төлсөн дүн (default 0)' },
                paid_date: { type: SchemaType.STRING, description: 'Төлсөн огноо' },
                payment_method: { type: SchemaType.STRING, description: 'cash, bank, bank_transfer, barter, mortgage; төлсөн дүнтэй бол заавал' },
                receipt_kind: { type: SchemaType.STRING, description: 'advance (урьдчилгаа), installment (хуваарийн төлбөр), other (бусад). Төлсөн дүнтэй бол хэрэглэгчээс тодруулна; нэр/дүнгээр таамаглахгүй.' },
                label: { type: SchemaType.STRING, description: 'Мөрийн нэр (жишээ: Урьдчилгаа)' },
                installment_number: { type: SchemaType.NUMBER, description: 'Хуваарийн дугаар' }
            },
            required: ['amount']
        }
    },
    {
        name: 'mark_payment_paid',
        description: 'Хуваарийн мөрийг ТӨЛСӨН гэж тэмдэглэх (payment_id эсвэл гэрээ + installment_number; өгөхгүй бол эхний төлөгдөөгүй мөр). Төлөлтийн төрөл ба хэлбэр тодорхойгүй бол хэрэглэгчээс асууна; бартер мөнгөн орлого биш. Баталгаажуулалт авна.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                payment_id: { type: SchemaType.STRING, description: 'Хуваарийн мөрийн ID' },
                contract_id: { type: SchemaType.STRING, description: 'Гэрээний ID' },
                contract_number: { type: SchemaType.STRING, description: 'Гэрээний дугаар' },
                customer_name: { type: SchemaType.STRING, description: 'Харилцагчийн нэр' },
                installment_number: { type: SchemaType.NUMBER, description: 'Аль мөр' },
                paid_amount: { type: SchemaType.NUMBER, description: 'Төлсөн дүн (default: мөрийн бүтэн дүн)' },
                paid_date: { type: SchemaType.STRING, description: 'Төлсөн огноо YYYY-MM-DD' },
                payment_method: { type: SchemaType.STRING, description: 'cash, bank, bank_transfer, barter, mortgage. Өгөхгүй бол хадгалсан хэлбэрийг хэрэглэнэ.' },
                receipt_kind: { type: SchemaType.STRING, description: 'advance (урьдчилгаа), installment (хуваарийн төлбөр), other (бусад). Өгөхгүй бол хадгалсан төрлийг хэрэглэнэ; байхгүй бол хэрэглэгчээс асууна.' }
            }
        }
    }
,
    {
        name: 'add_customer_tag',
        description: 'Харилцагчид таг нэмэх (жишээ: vip, hot_lead, interest:3room). Шууд гүйцэтгэгдэнэ.',
        parameters: { type: SchemaType.OBJECT, properties: {
                customer_id: { type: SchemaType.STRING, description: 'Харилцагчийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Нэрээр хайх' },
                phone: { type: SchemaType.STRING, description: 'Утсаар хайх' },
            tag: { type: SchemaType.STRING, description: 'Таг' } }, required: ['tag'] }
    },
    {
        name: 'remove_customer_tag',
        description: 'Харилцагчаас таг хасах. Шууд гүйцэтгэгдэнэ.',
        parameters: { type: SchemaType.OBJECT, properties: {
                customer_id: { type: SchemaType.STRING, description: 'Харилцагчийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Нэрээр хайх' },
                phone: { type: SchemaType.STRING, description: 'Утсаар хайх' },
            tag: { type: SchemaType.STRING, description: 'Таг' } }, required: ['tag'] }
    },
    {
        name: 'reply_to_customer',
        description: 'Харилцагчид Facebook Messenger-ээр ХҮНИЙ хариу илгээх (chat_history-д бичигдэнэ). Гадагш илгээгддэг тул баталгаажуулалт авна.',
        parameters: { type: SchemaType.OBJECT, properties: {
                customer_id: { type: SchemaType.STRING, description: 'Харилцагчийн ID' },
                customer_name: { type: SchemaType.STRING, description: 'Нэрээр хайх' },
                phone: { type: SchemaType.STRING, description: 'Утсаар хайх' },
            message: { type: SchemaType.STRING, description: 'Илгээх мессеж (монголоор)' } }, required: ['message'] }
    },
    {
        name: 'merge_customers',
        description: 'Давхардсан хоёр харилцагчийг нэгтгэх: duplicate-ийн лид/гэрээ/чат primary руу шилжээд duplicate устна. Баталгаажуулалт авна.',
        parameters: { type: SchemaType.OBJECT, properties: {
            primary_id: { type: SchemaType.STRING }, primary_name: { type: SchemaType.STRING }, primary_phone: { type: SchemaType.STRING },
            duplicate_id: { type: SchemaType.STRING }, duplicate_name: { type: SchemaType.STRING }, duplicate_phone: { type: SchemaType.STRING } } }
    },
    {
        name: 'log_marketing_spend',
        description: 'Маркетингийн зарцуулалт (билборд, радио, boost г.м.) гараар бүртгэх — төсвийн хяналтад орно. Баталгаажуулалт авна.',
        parameters: { type: SchemaType.OBJECT, properties: {
            amount: { type: SchemaType.NUMBER, description: 'Дүн ₮' },
            channel: { type: SchemaType.STRING, enum: Object.keys(SPEND_CHANNELS), description: 'Суваг' },
            spent_at: { type: SchemaType.STRING, description: 'YYYY-MM-DD (default өнөөдөр)' },
            note: { type: SchemaType.STRING } }, required: ['amount'] }
    },
    {
        name: 'set_marketing_budget',
        description: 'Сарын маркетингийн төсөв тавих/өөрчлөх (нэг сар эсвэл олон сар). Баталгаажуулалт авна.',
        parameters: { type: SchemaType.OBJECT, properties: {
            year: { type: SchemaType.NUMBER }, month: { type: SchemaType.NUMBER, description: '1–12' }, amount: { type: SchemaType.NUMBER, description: '₮' },
            months: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT, properties: { month: { type: SchemaType.NUMBER }, amount: { type: SchemaType.NUMBER } } }, description: 'Олон сар зэрэг' } } }
    },
    {
        name: 'add_market_indicator',
        description: 'Зах зээлийн үзүүлэлт (ипотекийн хүү, банкны нөхцөл, макро) гараар бүртгэх. Шууд гүйцэтгэгдэнэ.',
        parameters: { type: SchemaType.OBJECT, properties: {
            category: { type: SchemaType.STRING, enum: ['mortgage', 'bank', 'macro', 'other'] },
            name: { type: SchemaType.STRING, description: 'Үзүүлэлтийн нэр (жишээ: Хаан банк ипотек)' },
            value: { type: SchemaType.STRING, description: 'Утга (жишээ: 8%, 30 жил)' },
            note: { type: SchemaType.STRING }, source_url: { type: SchemaType.STRING }, recorded_at: { type: SchemaType.STRING, description: 'YYYY-MM-DD' } }, required: ['name', 'value'] }
    },
];



 
const deleteDefinitions: ToolDefinition[] = [
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

 
const adminDefinitions: ToolDefinition[] = [
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
                modules: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Эрх олгох модулиуд: dashboard, properties, leads, viewings, contracts, customers, customer-service, inbox, reports, reports-leads, erp-imports, finance (тайлангийн мөнгөн урсгал), marketing-roi, ai-assistant, ai-settings, settings' }
            },
            required: ['name', 'display_name_mn']
        }
    }
];

/** Бүх tool-ийн schema (нэр бүр `TOOL_CATALOG`-д бүртгэлтэй байх ёстой — тест шалгана). */
export const TOOL_DEFINITIONS: ToolDefinition[] = [...readDefinitions, ...writeDefinitions, ...deleteDefinitions, ...adminDefinitions];
