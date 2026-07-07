/**
 * Админ дата импортын цэвэр (side-effect-гүй) mapper функцүүд.
 *
 * /api/admin/import route эдгээрийг ашиглан CSV/Excel мөрүүдийг одоогийн
 * схемийн ЖИНХЭНЭ баганууд руу хөрвүүлнэ:
 *   - leads:              customer_name / customer_phone / customer_email / budget_max / notes / status(enum)
 *   - property_contracts: customer_name / unit_number / total_price / prepayment_paid / balance / contract_status
 *   - properties:         schema-тай шууд таарна (project_id-г route best-effort тамгална)
 *   - AI мэдлэг:          shops.custom_knowledge (JSONB) — PromptService.buildDynamicKnowledge уншдаг
 *   - FAQ:                shop_faqs — WebhookService.getAIFeatures уншдаг
 *
 * Бүх функц цэвэр тул __tests__/mappers.test.ts-д шууд тестлэгдэнэ.
 */

export type ImportRow = Record<string, unknown>;

export interface MappedRow<T> {
    data?: T;
    error?: string;
    /**
     * Файлд ҮНЭХЭЭР байсан баганаас гарсан талбарууд. Дахин импортын update
     * зам зөвхөн эдгээрийг бичнэ — эс бөгөөс дутуу баганатай файл (ж: зөвхөн
     * Нэр+Үнэ бүхий үнийн жагсаалт) одоо байгаа мөрийн тайлбар/статус зэргийг
     * default утгаар дарж устгана.
     */
    provided?: string[];
}

// ============================================
// ЕРӨНХИЙ ТУСЛАХУУД
// ============================================

export function getRaw(row: ImportRow, ...keys: string[]): unknown {
    for (const key of keys) {
        const v = row[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
}

export function getVal(row: ImportRow, ...keys: string[]): string {
    const v = getRaw(row, ...keys);
    return v === null ? '' : String(v).trim();
}

export function getNum(row: ImportRow, ...keys: string[]): number | null {
    const val = getVal(row, ...keys);
    if (!val) return null;
    const num = parseFloat(val.replace(/[,\s₮%]/g, ''));
    return isNaN(num) ? null : num;
}

/** INTEGER багана руу орох тоо — бутархайг бүхэлчилнэ (Postgres 2.5→int алдаа өгдөг) */
export function getInt(row: ImportRow, ...keys: string[]): number | null {
    const num = getNum(row, ...keys);
    return num === null ? null : Math.round(num);
}

/**
 * Хувь (%) утга. Excel "30%" гэж форматласан нүдийг SheetJS 0.3 гэсэн бутархай
 * болгож уншдаг тул (0,1] завсрын утгыг ×100 сэргээнэ — эс бөгөөс AI мэдлэгт
 * "Урьдчилгаа: 0.3%" гэж 100 дахин буруу хадгалагдана. Дээд хил 1-ийг
 * хамруулснаар "100%" форматтай нүд (raw=1.0) мөн зөв 100 болно.
 */
export function getPct(row: ImportRow, ...keys: string[]): number | null {
    const raw = getRaw(row, ...keys);
    if (typeof raw === 'number' && raw > 0 && raw <= 1) {
        return Math.round(raw * 10000) / 100;
    }
    return getNum(row, ...keys);
}

/**
 * Огноог YYYY-MM-DD болгоно. Excel-ийн Date обьект, serial тоо (cellDates
 * идэвхгүй үед), 'YYYY-MM-DD' / 'YYYY.MM.DD' / 'YYYY/MM/DD' текстийг дэмжинэ.
 */
function formatLocalDate(d: Date): string {
    // Локал огноог ашиглана — xlsx cellDates локал цагийн бүсээр Date үүсгэдэг тул
    // toISOString() UTC-гүй серверт өдрөө нэгээр гулсуулж болно.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function toDateStr(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
        return isNaN(v.getTime()) ? null : formatLocalDate(v);
    }
    if (typeof v === 'number') {
        // Excel serial (1900 систем): 25569 = 1970-01-01. UTC-ээр задална.
        if (v > 20000 && v < 80000) {
            return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
        }
        return null;
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
    if (m) {
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        // Муж шалгана — '2026.13.45' мэт хүчингүй огноо Postgres-д бүтэн batch унагадаг
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : formatLocalDate(parsed);
}

export function getDate(row: ImportRow, ...keys: string[]): string | null {
    return toDateStr(getRaw(row, ...keys));
}

function clamp(s: string | null, max: number): string | null {
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
}

/** Кирилл үсгийг хадгалж, түлхүүрт тохирсон slug гаргана: "Mandala Garden" → "mandala_garden" */
export function slugifyKey(input: string): string {
    const slug = String(input)
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    return slug || 'general';
}

/**
 * custom_knowledge-ийн түлхүүр: төслийн нэрээр угтварласан ("mandala_garden_payment").
 * ai_knowledge_base.key нь VARCHAR(100) тул 100 тэмдэгтэд клампдана.
 */
export function knowledgeKey(projectName: string | null | undefined, suffix: string): string {
    const name = (projectName || '').trim();
    const key = name ? `${slugifyKey(name)}_${suffix}` : suffix;
    return key.length > 100 ? key.slice(0, 100) : key;
}

/** Тийм/Yes утга эсэхийг шалгана */
export function isYes(val: string): boolean {
    const lower = val.toLowerCase().trim();
    return lower !== '' && lower !== 'үгүй' && lower !== 'no' && lower !== 'false' && lower !== '0';
}

/**
 * custom_knowledge доторх ХУУЧИРСАН давхар түлхүүрүүдийг олно.
 *
 * Асуудал: гар скрипт (scripts/import-project-knowledge.ts) 'mandala_payment'
 * маягийн БОГИНО угтвартай түлхүүр бичсэн байхад импорт 'mandala_garden_payment'
 * гэсэн каноник түлхүүр нэмбэл нэг сэдвээр хоёр зөрчилтэй блок DM AI-ийн
 * prompt-д зэрэг орно. Ийм түлхүүрийг (угтвар нь token-хамааралтай, ижил suffix)
 * илрүүлж устгуулна.
 *
 * Хамгаалалтууд:
 *   - patch-д багтсан (сая бичигдэж буй) түлхүүрийг ХЭЗЭЭ Ч устгахгүй —
 *     эс бөгөөс нэг файлд угтвар-хамааралтай хоёр төсөл байхад бие биенээ
 *     устгаж хоёулаа алга болно;
 *   - protectedPrefixes (projects хүснэгтийн жинхэнэ төслийн slug-ууд)-д
 *     байгаа угтвартай түлхүүрийг устгахгүй — 'Vista' ба 'Vista 2' гэсэн
 *     хоёр ТУСДАА төслийн мэдлэг бие биенийхээ импортод устахгүй.
 */
export function findStaleKnowledgeKeys(
    existingKeys: string[],
    patch: Record<string, string>,
    reconcile: Array<{ key: string; suffix: string }>,
    protectedPrefixes: Set<string>
): string[] {
    const stale = new Set<string>();
    for (const { key, suffix } of reconcile) {
        const sfx = `_${suffix}`;
        if (!key.endsWith(sfx)) continue; // төслийн угтваргүй түлхүүр — бусдад хүрэхгүй
        const newPrefix = key.slice(0, -sfx.length);
        for (const existingKey of existingKeys) {
            if (existingKey === key || existingKey in patch) continue;
            if (!existingKey.endsWith(sfx)) continue;
            const oldPrefix = existingKey.slice(0, -sfx.length);
            if (!oldPrefix || protectedPrefixes.has(oldPrefix)) continue;
            if (newPrefix.startsWith(`${oldPrefix}_`) || oldPrefix.startsWith(`${newPrefix}_`)) {
                stale.add(existingKey);
            }
        }
    }
    return [...stale];
}

// ============================================
// ENUM / СТАТУС MAPPING (схемийн жинхэнэ утгууд)
// ============================================

export function mapPropertyType(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'apartment': 'apartment', 'орон сууц': 'apartment', 'байр': 'apartment',
        'house': 'house', 'хаус': 'house', 'хашаа байшин': 'house',
        'office': 'office', 'оффис': 'office',
        'land': 'land', 'газар': 'land',
        'commercial': 'commercial', 'худалдааны': 'commercial',
    };
    return map[lower] || 'apartment';
}

export function mapPropertyStatus(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'available': 'available', 'боломжтой': 'available', 'чөлөөтэй': 'available',
        'зарагдаж байна': 'available', 'худалдаанд': 'available',
        'reserved': 'reserved', 'захиалсан': 'reserved', 'захиалагдсан': 'reserved', 'хадгалсан': 'reserved',
        'sold': 'sold', 'зарагдсан': 'sold', 'гэрээ баталгаажсан': 'sold',
        'rented': 'rented', 'түрээслэсэн': 'rented', 'түрээслэгдсэн': 'rented',
        'barter': 'barter', 'бартер': 'barter', 'солилцоо': 'barter',
    };
    return map[lower] || 'available';
}

/**
 * leads.status нь lead_status enum:
 * new | contacted | viewing_scheduled | offered | negotiating | closed_won | closed_lost
 * (өмнөх код 'qualified'/'won' гэх enum-д БАЙХГҮЙ утга үүсгэж импортыг унагадаг байсан.)
 */
export function mapLeadStatus(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'new': 'new', 'шинэ': 'new',
        'contacted': 'contacted', 'холбогдсон': 'contacted', 'холбоо барьсан': 'contacted',
        'viewing_scheduled': 'viewing_scheduled', 'үзэлт товлосон': 'viewing_scheduled', 'үзүүлэх': 'viewing_scheduled',
        'offered': 'offered', 'санал тавьсан': 'offered', 'санал өгсөн': 'offered',
        'qualified': 'offered', 'шалгарсан': 'offered',
        'negotiating': 'negotiating', 'negotiation': 'negotiating',
        'хэлэлцэж буй': 'negotiating', 'хэлэлцээр': 'negotiating', 'тохиролцож буй': 'negotiating',
        'closed_won': 'closed_won', 'won': 'closed_won', 'амжилттай': 'closed_won', 'гэрээ хийсэн': 'closed_won',
        'closed_lost': 'closed_lost', 'lost': 'closed_lost', 'алдсан': 'closed_lost',
        'буцсан': 'closed_lost', 'татгалзсан': 'closed_lost',
    };
    return map[lower] || 'new';
}

/**
 * property_contracts.contract_status — dashboard/contracts UI-ийн жинхэнэ утгууд:
 * active | closed | cancelled
 */
export function mapContractStatus(input: string): string {
    const lower = String(input).toLowerCase().trim();
    const map: Record<string, string> = {
        'active': 'active', 'идэвхтэй': 'active', 'хүчинтэй': 'active',
        'pending': 'active', 'хүлээгдэж буй': 'active',
        'closed': 'closed', 'completed': 'closed', 'дууссан': 'closed',
        'хаагдсан': 'closed', 'биелүүлсэн': 'closed', 'төлж дууссан': 'closed',
        'cancelled': 'cancelled', 'canceled': 'cancelled', 'цуцалсан': 'cancelled', 'цуцлагдсан': 'cancelled',
    };
    return map[lower] || 'active';
}

// ============================================
// PROPERTIES (properties хүснэгт — багана нэрс схемтэй таардаг)
// ============================================

export interface PropertyInsert {
    name: string;
    description: string | null;
    type: string;
    price: number;
    price_per_sqm: number | null;
    size_sqm: number | null;
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    floor: string | null;
    address: string | null;
    district: string | null;
    status: string;
    features: string[];
    is_active: boolean;
}

export function mapPropertyRow(row: ImportRow, rowNum: number): MappedRow<PropertyInsert> {
    const name = getVal(row, 'Нэр', 'name', 'Name', 'Байрны нэр', 'Байрны нэр/код', 'Код');
    const price = getNum(row, 'Үнэ', 'price', 'Price', 'Үнэ (₮)', 'Нийт борлуулах үнэ');

    if (!name) return { error: `Мөр ${rowNum}: Нэр хоосон` };
    if (!price || price <= 0) return { error: `Мөр ${rowNum}: Үнэ буруу (${name})` };

    const features: string[] = [];
    const block = getVal(row, 'Блок', 'block', 'Block');
    const direction = getVal(row, 'Чиглэл', 'direction', 'Зүг', 'Чиглэл (зүг)', 'Цонхны харагдац');
    const balcony = getVal(row, 'Тагт', 'Балкон', 'Тагт/Балкон', 'balcony');

    if (block) features.push(`Блок: ${block}`);
    if (direction) features.push(`Чиглэл: ${direction}`);
    if (balcony && isYes(balcony)) features.push(`Тагт/Балкон: ${balcony}`);

    const description = getVal(row, 'Тайлбар', 'description', 'Description') || null;
    const typeRaw = getVal(row, 'Төрөл', 'type', 'Type');
    const pricePerSqm = getNum(row, '1м² үнэ', '1м²-ийн үнэ', 'price_per_sqm', 'Борлуулалтын үнэ 1мкв');
    const sizeSqm = getNum(row, 'Талбай', 'Талбай (м²)', 'size_sqm', 'м²', 'Нийт талбай', 'Нийт талбай (м²)', 'Борлуулах талбай');
    const rooms = getInt(row, 'Өрөө', 'rooms', 'Rooms', 'Өрөөний тоо');
    const bedrooms = getInt(row, 'Унтлагын өрөө', 'bedrooms');
    const bathrooms = getInt(row, 'Угаалгын өрөө', 'bathrooms');
    const floor = clamp(getVal(row, 'Давхар', 'floor', 'Floor') || null, 20);
    const address = getVal(row, 'Хаяг', 'address', 'Address') || null;
    const district = clamp(getVal(row, 'Дүүрэг', 'district', 'District') || null, 100);
    const statusRaw = getVal(row, 'Статус', 'status', 'Status');

    const provided = ['name', 'price'];
    if (description) provided.push('description');
    if (typeRaw) provided.push('type');
    if (pricePerSqm !== null) provided.push('price_per_sqm');
    if (sizeSqm !== null) provided.push('size_sqm');
    if (rooms !== null) provided.push('rooms');
    if (bedrooms !== null) provided.push('bedrooms');
    if (bathrooms !== null) provided.push('bathrooms');
    if (floor) provided.push('floor');
    if (address) provided.push('address');
    if (district) provided.push('district');
    if (statusRaw) provided.push('status');
    if (features.length > 0) provided.push('features');

    return {
        data: {
            name: clamp(name, 255) as string,
            description,
            type: mapPropertyType(typeRaw || 'apartment'),
            price,
            price_per_sqm: pricePerSqm,
            size_sqm: sizeSqm,
            rooms,
            bedrooms,
            bathrooms,
            floor,
            address,
            district,
            status: mapPropertyStatus(statusRaw || 'available'),
            features,
            is_active: true,
        },
        provided,
    };
}

// ============================================
// LEADS (leads хүснэгтийн ЖИНХЭНЭ баганууд)
// ============================================

export interface LeadInsert {
    customer_name: string;
    customer_phone: string;
    customer_email: string | null;
    budget_max: number | null;
    source: string | null;
    notes: string | null;
    status: string;
}

export function mapLeadRow(row: ImportRow, rowNum: number): MappedRow<LeadInsert> {
    const name = getVal(row, 'Нэр', 'name', 'Name');
    const phone = getVal(row, 'Утас', 'phone', 'Phone', 'Утасны дугаар');

    if (!name) return { error: `Мөр ${rowNum}: Нэр хоосон` };
    if (!phone) return { error: `Мөр ${rowNum}: Утас хоосон (${name})` };

    const interestedIn = getVal(row, 'Сонирхож буй', 'interested_in', 'Interested In', 'Сонирхол');
    const notes = getVal(row, 'Тэмдэглэл', 'notes', 'Notes', 'Нэмэлт');
    const composedNotes = [
        interestedIn ? `Сонирхож буй: ${interestedIn}` : null,
        notes || null,
    ].filter(Boolean).join('\n') || null;

    return {
        data: {
            customer_name: clamp(name, 255) as string,
            customer_phone: clamp(phone, 50) as string,
            customer_email: clamp(getVal(row, 'Имэйл', 'email', 'Email') || null, 255),
            budget_max: getNum(row, 'Төсөв', 'budget', 'Budget'),
            source: clamp(getVal(row, 'Эх сурвалж', 'source', 'Source') || 'import', 50),
            notes: composedNotes,
            status: mapLeadStatus(getVal(row, 'Статус', 'status', 'Status') || 'new'),
        },
    };
}

/** Утасны дугаарыг давхардал шалгахад ашиглах хэлбэрт оруулна (зөвхөн цифр) */
export function normalizePhoneKey(phone: string): string {
    return phone.replace(/\D/g, '');
}

// ============================================
// CONTRACTS (property_contracts хүснэгтийн ЖИНХЭНЭ баганууд)
// ============================================

export interface ContractInsert {
    contract_number: string;
    customer_name: string;
    customer_phone: string | null;
    block_name: string | null;
    unit_number: string | null;
    total_price: number;
    prepayment_paid: number | null;
    paid_amount: number;
    balance: number;
    contract_date: string | null;
    contract_status: string;
    product_type: string;
    notes: string | null;
}

export function mapContractRow(row: ImportRow, rowNum: number): MappedRow<ContractInsert> {
    const contractNumber = getVal(row, 'Гэрээний дугаар', 'contract_number', 'Contract Number', 'Дугаар');
    const buyerName = getVal(row, 'Худалдан авагч', 'buyer_name', 'Buyer', 'Авагч');
    const unitName = getVal(row, 'Байрны нэр', 'property_name', 'Property', 'Байр', 'Тоот');
    const totalPrice = getNum(row, 'Нийт үнэ', 'total_price', 'Price', 'Үнэ');

    if (!contractNumber) return { error: `Мөр ${rowNum}: Гэрээний дугаар хоосон` };
    if (!buyerName) return { error: `Мөр ${rowNum}: Худалдан авагч хоосон (${contractNumber})` };
    if (!unitName) return { error: `Мөр ${rowNum}: Байрны нэр хоосон (${contractNumber})` };
    if (!totalPrice || totalPrice <= 0) return { error: `Мөр ${rowNum}: Нийт үнэ буруу (${contractNumber})` };

    const downPayment = getNum(row, 'Урьдчилгаа', 'down_payment', 'Down Payment');
    // Сөрөг урьдчилгаа chk_contracts_paid_amount_nonneg CHECK-ийг зөрчиж бүтэн batch унагана
    if (downPayment !== null && downPayment < 0) {
        return { error: `Мөр ${rowNum}: Урьдчилгаа сөрөг байж болохгүй (${contractNumber})` };
    }

    const phone = clamp(getVal(row, 'Худалдан авагч утас', 'buyer_phone', 'Phone', 'Утас') || null, 50);
    const blockName = clamp(getVal(row, 'Блок', 'block', 'Block') || null, 255);
    const contractDate = getDate(row, 'Гэрээний огноо', 'contract_date', 'Date');
    const statusRaw = getVal(row, 'Статус', 'status', 'Status');
    const notes = getVal(row, 'Тэмдэглэл', 'notes', 'Notes') || null;

    const provided = ['contract_number', 'customer_name', 'unit_number', 'total_price'];
    if (phone) provided.push('customer_phone');
    if (blockName) provided.push('block_name');
    if (downPayment !== null) provided.push('prepayment_paid', 'paid_amount', 'balance');
    if (contractDate) provided.push('contract_date');
    if (statusRaw) provided.push('contract_status');
    if (notes) provided.push('notes');

    return {
        data: {
            contract_number: clamp(contractNumber, 100) as string,
            customer_name: clamp(buyerName, 255) as string,
            customer_phone: phone,
            block_name: blockName,
            unit_number: clamp(unitName, 50),
            total_price: totalPrice,
            prepayment_paid: downPayment,
            paid_amount: downPayment ?? 0,
            balance: downPayment ? totalPrice - downPayment : totalPrice,
            contract_date: contractDate,
            contract_status: mapContractStatus(statusRaw || 'active'),
            product_type: 'residential',
            notes,
        },
        provided,
    };
}

// ============================================
// FAQ (shop_faqs хүснэгт — question/answer)
// ============================================

export interface FaqInsert {
    question: string;
    answer: string;
}

export function mapFaqRow(row: ImportRow, rowNum: number): MappedRow<FaqInsert> {
    const question = getVal(row, 'Асуулт', 'question', 'Question', 'Гарчиг');
    const answer = getVal(row, 'Хариулт', 'answer', 'Answer', 'Агуулга');
    if (!question || !answer) return { error: `Мөр ${rowNum}: Асуулт эсвэл хариулт хоосон` };
    return { data: { question, answer } };
}

// ============================================
// AI МЭДЛЭГ — shops.custom_knowledge-д орох ТЕКСТ бүтээгчид
// (PromptService.buildDynamicKnowledge нь key бүрийг "### key\nvalue"
//  хэлбэрээр prompt-д оруулдаг тул хүн уншихаар текст үүсгэнэ.)
// ============================================

function joinLines(pairs: Array<[string, string]>): string {
    return pairs
        .filter(([, v]) => v !== '')
        .map(([label, v]) => `${label}: ${v}`)
        .join('\n');
}

/** Компанийн ерөнхий мэдээлэл → нэг текст блок */
export function buildCompanyKnowledge(row: ImportRow): string {
    return joinLines([
        ['Компанийн нэр', getVal(row, 'Компанийн бүтэн нэр', 'Төслийн бүтэн нэр', 'Нэр', 'Company Name', 'name')],
        ['Үүсгэн байгуулагдсан он', getVal(row, 'Үүсгэн байгуулагдсан он', 'Founded', 'Он')],
        ['Утас', getVal(row, 'Утас', 'Phone', 'Утас (төсөл)', 'Утас (компани)')],
        ['Имэйл', getVal(row, 'Имэйл', 'Email')],
        ['Вэбсайт', getVal(row, 'Вэбсайт', 'Website')],
        ['Хаяг', getVal(row, 'Хаяг', 'Address', 'Хаяг (оффис)')],
        ['Facebook', getVal(row, 'Facebook хуудас', 'Facebook', 'FB')],
        ['Instagram', getVal(row, 'Instagram хуудас', 'Instagram', 'IG')],
        ['Танилцуулга', getVal(row, 'Компанийн товч танилцуулга', 'Төслийн товч танилцуулга', 'Description', 'Тайлбар')],
        ['Нийт барьсан төслийн тоо', getVal(row, 'Нийт барьсан төслийн тоо', 'Projects', 'Төслийн тоо')],
    ]);
}

export interface ProjectKnowledge {
    name: string;
    text: string;
    /** projects хүснэгтэд upsert хийх талбарууд */
    projectFields: {
        name: string;
        location: string | null;
        district: string | null;
        total_blocks: number | null;
        total_floors: string | null;
        total_units: number | null;
        description: string | null;
    };
}

/** Төслийн мэдээлэл → текст блок + projects хүснэгтийн талбарууд */
export function buildProjectKnowledge(row: ImportRow, rowNum: number): MappedRow<ProjectKnowledge> {
    const name = getVal(row, 'Төслийн нэр', 'Нэр', 'Project Name', 'name');
    if (!name) return { error: `Мөр ${rowNum}: Төслийн нэр хоосон` };

    const location = getVal(row, 'Байршил', 'Location');
    const district = getVal(row, 'Дүүрэг', 'District');
    const totalBlocks = getInt(row, 'Нийт блокийн тоо', 'Blocks', 'Нийт блок');
    const totalFloors = getVal(row, 'Нийт давхарын тоо', 'Нийт давхар', 'Floors', 'Давхарын тоо');
    const totalUnits = getInt(row, 'Нийт байрны тоо', 'Units', 'Нийт байр');
    const description = getVal(row, 'Төслийн тайлбар', 'Description', 'Тайлбар');

    const text = joinLines([
        ['Төслийн нэр', name],
        ['Байршил', location],
        ['Дүүрэг', district],
        ['GPS', getVal(row, 'GPS координат', 'GPS', 'GPS координат (lat, lng)')],
        ['Нийт блок', totalBlocks !== null ? String(totalBlocks) : ''],
        ['Нийт давхар', totalFloors],
        ['Нийт байр', totalUnits !== null ? String(totalUnits) : ''],
        ['Барилга эхэлсэн', getDate(row, 'Баригдаж эхэлсэн огноо', 'Start Date', 'Барилга эхэлсэн') || getVal(row, 'Баригдаж эхэлсэн огноо', 'Start Date', 'Барилга эхэлсэн')],
        ['Хүлээлгэж өгөх огноо', getDate(row, 'Хүлээлгэж өгөх огноо', 'Delivery Date', 'Хүлээлгэх огноо') || getVal(row, 'Хүлээлгэж өгөх огноо', 'Delivery Date', 'Хүлээлгэх огноо')],
        ['Барилгын явц', (() => { const p = getPct(row, 'Барилгын явц', 'Барилгын явц (%)', 'Progress'); return p !== null ? `${p}%` : ''; })()],
        ['Тайлбар', description],
    ]);

    return {
        data: {
            name,
            text,
            projectFields: {
                name,
                location: location || null,
                district: district || null,
                total_blocks: totalBlocks,
                total_floors: totalFloors || null,
                total_units: totalUnits,
                description: description || null,
            },
        },
    };
}

/** Төлбөрийн бодлого → төсөл тус бүрд нэг текст блок */
export function buildPaymentPolicyKnowledge(row: ImportRow): { project: string; text: string } {
    const project = getVal(row, 'Төсөл', 'Project', 'Нэр');
    const downPct = getPct(row, 'Урьдчилгаа', 'Урьдчилгаа (%)', 'Down Payment');
    const cashPct = getPct(row, 'Бэлнээр хөнгөлөлт', 'Бэлнээр хөнгөлөлт (%)', 'Cash Discount');
    const vipPct = getPct(row, 'VIP хөнгөлөлт', 'VIP хөнгөлөлт (%)', 'VIP Discount');

    const text = joinLines([
        ['Урьдчилгаа', downPct !== null ? `${downPct}%` : ''],
        // "Хөсөчилсөн/Хасагчлэх" нь өмнөх хувилбарын бичихдээ алдсан толгой мөрүүд — alias болгон дэмжсээр байна
        ['Хэсэгчилсэн төлбөр', getVal(row, 'Хэсэгчилсэн төлбөр', 'Хөсөчилсөн төлбөр', 'Installment')],
        ['Хэсэгчлэх хугацаа', getVal(row, 'Хэсэгчлэх хугацаа', 'Хөсөчлөх хугацаа', 'Хасагчлэх хугацаа', 'Months')],
        ['Бэлнээр хөнгөлөлт', cashPct !== null ? `${cashPct}%` : ''],
        ['VIP хөнгөлөлт', vipPct !== null ? `${vipPct}%` : ''],
        ['Эрт захиалгын хөнгөлөлт', getVal(row, 'Эрт захиалгын хөнгөлөлт', 'Early Booking')],
    ]);

    return { project, text };
}

/** Зээлийн мэдээлэл → нэг текст блок */
export function buildLoanKnowledge(row: ImportRow): string {
    return joinLines([
        ['Хамтрагч банкууд', getVal(row, 'Хамтрагч банкууд', 'Banks', 'Банк')],
        ['Зээлийн хүү', getVal(row, 'Зээлийн хүү', 'Зээлийн хүү (жилийн)', 'Interest Rate')],
        ['Зээлийн хугацаа', getVal(row, 'Зээлийн хугацаа', 'Зээлийн хугацаа (жил)', 'Loan Term')],
        ['"8% зээл" хөтөлбөр', getVal(row, '"8% зээл" хөтөлбөр', '8% зээл хөтөлбөр', '8% зээл', '8% Program')],
        ['Бусад хөтөлбөр', getVal(row, 'Бусад хөтөлбөр', 'Ажоны байр хөтөлбөр', 'Apartment Subsidy')],
        ['Шаардлагатай бичиг баримт', getVal(row, 'Шаардлагатай бичиг баримт', 'Documents', 'Бичиг баримт')],
    ]);
}

/** Тохилог/Онцлог → төслөөр бүлэглэсэн жагсаалт */
export function buildAmenitiesKnowledge(rows: ImportRow[]): Map<string, string[]> {
    const byProject = new Map<string, string[]>();
    for (const row of rows) {
        const project = getVal(row, 'Төсөл', 'Project', 'Нэр');
        const amenity = getVal(row, 'Онцлог', 'Amenity', 'Онцлог бий юу?');
        const available = getVal(row, 'Тийм/Үгүй', 'Available', 'Тийм', 'Байгаа эсэх');
        const detail = getVal(row, 'Дэлгэрэнгүй', 'Detail', 'Тайлбар');

        if (!amenity || (available && !isYes(available))) continue;

        const key = project || '';
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(detail ? `${amenity} (${detail})` : amenity);
    }
    return byProject;
}

export interface AiExtraEntry {
    key: string;
    label: string;
    value: string;
}

/** AI нэмэлт мэдээлэл → мөр бүр нэг key/value */
export function buildAiExtraEntries(rows: ImportRow[]): { entries: AiExtraEntry[]; errors: string[] } {
    const entries: AiExtraEntry[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const label = getVal(row, 'Мэдээлэл', 'Түлхүүр', 'Key', 'key');
        const value = getVal(row, 'Утга', 'Бөглөх', 'Value', 'value');

        if (!label) { errors.push(`Мөр ${rowNum}: Мэдээллийн нэр хоосон`); continue; }
        if (!value) { errors.push(`Мөр ${rowNum}: Утга хоосон (${label})`); continue; }

        entries.push({ key: slugifyKey(label), label, value });
    }

    return { entries, errors };
}
